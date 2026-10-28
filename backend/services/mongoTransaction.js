"use strict";

async function withMongoTransaction(mongoose, action) {
  const session = await mongoose.startSession();
  let value;
  let transactionError;
  let transactionFailed = false;
  let transactionCommitted = false;
  try {
    await session.withTransaction(async () => {
      value = await action(session);
    });
    transactionCommitted = true;
  } catch (error) {
    transactionFailed = true;
    transactionError = error;
  }

  try {
    await session.endSession();
  } catch (error) {
    if (transactionFailed) {
      console.error("MongoDB session cleanup failed after a transaction error.", {
        name: error?.name || "Error",
        code: error?.code || "unknown",
      });
    } else {
      const cleanupError = error instanceof Error ? error : new Error("MongoDB session cleanup failed.");
      if (cleanupError !== error) cleanupError.cause = error;
      cleanupError.transactionCommitted = transactionCommitted;
      throw cleanupError;
    }
  }

  if (transactionFailed) throw transactionError;
  return value;
}

module.exports = { withMongoTransaction };
