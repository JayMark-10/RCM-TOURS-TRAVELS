"use strict";

const Notification = require("../models/Notification");

async function createNotifications(userIds, request, text, session) {
  const recipients = [...new Set(userIds.filter(Boolean).map(String))];
  if (!recipients.length) return;
  await Notification.insertMany(recipients.map((userId) => ({
    userId,
    requestId: request._id,
    ref: request.ref,
    text: `${request.ref}: ${text}`,
  })), session ? { session } : {});
}

module.exports = { createNotifications };
