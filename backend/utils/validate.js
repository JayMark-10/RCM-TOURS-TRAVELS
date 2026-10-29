"use strict";
const AppError = require("./AppError");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const FULL_NAME_RE = /^\p{L}[\p{L}\p{M}]*(?:(?: +|[-'’])\p{L}[\p{L}\p{M}]*)*$/u;
const PHILIPPINE_MOBILE_RE = /^09[0-9]{9}$/;

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

function fullName(value, field = "name", { max = 120, label = "Full name" } = {}) {
  const name = text(value, field, { max, label });
  if (!FULL_NAME_RE.test(name)) {
    fail(field, "Enter a valid full name using letters, spaces, hyphens, or apostrophes.");
  }
  return name;
}

function philippineMobile(value, field = "phone", { optional = false, label = "Mobile number" } = {}) {
  if (optional && value === "") return "";
  if (typeof value !== "string" || !PHILIPPINE_MOBILE_RE.test(value)) {
    fail(field, "Enter an 11-digit Philippine mobile number starting with 09 (for example, 09171234567).");
  }
  return value;
}

function numeric(value, field, { min = -Infinity, max = Infinity, label = field } = {}) {
  let number;
  if (typeof value === "number") {
    number = value;
  } else if (typeof value === "string" && value.trim() && /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim())) {
    number = Number(value.trim());
  } else {
    fail(field, `Enter a valid ${label}.`);
  }
  if (!Number.isFinite(number) || number < min || number > max) {
    fail(field, `Enter a valid ${label}.`);
  }
  return number;
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

module.exports = { text, email, fullName, philippineMobile, numeric, newPassword, oneOf, body };
