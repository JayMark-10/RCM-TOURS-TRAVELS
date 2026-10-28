"use strict";

const { Router } = require("express");
const express = require("express");
const { requireAuth, requireRole } = require("../middleware/auth");
const { rejectOperatorKeys } = require("../middleware/security");
const { uploadLimiter } = require("../middleware/rateLimit");
const requestsController = require("../controllers/requests");
const files = require("../controllers/requestFiles");

module.exports = function (cfg) {
  const router = Router();

  router.get("/:id/documents", requireAuth(cfg), requireRole("customer", "staff", "admin"), files.list);
  router.post(
    "/:id/documents",
    requireAuth(cfg),
    requireRole("customer", "staff", "admin"),
    files.authorizeUpload,
    uploadLimiter(),
    express.json({ limit: "27mb", strict: true }),
    rejectOperatorKeys,
    files.upload
  );
  router.get("/:id/documents/:fileId", requireAuth(cfg), requireRole("customer", "staff", "admin"), files.serve);

  router.get(
    "/",
    requireAuth(cfg),
    requireRole("customer", "staff", "admin"),
    requestsController.getMyRequests
  );

  router.post(
    "/",
    requireAuth(cfg),
    requireRole("customer", "staff", "admin"),
    requestsController.createRequest
  );

  router.patch(
    "/:id/status",
    requireAuth(cfg),
    requireRole("staff", "admin"),
    requestsController.updateStatus
  );

  router.patch(
    "/:id/assignment",
    requireAuth(cfg),
    requireRole("staff", "admin"),
    requestsController.updateAssignment
  );

  router.post(
    "/:id/messages",
    requireAuth(cfg),
    requireRole("customer", "staff", "admin"),
    requestsController.addMessage
  );

  router.post(
    "/:id/notes",
    requireAuth(cfg),
    requireRole("staff", "admin"),
    requestsController.addNote
  );

  router.patch(
    "/:id/checklist",
    requireAuth(cfg),
    requireRole("staff", "admin"),
    requestsController.updateChecklist
  );

  router.put(
    "/:id/quotation",
    requireAuth(cfg),
    requireRole("staff", "admin"),
    requestsController.saveQuotation
  );

  router.post(
    "/:id/quotation/send",
    requireAuth(cfg),
    requireRole("staff", "admin"),
    requestsController.sendQuotation
  );

  router.post(
    "/:id/quotation/respond",
    requireAuth(cfg),
    requireRole("customer"),
    requestsController.respondQuotation
  );

  router.post(
    "/:id/cancel",
    requireAuth(cfg),
    requireRole("customer"),
    requestsController.cancelOwn
  );

  router.get(
    "/:id",
    requireAuth(cfg),
    requireRole("customer", "staff", "admin"),
    requestsController.getRequestById
  );

  return router;
};
