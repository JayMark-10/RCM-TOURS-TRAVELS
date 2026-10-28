"use strict";

const { Router } = require("express");
const { requireAuth } = require("../middleware/auth");
const notifications = require("../controllers/notifications");

module.exports = (cfg) => {
  const router = Router();
  router.use(requireAuth(cfg));
  router.get("/", notifications.list);
  router.patch("/read-all", notifications.markAllRead);
  router.patch("/:id/read", notifications.markRead);
  return router;
};