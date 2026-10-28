"use strict";
const { mongoose } = require("../config/db");
const schema = new mongoose.Schema({
  requestId: { type: mongoose.Schema.Types.ObjectId, ref: "Request", required: true, index: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  storageId: { type: String, required: true, unique: true, match: /^[\da-f-]{36}$/i },
  originalName: { type: String, required: true, maxlength: 180 },
  mimeType: { type: String, required: true, enum: ["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "application/pdf"] },
  size: { type: Number, required: true, min: 1, max: 20 * 1024 * 1024 },
}, { timestamps: true, strict: true });
schema.index({ requestId: 1, createdAt: 1 });
module.exports = mongoose.models.RequestFile || mongoose.model("RequestFile", schema);
