
"use strict";

const { Router } = require("express");
const c = require("../controllers/invitations");
const { requireAuth, requireRole } = require("../middleware/auth");

module.exports = (cfg) => {
  const router = Router();

  router.use(requireAuth(cfg));

  // Only Admin can create Staff invitations.
  router.post("/", requireRole("admin"), c.create(cfg));

  // Only Admin can view and revoke invitations.
  router.get("/", requireRole("admin"), c.list());
  router.delete("/:id", requireRole("admin"), c.revoke());

  return router;
};
