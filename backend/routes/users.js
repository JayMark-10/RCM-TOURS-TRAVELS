"use strict";

const { Router } = require("express");
const { requireAuth, requireRole } = require("../middleware/auth");
const users = require("../controllers/users");

module.exports = (cfg) => {
  const router = Router();
  router.use(requireAuth(cfg));
  router.patch("/me", users.updateProfile);
  router.get("/directory", requireRole("staff", "admin"), users.directory);
  router.get("/", requireRole("admin"), users.list);
  router.patch("/:id/active", requireRole("admin"), users.setActive);
  router.patch("/:id/assignment-permission", requireRole("admin"), users.setAssignmentPermission);
  return router;
};