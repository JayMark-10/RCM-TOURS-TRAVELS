"use strict";
const { mongoose } = require("../config/db");

// Server-side session. The cookie holds a random id; only its hash is stored here.
// Deleting the row (logout) or passing expiresAt makes the cookie useless immediately.
const sessionSchema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  createdAt: { type: Date, default: Date.now },
  lastSeenAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } }, // absolute limit, auto-purged
  ip: { type: String, default: "" },
  userAgent: { type: String, default: "", maxlength: 200 },
});

module.exports = mongoose.models.Session || mongoose.model("Session", sessionSchema);
