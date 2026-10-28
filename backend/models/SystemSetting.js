"use strict";

const { mongoose } = require("../config/db");

const paymentMethodSchema = new mongoose.Schema({
  method: { type: String, enum: ["Cash", "Bank Transfer", "GCash"], required: true },
  enabled: { type: Boolean, default: false },
  instructions: { type: String, default: "", maxlength: 1000 },
}, { _id: false, strict: true });

const systemSettingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: "global" },
    companyName: { type: String, default: "RCM Travel and Tours", maxlength: 120 },
    contactEmail: { type: String, default: "", maxlength: 254 },
    contactPhone: { type: String, default: "", maxlength: 40 },
    address: { type: String, default: "", maxlength: 300 },
    disclaimer: {
      type: String,
      default: "Submitting a request does not guarantee booking confirmation. Payments are handled outside this system.",
      maxlength: 1000,
    },
    allowRegistration: { type: Boolean, default: true },
    paymentMethods: { type: [paymentMethodSchema], default: [] },
  },
  { timestamps: true, strict: true },
);

module.exports = mongoose.models.SystemSetting || mongoose.model("SystemSetting", systemSettingSchema);
