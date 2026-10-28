
"use strict";

const crypto = require("crypto");
const AppError = require("../utils/AppError");

function notFound(_req, res) {
  res.status(404).json({
    error: "Not found.",
  });
}

function isDatabaseUnavailable(err) {
  if (!err) {
    return false;
  }

  const databaseErrorNames = [
    "MongooseServerSelectionError",
    "MongoServerSelectionError",
    "MongoNetworkError",
    "MongoNetworkTimeoutError",
    "MongoTimeoutError",
    "MongoTopologyClosedError",
  ];

  if (databaseErrorNames.includes(err.name)) {
    return true;
  }

  // Mongoose may buffer a query while MongoDB is disconnected.
  if (
    err.name === "MongooseError" &&
    /buffering timed out/i.test(err.message || "")
  ) {
    return true;
  }

  return false;
}

// Centralized error handling.
// Return safe messages to clients and keep internal details in server logs.
function errorHandler(err, req, res, _next) {
  if (res.headersSent) {
    return;
  }

  const ref = crypto.randomBytes(4).toString("hex");

  if (err instanceof AppError) {
    return res.status(err.status).json({
      error: err.message,
      ...(err.fields ? { fields: err.fields } : {}),
    });
  }

  if (err && err.type === "entity.parse.failed") {
    return res.status(400).json({
      error: "Malformed JSON.",
    });
  }

  if (err && err.type === "entity.too.large") {
    return res.status(413).json({
      error: "Request too large.",
    });
  }

  if (err && err.name === "ValidationError") {
    return res.status(400).json({
      error: "Invalid data.",
    });
  }

  if (err && err.name === "CastError") {
    return res.status(400).json({
      error: "Invalid value.",
    });
  }

  // A database outage is temporary, not a client validation error.
  if (isDatabaseUnavailable(err)) {
    console.error(`[error ${ref}] Database unavailable during ${req.method} ${req.path}.`, {
      name: err.name || "Error",
      code: err.code || "unknown",
    });

    return res.status(503).json({
      error: "Service temporarily unavailable.",
      ref,
    });
  }

  // Avoid logging exception messages or stacks that may contain request data or credentials.
  console.error(`[error ${ref}] Unhandled error during ${req.method} ${req.path}.`, {
    name: err?.name || "Error",
    code: err?.code || "unknown",
  });

  return res.status(500).json({
    error: "Something went wrong.",
    ref,
  });
}

module.exports = {
  notFound,
  errorHandler,
};
