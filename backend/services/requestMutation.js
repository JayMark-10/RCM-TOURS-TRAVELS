"use strict";

const AppError = require("../utils/AppError");
const { withMongoTransaction } = require("./mongoTransaction");

async function mutateRequest({ mongoose, Request, filter, update, afterUpdate }) {
  return withMongoTransaction(mongoose, async (session) => {
    const updated = await Request.findOneAndUpdate(filter, update, { new: true, session })
      .populate("customerId", "name email phone")
      .populate("assignedTo", "name email role active")
      .lean();
    if (!updated) throw new AppError(409, "This request changed while you were working. Refresh and try again.");
    if (afterUpdate) await afterUpdate(updated, session);
    return updated;
  });
}

module.exports = { mutateRequest };
