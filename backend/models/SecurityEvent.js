"use strict";
const { mongoose } = require("../config/db");

// Security log: who/what/when. Never stores passwords, setup keys or session tokens.
const schema = new mongoose.Schema({
  at: { type: Date, default: Date.now, index: true },
  type: { type: String, required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  actorName: { type: String, default: "", maxlength: 120 },
  actorRole: { type: String, default: "system", enum: ["customer", "staff", "admin", "anonymous", "system"], index: true },
  category: { type: String, default: "business", enum: ["business", "security"], index: true },
  entityType: { type: String, default: "", maxlength: 40 },
  entityId: { type: String, default: "", maxlength: 80, index: true },
  outcome: { type: String, default: "success", enum: ["success", "failure", "denied", "rejected"], index: true },
  previousStatus: { type: String, default: "", maxlength: 80 },
  newStatus: { type: String, default: "", maxlength: 80 },
  context: { type: mongoose.Schema.Types.Mixed, default: {} },
  email: { type: String, default: "", maxlength: 254 },
  ip: { type: String, default: "" },
  detail: { type: String, default: "", maxlength: 300 },
});

module.exports = mongoose.models.SecurityEvent || mongoose.model("SecurityEvent", schema);
