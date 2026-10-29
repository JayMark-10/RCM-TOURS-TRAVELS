"use strict";
const { Router } = require("express");
const c = require("../controllers/auth");
const { requireAuth } = require("../middleware/auth");
const { authLimiter, verificationResendLimiter } = require("../middleware/rateLimit");

module.exports = (cfg) => {
  const r = Router();
  const limiter = authLimiter(cfg);
  r.post("/login", limiter, c.login(cfg));
  r.post("/register", limiter, c.register(cfg));
  r.post("/activation-code", limiter, c.requestActivationCode(cfg));
  r.post("/verify-email", limiter, c.verifyEmail());
  r.post("/resend-verification", verificationResendLimiter(), c.resendVerification(cfg));
  r.post("/logout", c.logout(cfg));
  r.get("/me", requireAuth(cfg), c.me());
  return r;
};
