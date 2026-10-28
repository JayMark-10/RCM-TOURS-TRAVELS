"use strict";
const SecurityEvent = require("../models/SecurityEvent");

const SECURITY_EVENT_TYPES = new Set([
  "account_locked",
  "customer_activation_failed",
  "key_rejected",
  "login_blocked_locked",
  "login_failed",
  "login_success",
  "logout",
  "request_assignment_denied",
  "role_denied",
]);

const OUTCOMES = new Set(["success", "failure", "denied", "rejected"]);

// Audit persistence failures propagate so the surrounding transaction can abort.
async function logEvent(req, type, options = {}, session) {
  const {
    userId = req?.user?._id || null,
    actorName = req?.user?.name || "",
    actorRole = req?.user?.role || "system",
    category = SECURITY_EVENT_TYPES.has(type) ? "security" : "business",
    entityType = "",
    entityId = "",
    outcome,
    previousStatus = "",
    newStatus = "",
    context = {},
    email = "",
    detail = "",
  } = options;
  const inferredOutcome = type === "login_blocked_locked"
    ? "denied"
    : type.endsWith("_denied")
    ? "denied"
    : type.endsWith("_failed") || type.endsWith("_failure")
      ? "failure"
      : type.endsWith("_rejected")
        ? "rejected"
        : "success";
  const safeContext = context && typeof context === "object" && !Array.isArray(context)
    ? Object.fromEntries(Object.entries(context).filter(([, value]) =>
      ["string", "number", "boolean"].includes(typeof value) || value === null
    ))
    : {};
  const event = {
    type,
    userId,
    actorName: String(actorName).slice(0, 120),
    actorRole,
    category,
    entityType: String(entityType).slice(0, 40),
    entityId: String(entityId || "").slice(0, 80),
    outcome: OUTCOMES.has(outcome) ? outcome : inferredOutcome,
    previousStatus: String(previousStatus).slice(0, 80),
    newStatus: String(newStatus).slice(0, 80),
    context: safeContext,
    email: String(email).slice(0, 254),
    ip: req?.ip || "",
    detail: String(detail).slice(0, 300),
  };
  await SecurityEvent.create([event], session ? { session } : {});
}

module.exports = { logEvent };
