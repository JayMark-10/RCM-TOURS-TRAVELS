"use strict";

const { mongoose } = require("../config/db");

const paymentSchema = new mongoose.Schema({
  requestId: { type: mongoose.Schema.Types.ObjectId, ref: "Request", required: true, index: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  quotationNumber: { type: String, required: true, maxlength: 40 },
  method: { type: String, enum: ["Cash", "Bank Transfer", "GCash"], required: true },
  amountReported: { type: Number, required: true, min: 0.01, max: 100000000 },
  amountVerified: { type: Number, default: 0, min: 0, max: 100000000 },
  paymentDate: { type: Date, default: Date.now },
  transactionReference: { type: String, default: "", maxlength: 120 },
  receiptFileId: { type: String, default: "", maxlength: 40 },
  receiptMimeType: { type: String, default: "", enum: ["", "image/jpeg", "image/png", "application/pdf"] },
  receiptSize: { type: Number, default: 0, min: 0, max: 3 * 1024 * 1024 },
  status: { type: String, enum: ["Pending Verification", "Verified", "Rejected"], default: "Pending Verification", index: true },
  verificationNote: { type: String, default: "", maxlength: 1000 },
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  verifiedAt: { type: Date, default: null },
}, { timestamps: true, strict: true });

paymentSchema.index({ requestId: 1, customerId: 1, createdAt: -1 });
paymentSchema.index(
  { method: 1, transactionReference: 1 },
  { unique: true, partialFilterExpression: { transactionReference: { $gt: "" } } }
);

module.exports = mongoose.models.Payment || mongoose.model("Payment", paymentSchema);
