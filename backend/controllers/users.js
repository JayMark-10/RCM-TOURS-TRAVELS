"use strict";

const AppError = require("../utils/AppError");
const v = require("../utils/validate");
const { mongoose } = require("../config/db");
const { isValidId } = require("../middleware/auth");
const User = require("../models/User");
const { logEvent } = require("../services/securityLog");

function account(user) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    phone: user.phone || "",
    role: user.role,
    active: user.active,
    canAssign: user.role === "admin" || user.canAssign,
    lastActive: user.updatedAt || user.createdAt || null,
  };
}

async function list(_req, res) {
  const users = await User.find().sort({ name: 1 }).limit(1000);
  res.json({ users: users.map(account) });
}

async function directory(_req, res) {
  const users = await User.find({ active: true, role: mongoose.trusted({ $in: ["customer", "staff"] }) })
    .sort({ name: 1 })
    .limit(2000);
  res.json({ users: users.map(account) });
}

async function updateProfile(req, res) {
  const body = v.body(req);
  const allowed = new Set(["name", "email", "phone"]);
  if (!Object.keys(body).length || Object.keys(body).some((key) => !allowed.has(key))) {
    throw new AppError(400, "Only name, email, and phone can be updated.");
  }

  const fields = {};
  if (body.name !== undefined) fields.name = v.fullName(body.name, "name", { max: 120, label: "Full name" });
  if (body.email !== undefined) fields.email = v.email(body.email);
  if (body.phone !== undefined) {
    fields.phone = body.phone === ""
      ? ""
      : req.user.role === "customer"
        ? v.philippineMobile(body.phone, "phone")
        : v.text(body.phone, "phone", { max: 40, label: "Phone" });
  }

  try {
    const user = await User.findByIdAndUpdate(req.user._id, { $set: fields }, { new: true, runValidators: true });
    await logEvent(req, "profile_updated", {
      userId: req.user._id,
      entityType: "User",
      entityId: req.user._id,
      context: { fields: Object.keys(fields).join(",") },
      detail: "Updated supported profile fields",
    });
    res.json({ user: user.toPublic() });
  } catch (error) {
    if (error && (error.code === 11000 || error.code === 11001)) {
      throw new AppError(409, "That email address is already in use.");
    }
    throw error;
  }
}

async function setActive(req, res) {
  if (!isValidId(req.params.id)) throw new AppError(400, "Invalid user ID.");
  const body = v.body(req);
  if (typeof body.active !== "boolean") throw new AppError(400, "Choose whether the account is active.");
  const target = await User.findById(req.params.id);
  if (!target) throw new AppError(404, "User not found.");

  if (!body.active && target.role === "admin") {
    throw new AppError(409, "Administrator accounts cannot be deactivated through this endpoint.");
  }

  target.active = body.active;
  await target.save();
  await logEvent(req, body.active ? "account_activated" : "account_deactivated", {
    userId: req.user._id,
    entityType: "User",
    entityId: target._id,
    context: { active: body.active },
    detail: `account ${target._id}`,
  });
  res.json({ user: account(target) });
}

async function setAssignmentPermission(req, res) {
  if (!isValidId(req.params.id)) throw new AppError(400, "Invalid user ID.");
  const body = v.body(req);
  if (typeof body.canAssign !== "boolean") throw new AppError(400, "Invalid assignment permission.");
  const target = await User.findOne({ _id: req.params.id, role: "staff" });
  if (!target) throw new AppError(404, "Staff account not found.");
  target.canAssign = body.canAssign;
  await target.save();
  await logEvent(req, "assignment_permission_changed", {
    userId: req.user._id,
    entityType: "User",
    entityId: target._id,
    context: { canAssign: body.canAssign },
    detail: `staff account ${target._id}`,
  });
  res.json({ user: account(target) });
}

module.exports = { list, directory, updateProfile, setActive, setAssignmentPermission };
