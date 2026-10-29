
"use strict";

const bcrypt = require("bcryptjs");
const { mongoose } = require("../config/db");
const AppError = require("../utils/AppError");
const v = require("../utils/validate");
const { newToken, hashToken } = require("../utils/tokens");
const {
  COOKIE_NAME,
  parseCookies,
  cookieOptions,
} = require("../utils/cookies");

const User = require("../models/User");
const Session = require("../models/Session");
const Invitation = require("../models/Invitation");
const SystemSetting = require("../models/SystemSetting");
const { logEvent } = require("../services/securityLog");
const { sendActivationCode } = require("../services/email");

const BAD_LOGIN = "Invalid email or password.";
const ACTIVATION_MESSAGE = "If eligible, an activation code can be delivered when email service is available.";

function requestActivationCode(cfg) {
  return async (req, res) => {
    const body = v.body(req);
    const email = v.email(body.email);
    const user = await User.findOne({ email, role: "customer", active: true })
      .select("+passwordHash +activationCodeRequestedAt");
    const now = Date.now();

    if (!user || user.passwordHash || (user.activationCodeRequestedAt && now - user.activationCodeRequestedAt.getTime() < 60_000)) {
      return res.status(202).json({ message: ACTIVATION_MESSAGE });
    }

    const requestedAt = new Date(now);
    const eligible = await User.findOneAndUpdate(
      {
        _id: user._id,
        role: "customer",
        active: true,
        passwordHash: null,
        $or: [
          { activationCodeRequestedAt: null },
          { activationCodeRequestedAt: mongoose.trusted({ $lt: new Date(now - 60_000) }) },
        ],
      },
      { $set: { activationCodeRequestedAt: requestedAt, activationCodeAttempts: 0 } },
      { returnDocument: "after" },
    );
    if (!eligible) return res.status(202).json({ message: ACTIVATION_MESSAGE });

    const code = String(require("crypto").randomInt(100000, 1000000));
    const stored = await User.updateOne(
      { _id: user._id, activationCodeRequestedAt: requestedAt, passwordHash: null },
      { $set: { activationTokenHash: hashToken(code), activationTokenExpiresAt: new Date(now + 10 * 60_000) } },
    );
    const sent = stored.modifiedCount === 1 && await sendActivationCode(cfg, email, code).catch(() => false);
    if (!sent) {
      await User.updateOne({ _id: user._id, activationCodeRequestedAt: requestedAt }, { $unset: { activationTokenHash: 1, activationTokenExpiresAt: 1 } });
      return res.status(202).json({ message: ACTIVATION_MESSAGE });
    }
    await logEvent(req, "customer_activation_code_sent", { userId: user._id });
    return res.status(202).json({ message: ACTIVATION_MESSAGE });
  };
}

// Dummy hash helps protect against timing differences when
// someone attempts to log in with an unknown email.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 12);

async function startSession(req, res, cfg, user) {
  const token = newToken();

  await Session.create({
    tokenHash: hashToken(token),
    userId: user._id,
    expiresAt: new Date(Date.now() + cfg.sessionAbsoluteMs),
    ip: req.ip || "",
    userAgent: String(req.get("user-agent") || "").slice(0, 200),
  });

  res.cookie(
    COOKIE_NAME,
    token,
    cookieOptions(cfg, cfg.sessionAbsoluteMs)
  );
}

