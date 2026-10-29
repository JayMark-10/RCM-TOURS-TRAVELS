"use strict";
const { mongoose } = require("../config/db");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    // null for walk-in customers created by staff who have not registered yet.
    passwordHash: { type: String, default: null, select: false },
    activationTokenHash: { type: String, default: null, select: false },
    activationTokenExpiresAt: { type: Date, default: null, select: false },
    activationCodeRequestedAt: { type: Date, default: null, select: false },
    activationCodeAttempts: { type: Number, default: 0, select: false },
    // Existing accounts default to verified for the rollout migration. New
    // customer registrations explicitly set false until they redeem a token.
    emailVerified: { type: Boolean, default: true },
    emailVerificationTokenHash: { type: String, default: null, select: false },
    emailVerificationExpiresAt: { type: Date, default: null, select: false },
    verificationEmailSentAt: { type: Date, default: null, select: false },
    role: { type: String, enum: ["customer", "staff", "admin"], required: true },
    active: { type: Boolean, default: true },
    canAssign: { type: Boolean, default: false },
    phone: { type: String, trim: true, maxlength: 40, default: "" },
    failedLogins: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
    consentAt: { type: Date, default: null },
  },
  { timestamps: true, strict: true }
);

userSchema.methods.toPublic = function () {
  return {
    id: String(this._id),
    name: this.name,
    email: this.email,
    role: this.role,
    canAssign: this.role === "admin" ? true : this.canAssign,
    phone: this.phone,
  };
};

module.exports = mongoose.models.User || mongoose.model("User", userSchema);
