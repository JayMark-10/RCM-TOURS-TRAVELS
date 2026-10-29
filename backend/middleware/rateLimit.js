"use strict";
const rateLimit = require("express-rate-limit");

function authLimiter(cfg) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: cfg.authRateMax,
    skipSuccessfulRequests: true,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many attempts. Please try again later." },
  });
}

function apiLimiter() {
  return rateLimit({
    windowMs: 60 * 1000,
    limit: 300,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many requests. Please slow down." },
  });
}

function paymentReportLimiter(limit = 10) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many payment reports. Please wait before trying again." },
  });
}

function uploadLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many uploads. Please try again later." },
  });
}

module.exports = { authLimiter, apiLimiter, paymentReportLimiter, uploadLimiter };
