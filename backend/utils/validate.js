"use strict";
const AppError = require("./AppError");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function fail(field, message) {
  throw new AppError(400, message, { [field]: message });
}

// Every validator insists on the right TYPE first, so an object like {"$ne": ""} never gets through.
function text(value, field, { min = 1, max = 200, label = field } = {}) {
  if (typeof value !== "string") fail(field, `${label} is required.`);
  const v = value.trim();
  if (v.length < min) fail(field, `${label} is required.`);
  if (v.length > max) fail(field, `${label} is too long.`);
  return v;
}

function email(value, field = "email") {
  const v = text(value, field, { max: 254, label: "Email" }).toLowerCase();
  if (!EMAIL_RE.test(v)) fail(field, "Enter a valid email address.");
  return v;
}

// bcrypt only uses the first 72 bytes, so longer passwords are refused rather than silently truncated.
function newPassword(value, field = "password") {
  if (typeof value !== "string") fail(field, "Password is required.");
  if (value.length < 10) fail(field, "Password must be at least 10 characters.");
  if (Buffer.byteLength(value, "utf8") > 72) fail(field, "Password is too long (72 bytes maximum).");
  return value;
}

function oneOf(value, field, allowed) {
  if (typeof value !== "string" || !allowed.includes(value)) fail(field, "Invalid value.");
  return value;
}

function body(req) {
  const b = req.body;
  if (!b || typeof b !== "object" || Array.isArray(b)) throw new AppError(400, "Invalid request.");
  return b;
}

module.exports = { text, email, newPassword, oneOf, body };