function login(cfg) {
  return async (req, res) => {
    const b = v.body(req);
    const email = v.email(b.email);

    // The database determines the user's role.
    if (
      typeof b.password !== "string" ||
      b.password.length < 1 ||
      b.password.length > 200
    ) {
      throw new AppError(400, BAD_LOGIN);
    }

    const user = await User.findOne({ email }).select("+passwordHash");
    const now = Date.now();

    if (user && user.lockUntil && user.lockUntil.getTime() > now) {
      await logEvent(req, "login_blocked_locked", {
        actorName: "Unauthenticated",
        actorRole: "anonymous",
        category: "security",
        entityType: "User",
        entityId: user._id,
        outcome: "failure",
        context: { reason: "account_locked" },
        email,
      });

      throw new AppError(
        429,
        "Too many failed attempts. Try again later."
      );
    }

    const hash =
      user && user.passwordHash
        ? user.passwordHash
        : DUMMY_HASH;

    const passwordOk = await bcrypt.compare(b.password, hash);

    if (!user || !user.passwordHash || !passwordOk) {
      if (user && user.passwordHash) {
        const failed = (user.failedLogins || 0) + 1;
        const lock = failed >= cfg.maxFailedLogins;

        await User.updateOne(
          { _id: user._id },
          {
            failedLogins: lock ? 0 : failed,
            lockUntil: lock
              ? new Date(now + cfg.lockoutMs)
              : null,
          }
        );

        if (lock) {
          await logEvent(req, "account_locked", {
            actorName: "Unauthenticated",
            actorRole: "anonymous",
            category: "security",
            entityType: "User",
            entityId: user._id,
            outcome: "failure",
            context: { reason: "failed_login_limit" },
            email,
          });
        }
      }

      await logEvent(req, "login_failed", {
        actorName: "Unauthenticated",
        actorRole: "anonymous",
        category: "security",
        entityType: "User",
        entityId: user?._id || "",
        outcome: "failure",
        context: { reason: "bad_credentials" },
        email,
        detail: "Login failed",
      });

      throw new AppError(401, BAD_LOGIN);
    }

    if (!user.active) {
      await logEvent(req, "login_failed", {
        actorName: "Unauthenticated",
        actorRole: "anonymous",
        category: "security",
        entityType: "User",
        entityId: user._id,
        outcome: "failure",
        context: { reason: "inactive_account" },
        email,
        detail: "inactive account",
      });

      throw new AppError(401, BAD_LOGIN);
    }

    await User.updateOne(
      { _id: user._id },
      {
        failedLogins: 0,
        lockUntil: null,
      }
    );

    await startSession(req, res, cfg, user);

    await logEvent(req, "login_success", {
      userId: user._id,
      actorName: user.name,
      actorRole: user.role,
      category: "security",
      entityType: "User",
      entityId: user._id,
      outcome: "success",
      email,
    });

    res.json({
      user: user.toPublic(),
    });
  };
}

function logout(cfg) {
  return async (req, res) => {
    const token = parseCookies(req.headers.cookie)[COOKIE_NAME];

    if (token && typeof token === "string") {
      const session = await Session.findOneAndDelete({
        tokenHash: hashToken(token),
      });

      if (session) {
        const user = await User.findById(session.userId).select("name role").lean();
        await logEvent(req, "logout", {
          userId: session.userId,
          actorName: user?.name || "",
          actorRole: user?.role || "system",
          category: "security",
          entityType: "User",
          entityId: session.userId,
          outcome: "success",
        });
      }
    }

    const { maxAge, ...options } = cookieOptions(cfg);

    res.clearCookie(COOKIE_NAME, options);

    res.json({ ok: true });
  };
}

const me = () => (req, res) => {
  res.json({
    user: req.user.toPublic(),
  });
};

