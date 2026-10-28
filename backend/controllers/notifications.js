"use strict";

const AppError = require("../utils/AppError");
const { isValidId } = require("../middleware/auth");
const Notification = require("../models/Notification");

function dto(item) {
  return {
    id: String(item._id),
    requestId: String(item.requestId),
    text: item.text,
    date: item.createdAt,
    read: !!item.readAt,
  };
}

async function list(req, res) {
  const notifications = await Notification.find({ userId: req.user._id })
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();
  res.json({ notifications: notifications.map(dto) });
}

async function markRead(req, res) {
  if (!isValidId(req.params.id)) throw new AppError(404, "Notification not found.");
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    { $set: { readAt: new Date() } },
    { new: true }
  ).lean();
  if (!notification) throw new AppError(404, "Notification not found.");
  res.json({ notification: dto(notification) });
}

async function markAllRead(req, res) {
  await Notification.updateMany(
    { userId: req.user._id, readAt: null },
    { $set: { readAt: new Date() } }
  );
  res.json({ ok: true });
}

module.exports = { list, markRead, markAllRead };