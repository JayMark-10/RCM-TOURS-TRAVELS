"use strict";
const AppError = require("./AppError");

// Rejects any object key that starts with "$" or contains "." (MongoDB operator / path injection).
function assertSafeKeys(value, depth = 0) {
  if (depth > 10) throw new AppError(400, "Invalid request.");
  if (Array.isArray(value)) return value.forEach((v) => assertSafeKeys(v, depth + 1));
  if (value && typeof value === "object") {
    for (const k of Object.keys(value)) {
      if (k.startsWith("$") || k.includes(".")) throw new AppError(400, "Invalid request.");
      assertSafeKeys(value[k], depth + 1);
    }
  }
}

// Escapes user text so it is matched literally if it is ever used inside a regular expression.
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

module.exports = { assertSafeKeys, escapeRegex };
