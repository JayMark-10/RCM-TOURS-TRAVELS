
"use strict";

const AppError = require("../utils/AppError");
const v = require("../utils/validate");
const { newToken, hashToken } = require("../utils/tokens");
const { isValidId } = require("../middleware/auth");
const Invitation = require("../models/Invitation");
const { logEvent } = require("../services/securityLog");

function dto(invitation) {
  return {
    id: String(invitation._id),
    role: invitation.role,
    email: invitation.email,
    createdBy: String(invitation.createdBy),
    createdAt: invitation.createdAt,
    expiresAt: invitation.expiresAt,
    status: invitation.revokedAt
      ? "revoked"
      : invitation.usedAt
        ? "used"
        : invitation.expiresAt <= new Date()
          ? "expired"
          : "active",
  };
}

function create(cfg) {
  return async (req, res) => {
    const body = v.body(req);

    // Invitations can only create Staff accounts.
    const role = v.oneOf(body.role, "role", ["staff"]);

    const email =
      body.email === undefined || body.email === ""
        ? null
        : v.email(body.email);

    const key = newToken();
    const now = Date.now();

    const expiresAt = new Date(now + cfg.staffKeyMs);

    const invitation = await Invitation.create({
      keyHash: hashToken(key),
      role,
      email,
      createdBy: req.user._id,
      expiresAt,
      purgeAt: new Date(
        expiresAt.getTime() + 90 * 24 * 60 * 60 * 1000
      ),
    });

    await logEvent(req, "key_issued", {
      userId: req.user._id,
      entityType: "Invitation",
      entityId: invitation._id,
      context: { role, emailBound: Boolean(email), expiresAt: expiresAt.toISOString() },
      email: req.user.email,
      detail: `role ${role}${email ? " bound to email" : ""}`,
    });

    // Return the plain key only once. Never store or log it.
    res.status(201).json({
      invitation: dto(invitation),
      key,
    });
  };
}

function list() {
  return async (_req, res) => {
    const invitations = await Invitation.find()
      .sort({ createdAt: -1 })
      .limit(200);

    res.json({
      invitations: invitations.map(dto),
    });
  };
}

function revoke() {
  return async (req, res) => {
    if (!isValidId(req.params.id)) {
      throw new AppError(404, "Not found.");
    }

    const invitation = await Invitation.findOneAndUpdate(
      {
        _id: req.params.id,
        usedAt: null,
        revokedAt: null,
      },
      {
        revokedAt: new Date(),
      },
      {
        returnDocument: "after",
      }
    );

    if (!invitation) {
      throw new AppError(404, "Not found.");
    }

    await logEvent(req, "key_revoked", {
      userId: req.user._id,
      entityType: "Invitation",
      entityId: invitation._id,
      email: req.user.email,
      detail: `invitation ${invitation._id}`,
    });

    res.json({
      invitation: dto(invitation),
    });
  };
}

module.exports = {
  create,
  list,
  revoke,
};
