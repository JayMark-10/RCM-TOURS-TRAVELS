"use strict";

const { Router } = require("express");
const express = require("express");
const { requireAuth, requireRole } = require("../middleware/auth");
const { rejectOperatorKeys } = require("../middleware/security");
const controller = require("../controllers/payments");
const { paymentReportLimiter } = require("../middleware/rateLimit");

module.exports = (cfg) => {
  const router = Router();
  router.post(
    "/",
    requireAuth(cfg),
    requireRole("customer", "staff", "admin"),
    paymentReportLimiter(cfg.paymentReportMax),
    requireRole("customer"),
    express.json({ limit: "5mb", strict: true }),
    rejectOperatorKeys,
    controller.createReport
  );
  router.use(requireAuth(cfg), requireRole("customer", "staff", "admin"));
  router.get("/", controller.list);
  router.post("/cash", requireRole("staff", "admin"), controller.recordCash);
  router.patch("/:id/verification", requireRole("staff", "admin"), controller.verify);
  router.get("/:id/receipt", controller.receipt);
  return router;
};
