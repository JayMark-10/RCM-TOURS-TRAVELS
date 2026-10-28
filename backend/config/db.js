"use strict";
const mongoose = require("mongoose");

// Defence against NoSQL operator injection: any {"$ne": ...} object that reaches a
// query filter is treated as a plain value. Our own operators use mongoose.trusted().
mongoose.set("sanitizeFilter", true);
mongoose.set("strictQuery", true);

function assertTransactionTopology(topology) {
  if (!["ReplicaSetWithPrimary", "Sharded"].includes(topology)) {
    const error = new Error("MongoDB transaction support is required; configure a replica set or sharded cluster.");
    error.code = "MONGO_TRANSACTIONS_REQUIRED";
    throw error;
  }
}

async function connectDb(uri) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  const topology = mongoose.connection.getClient().topology?.description?.type;
  try {
    assertTransactionTopology(topology);
  } catch (error) {
    try {
      await mongoose.disconnect();
    } catch (disconnectError) {
      error.disconnectFailure = {
        name: disconnectError.name || "Error",
        code: disconnectError.code || "unknown",
      };
    }
    throw error;
  }
  return mongoose.connection;
}

module.exports = { assertTransactionTopology, connectDb, mongoose };
