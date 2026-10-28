"use strict";

const SecurityEvent = require("../models/SecurityEvent");
const { escapeRegex } = require("../utils/sanitize");

const SECURITY_TYPES = new Set([
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

function queryValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function legacyCategory(event) {
  if (event.category) return event.category;
  return SECURITY_TYPES.has(event.type) ? "security" : "business";
}

function legacyOutcome(event) {
  if (event.outcome) return event.outcome;
  if (event.type === "login_blocked_locked") return "denied";
  if (event.type.endsWith("_denied")) return "denied";
  if (event.type.endsWith("_failed") || event.type.endsWith("_failure") || event.type === "account_locked") return "failure";
  if (event.type.endsWith("_rejected")) return "rejected";
  return "success";
}

function legacyActorRole(event) {
  if (event.actorRole) return event.actorRole;
  if (["login_blocked_locked", "login_failed"].includes(event.type)) return "anonymous";
  return event.userId ? "unknown" : "system";
}

function legacyActor(event) {
  if (event.actorName) return event.actorName;
  if (["login_blocked_locked", "login_failed"].includes(event.type)) return "Unauthenticated";
  return event.userId?.name || "System";
}

async function list(req, res) {
  const pageInput = queryValue(req.query.page);
  const limitInput = queryValue(req.query.limit);
  const parsedPage = pageInput && /^\d+$/.test(pageInput) ? Number(pageInput) : 1;
  const parsedLimit = limitInput && /^\d+$/.test(limitInput) ? Number(limitInput) : 50;
  const page = Number.isSafeInteger(parsedPage) && parsedPage > 0 ? Math.min(parsedPage, 1_000_000) : 1;
  const limit = Number.isSafeInteger(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 50;
  const role = queryValue(req.query.role);
  const category = queryValue(req.query.category);
  const outcome = queryValue(req.query.outcome);
  const search = queryValue(req.query.search).slice(0, 100);
  const filter = {};
  const clauses = [];

  if (["customer", "staff", "admin", "anonymous", "system"].includes(role)) filter.actorRole = role;
  else if (role === "unknown") filter.actorRole = null;
  if (["business", "security"].includes(category)) {
    const legacyTypeFilter = category === "security"
      ? { $in: [...SECURITY_TYPES] }
      : { $nin: [...SECURITY_TYPES] };
    clauses.push({
      $or: [
        { category },
        { category: null, type: legacyTypeFilter },
      ],
    });
  }
  if (["success", "failure", "denied", "rejected"].includes(outcome)) {
    let legacyOutcomeFilter;
    if (outcome === "denied") {
      legacyOutcomeFilter = {
        outcome: null,
        $or: [{ type: /_denied$/ }, { type: "login_blocked_locked" }],
      };
    } else if (outcome === "failure") {
      legacyOutcomeFilter = {
        outcome: null,
        $or: [{ type: /(_failed|_failure)$/ }, { type: "account_locked" }],
      };
    } else if (outcome === "rejected") {
      legacyOutcomeFilter = { outcome: null, type: /_rejected$/ };
    } else {
      legacyOutcomeFilter = {
        outcome: null,
        type: { $not: /(_denied|_failed|_failure|_rejected)$/, $nin: ["account_locked", "login_blocked_locked"] },
      };
    }
    clauses.push({ $or: [{ outcome }, legacyOutcomeFilter] });
  }
  if (search) {
    const matcher = new RegExp(escapeRegex(search), "i");
    clauses.push({ $or: [
      { type: matcher },
      { actorName: matcher },
      { entityType: matcher },
      { entityId: matcher },
      { detail: matcher },
    ] });
  }
  if (clauses.length) filter.$and = clauses;

  const [events, total] = await Promise.all([
    SecurityEvent.find(filter)
      .sort({ at: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("userId", "name")
      .lean(),
    SecurityEvent.countDocuments(filter),
  ]);
  res.json({
    events: events.map((event) => ({
      id: String(event._id),
      date: event.at,
      actor: legacyActor(event),
      role: legacyActorRole(event),
      action: event.type,
      category: legacyCategory(event),
      outcome: legacyOutcome(event),
      entityType: event.entityType || "",
      entityId: event.entityId || "",
      previousStatus: event.previousStatus || "",
      newStatus: event.newStatus || "",
      context: event.context || {},
      target: event.detail || "",
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  });
}

module.exports = { list };