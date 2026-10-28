"use strict";

const { Router } = require("express");
const { requireAuth, requireRole } = require("../middleware/auth");
const services = require("../controllers/services");

module.exports = (cfg) => {
  const router = Router();
  router.get("/", services.listPublic);
  router.get("/workspace", requireAuth(cfg), requireRole("customer", "staff", "admin"), services.listWorkspace);
  router.get("/admin", requireAuth(cfg), requireRole("admin"), services.listAdmin);
  router.put("/:id", requireAuth(cfg), requireRole("admin"), services.save);
  router.delete("/:id", requireAuth(cfg), requireRole("admin"), services.deleteService);
  return router;
};