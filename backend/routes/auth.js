"use strict";
const { Router } = require("express");
const c = require("../controllers/auth");
const { requireAuth } = require("../middleware/auth");
const { authLimiter } = require("../middleware/rateLimit");

module.exports = (cfg) => {
  const r = Router();
  const limiter = authLimiter(cfg);
  r.post("/login", limiter, c.login(cfg));
  r.post("/register", limiter, c.register(cfg));
  r.post("/activation-code", limiter, c.requestActivationCode(cfg));
  r.post("/logout", c.logout(cfg));
  r.get("/me", requireAuth(cfg), c.me());
  return r;
};
