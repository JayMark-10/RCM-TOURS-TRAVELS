"use strict";
const AppError = require("../utils/AppError");
const { assertSafeKeys } = require("../utils/sanitize");

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

// CSRF defence for a cookie-based API: state-changing requests must come from our site's origin
// and, when they carry a body, must be JSON (a plain HTML form cannot send that).
function originGuard(cfg) {
  return (req, _res, next) => {
    if (SAFE.has(req.method)) return next();
    const origin = req.get("origin");
    if (origin ? origin !== cfg.clientOrigin : cfg.isProd) {
      return next(new AppError(403, "Request not allowed."));
    }
    const hasBody = Number(req.get("content-length") || 0) > 0 || req.get("transfer-encoding");
    if (hasBody && !req.is("application/json")) return next(new AppError(415, "Content type must be application/json."));
    next();
  };
}

// Rejects "$operator" and "a.b" keys anywhere in the body or query string.
function rejectOperatorKeys(req, _res, next) {
  try {
    assertSafeKeys(req.body);
    assertSafeKeys(req.query);
    next();
  } catch (e) { next(e); }
}

module.exports = { originGuard, rejectOperatorKeys };
