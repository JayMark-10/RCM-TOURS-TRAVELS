"use strict";

const AppError = require("../utils/AppError");
const v = require("../utils/validate");
const SystemSetting = require("../models/SystemSetting");
const { logEvent } = require("../services/securityLog");

function dto(settings) {
  return {
    companyName: settings.companyName,
    contactEmail: settings.contactEmail,
    contactPhone: settings.contactPhone,
    address: settings.address,
    disclaimer: settings.disclaimer,
    allowRegistration: settings.allowRegistration,
    paymentMethods: settings.paymentMethods || [],
  };
}

async function get(_req, res) {
  const settings = await SystemSetting.findOne({ key: "global" }).lean();
  res.json({ settings: settings ? dto(settings) : {
    companyName: "RCM Travel and Tours",
    contactEmail: "",
    contactPhone: "",
    address: "",
    disclaimer: "Submitting a request does not guarantee booking confirmation. Payments are handled outside this system.",
    allowRegistration: true,
    paymentMethods: [],
  } });
}

async function save(req, res) {
  const body = v.body(req);
  const allowed = new Set(["companyName", "contactEmail", "contactPhone", "address", "disclaimer", "allowRegistration", "paymentMethods"]);
  if (!Object.keys(body).length || Object.keys(body).some((key) => !allowed.has(key))) throw new AppError(400, "Invalid system settings.");
  const updates = {};
  if (body.companyName !== undefined) updates.companyName = v.text(body.companyName, "companyName", { max: 120, label: "Company name" });
  if (body.contactEmail !== undefined) updates.contactEmail = body.contactEmail === "" ? "" : v.email(body.contactEmail, "contactEmail");
  if (body.contactPhone !== undefined) updates.contactPhone = body.contactPhone === "" ? "" : v.text(body.contactPhone, "contactPhone", { max: 40, label: "Contact phone" });
  if (body.address !== undefined) updates.address = body.address === "" ? "" : v.text(body.address, "address", { max: 300, label: "Address" });
  if (body.disclaimer !== undefined) updates.disclaimer = body.disclaimer === "" ? "" : v.text(body.disclaimer, "disclaimer", { max: 1000, label: "Disclaimer" });
  if (body.allowRegistration !== undefined) {
    if (typeof body.allowRegistration !== "boolean") throw new AppError(400, "Invalid registration setting.");
    updates.allowRegistration = body.allowRegistration;
  }
  if (body.paymentMethods !== undefined) {
    const allowedMethods = ["Cash", "Bank Transfer", "GCash"];
    if (!Array.isArray(body.paymentMethods) || body.paymentMethods.length > 3) throw new AppError(400, "Invalid payment methods.");
    const seen = new Set();
    updates.paymentMethods = body.paymentMethods.map((item) => {
      if (!item || !allowedMethods.includes(item.method) || seen.has(item.method) || typeof item.enabled !== "boolean") throw new AppError(400, "Invalid payment method configuration.");
      seen.add(item.method);
      const instructions = item.instructions === "" || item.instructions === undefined ? "" : v.text(item.instructions, "paymentMethods.instructions", { max: 1000, label: "Payment instructions" });
      if (item.enabled && !instructions) throw new AppError(400, `Add verified ${item.method} instructions before enabling it.`);
      return { method: item.method, enabled: item.enabled, instructions };
    });
  }
  const settings = await SystemSetting.findOneAndUpdate(
    { key: "global" },
    { $set: updates, $setOnInsert: { key: "global" } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  ).lean();
  await logEvent(req, "system_settings_updated", {
    userId: req.user._id,
    entityType: "SystemSetting",
    entityId: settings._id,
    context: { fields: Object.keys(updates).join(",") },
    detail: "global settings",
  });
  res.json({ settings: dto(settings) });
}

module.exports = { get, save };
