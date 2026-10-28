"use strict";

const { Router } = require("express");
const { requireAuth, requireRole } = require("../middleware/auth");
const audit = require("../controllers/audit");

module.exports = (cfg) => {
  const router = Router();
  router.get("/", requireAuth(cfg), requireRole("admin"), audit.list);
  return router;
};