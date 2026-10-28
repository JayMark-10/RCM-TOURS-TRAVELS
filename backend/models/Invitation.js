
"use strict";

const { mongoose } = require("../config/db");

const invitationSchema = new mongoose.Schema({
  keyHash: {
    type: String,
    required: true,
    unique: true,
  },

  // Invitations may only create Staff accounts.
  role: {
    type: String,
    enum: ["staff"],
    required: true,
  },

  email: {
    type: String,
    lowercase: true,
    trim: true,
    default: null,
  },

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },

  expiresAt: {
    type: Date,
    required: true,
  },

  usedAt: {
    type: Date,
    default: null,
  },

  usedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },

  revokedAt: {
    type: Date,
    default: null,
  },

  // Remove expired invitation records after 90 days.
  purgeAt: {
    type: Date,
    required: true,
    index: {
      expireAfterSeconds: 0,
    },
  },
});

module.exports =
  mongoose.models.Invitation ||
  mongoose.model("Invitation", invitationSchema);
