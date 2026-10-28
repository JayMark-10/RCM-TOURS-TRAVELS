"use strict";

const { Router } = require("express");
const { requireAuth, requireRole } = require("../middleware/auth");
const settings = require("../controllers/settings");

module.exports = (cfg) => {
  const router = Router();
  router.get("/", settings.get);
  router.patch("/", requireAuth(cfg), requireRole("admin"), settings.save);
  return router;
};