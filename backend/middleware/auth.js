"use strict";
const { mongoose } = require("../config/db");
const AppError = require("../utils/AppError");
const { hashToken } = require("../utils/tokens");
const { COOKIE_NAME, parseCookies } = require("../utils/cookies");
const Session = require("../models/Session");
const User = require("../models/User");
const { logEvent } = require("../services/securityLog");

const UNAUTH = () => new AppError(401, "Please sign in.");

// Loads the session AND the user from the database on every request, so logout, expiry,
// deactivation and role changes all take effect immediately.
function requireAuth(cfg) {
  return async (req, _res, next) => {
    try {
      const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
      if (!token || typeof token !== "string" || token.length > 100) throw UNAUTH();

      const session = await Session.findOne({ tokenHash: hashToken(token) });
      if (!session) throw UNAUTH();

      const now = Date.now();
      const idleExpired = now - session.lastSeenAt.getTime() > cfg.sessionIdleMs;
      if (idleExpired || session.expiresAt.getTime() <= now) {
        await Session.deleteOne({ _id: session._id });
        throw UNAUTH();
      }

      const user = await User.findById(session.userId);
      if (!user || !user.active) {
        await Session.deleteOne({ _id: session._id });
        throw UNAUTH();
      }

      // Refresh the idle timer at most once a minute to avoid a write on every request.
      if (now - session.lastSeenAt.getTime() > 60 * 1000) {
        await Session.updateOne({ _id: session._id }, { lastSeenAt: new Date(now) });
      }
      req.user = user;
      req.session = session;
      next();
    } catch (e) { next(e); }
  };
}

// Use after requireAuth. Wrong role -> 403 and a security-log entry.
function requireRole(...roles) {
  return async (req, _res, next) => {
    if (!req.user) return next(UNAUTH());
    if (!roles.includes(req.user.role)) {
      await logEvent(req, "role_denied", {
        userId: req.user._id,
        entityType: "Route",
        entityId: `${req.baseUrl}${req.path}`,
        outcome: "denied",
        email: req.user.email,
        detail: `${req.method} ${req.baseUrl}${req.path} needs ${roles.join("/")}`,
      });
      return next(new AppError(403, "You do not have permission to do that."));
    }
    next();
  };
}

const isValidId = (id) => typeof id === "string" && mongoose.isValidObjectId(id);

module.exports = { requireAuth, requireRole, isValidId };
