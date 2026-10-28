"use strict";

const { mongoose } = require("../config/db");

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    requestId: { type: mongoose.Schema.Types.ObjectId, ref: "Request", required: true, index: true },
    ref: { type: String, required: true, maxlength: 40 },
    text: { type: String, required: true, trim: true, maxlength: 300 },
    readAt: { type: Date, default: null },
  },
  { timestamps: true, strict: true }
);

notificationSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.models.Notification || mongoose.model("Notification", notificationSchema);