function register(cfg) {
  return async (req, res) => {
    const b = v.body(req);

    const email = v.email(b.email);
    const password = v.newPassword(b.password);
    const activationToken = b.activationToken === undefined
      ? null
      : v.text(b.activationToken, "activationToken", {
          max: 100,
          label: "Activation code",
        });

    if (b.consent !== true) {
      throw new AppError(
        400,
        "You must accept the privacy notice.",
        { consent: "Required." }
      );
    }

    const now = new Date();

    if (activationToken !== null) {
      if (b.key !== undefined && b.key !== "") {
        throw new AppError(400, "Unable to activate an account with these details.");
      }

      const activationUser = await User.findOne({ email, role: "customer", active: true })
        .select("+passwordHash +activationTokenHash +activationTokenExpiresAt +activationCodeAttempts");
      if (activationUser && !activationUser.passwordHash && activationUser.activationTokenHash && activationUser.activationTokenExpiresAt > now && hashToken(activationToken) !== activationUser.activationTokenHash) {
        const updatedAttempts = await User.findOneAndUpdate(
          { _id: activationUser._id, activationTokenHash: activationUser.activationTokenHash, activationCodeAttempts: mongoose.trusted({ $lt: 5 }) },
          { $inc: { activationCodeAttempts: 1 } },
          { returnDocument: "after" },
        ).select("+activationCodeAttempts");
        if (updatedAttempts?.activationCodeAttempts >= 5) {
          await User.updateOne({ _id: activationUser._id, activationTokenHash: activationUser.activationTokenHash }, { $unset: { activationTokenHash: 1, activationTokenExpiresAt: 1 } });
        }
      }
      const activationFilter = {
        email,
        role: "customer",
        active: true,
        passwordHash: null,
        activationTokenHash: hashToken(activationToken),
        activationTokenExpiresAt: mongoose.trusted({ $gt: now }),
        activationCodeAttempts: mongoose.trusted({ $lt: 5 }),
      };
      if (!(await User.exists(activationFilter))) {
        await logEvent(req, "customer_activation_failed", {
          email,
          detail: "invalid or expired activation code",
        });
        throw new AppError(409, "Unable to activate an account with these details.");
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const user = await User.findOneAndUpdate(
        activationFilter,
        {
          $set: { passwordHash, consentAt: now },
          $unset: {
            activationTokenHash: 1,
            activationTokenExpiresAt: 1,
            activationCodeRequestedAt: 1,
            activationCodeAttempts: 1,
          },
        },
        { returnDocument: "after" }
      );

      if (!user) {
        await logEvent(req, "customer_activation_failed", {
          email,
          detail: "invalid or expired activation code",
        });
        throw new AppError(409, "Unable to activate an account with these details.");
      }

      await startSession(req, res, cfg, user);
      await logEvent(req, "customer_account_activated", {
        userId: user._id,
        email,
      });

      return res.status(200).json({ user: user.toPublic() });
    }

    const name = v.fullName(b.name, "name", {
      max: 120,
      label: "Full name",
    });

    // Only a currently valid Staff invitation permits the Staff phone rules.
    // Falsy or absent keys are customer registrations; invalid keys are
    // rejected rather than falling back to customer registration.
    let invitation = null;
    if (b.key) {
      const key = v.text(b.key, "key", {
        max: 100,
        label: "Invitation key",
      });
      const keyHash = hashToken(key);
      invitation = await Invitation.findOne({ keyHash });

      if (
        !invitation ||
        invitation.role !== "staff" ||
        invitation.usedAt ||
        invitation.revokedAt ||
        !invitation.expiresAt ||
        invitation.expiresAt <= now ||
        (invitation.email && invitation.email !== email)
      ) {
        await logEvent(req, "key_rejected", {
          email,
          detail: "invalid staff invitation or email mismatch",
        });

        throw new AppError(400, "This Staff invitation is not valid.");
      }
    }

    const isStaffRegistration = Boolean(invitation);
    const phone =
      b.phone === undefined || b.phone === ""
        ? ""
        : isStaffRegistration
          ? v.text(b.phone, "phone", { max: 40, label: "Phone" })
          : v.philippineMobile(b.phone, "phone");

    if (!isStaffRegistration) {
      const settings = await SystemSetting.findOne({ key: "global" }).select("allowRegistration").lean();
      if (settings?.allowRegistration === false) {
        throw new AppError(403, "New customer registration is currently closed.");
      }
    }

    // Public registration always creates customer accounts.
    // Client-supplied role, active, and canAssign values are ignored.
    let role = "customer";
    let claimedInvitation = null;

    // Invitation keys are optional and reserved for Staff accounts.
    // Customer registration never requires an invitation key.
    if (isStaffRegistration) {
      // Redeem the invitation atomically so it cannot be used twice.
      claimedInvitation = await Invitation.findOneAndUpdate(
        {
          _id: invitation._id,
          role: "staff",
          usedAt: null,
          revokedAt: null,
          expiresAt: mongoose.trusted({ $gt: now }),
          ...(invitation.email ? { email } : {}),
        },
        {
          usedAt: now,
        },
        {
          returnDocument: "after",
        }
      );

      if (!claimedInvitation) {
        await logEvent(req, "key_rejected", {
          email,
          detail: "already used or redemption race",
        });

        throw new AppError(
          400,
          "This Staff invitation is not valid."
        );
      }

      // The database invitation determines the role.
      // The request body cannot assign a role.
      role = "staff";
    }

    try {
      // Never overwrite an existing online account or claim
      // a walk-in record using email alone.
      const existingUser = await User.findOne({ email });

      if (existingUser) {
        throw new AppError(
          409,
          "Unable to register with these details."
        );
      }

      const passwordHash = await bcrypt.hash(password, 12);

      const user = await User.create({
        name,
        email,
        passwordHash,
        role,
        phone,
        consentAt: now,
      });

      if (claimedInvitation) {
        await Invitation.updateOne(
          {
            _id: claimedInvitation._id,
            usedAt: claimedInvitation.usedAt,
          },
          {
            $set: { usedBy: user._id },
          }
        );

        await logEvent(req, "key_used", {
          userId: user._id,
          email,
          detail: "role staff",
        });
      }

      await startSession(req, res, cfg, user);

      res.status(201).json({
        user: user.toPublic(),
      });
    } catch (error) {
      // Release an invitation only if no account was assigned
      // to it. Do not reset an invitation used by another request.
      if (claimedInvitation) {
        await Invitation.updateOne(
          {
            _id: claimedInvitation._id,
            usedAt: claimedInvitation.usedAt,
            usedBy: null,
          },
          {
            $set: { usedAt: null },
          }
        );
      }

      if (
        error &&
        (error.code === 11000 || error.code === 11001)
      ) {
        throw new AppError(
          409,
          "Unable to register with these details."
        );
      }

      throw error;
    }
  };
}

module.exports = {
  login,
  logout,
  me,
  register,
  requestActivationCode,
};
