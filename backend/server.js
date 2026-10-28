
"use strict";

const dns = require("node:dns");
const { loadEnv } = require("./config/env");
const { connectDb, mongoose } = require("./config/db");
const { createApp } = require("./app");
const { ensureDefaultServices } = require("./config/defaultServices");
const { startReceiptRecovery } = require("./services/paymentReceiptRecovery");

let server;
let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.info(`Received ${signal}; shutting down.`);

  const forceExit = setTimeout(() => {
    console.error("Graceful shutdown timed out.");
    process.exit(1);
  }, 15_000);

  forceExit.unref();

  if (!server) {
    mongoose.disconnect()
      .catch((error) => {
        console.error("MongoDB shutdown failed.", {
          name: error.name || "Error",
          code: error.code || "unknown",
        });
        process.exitCode = 1;
      })
      .finally(() => {
        clearTimeout(forceExit);
      });

    return;
  }

  server.close(async (error) => {
    if (error) {
      console.error("HTTP server shutdown failed.", {
        name: error.name || "Error",
        code: error.code || "unknown",
      });
      process.exitCode = 1;
    }

    try {
      await mongoose.disconnect();
    } catch (disconnectError) {
      console.error("MongoDB shutdown failed.", {
        name: disconnectError.name || "Error",
        code: disconnectError.code || "unknown",
      });
      process.exitCode = 1;
    }

    clearTimeout(forceExit);
  });
}

async function main() {
  const cfg = loadEnv();

  // Work around the local Windows DNS issue during development.
  // Production deployments use the host's normal DNS configuration.
  if (cfg.nodeEnv !== "production") {
    dns.setServers(["8.8.8.8", "8.8.4.4"]);
  }

  await connectDb(cfg.mongoUri);
  await ensureDefaultServices();

  startReceiptRecovery();

  console.log("MongoDB connected.");

  const app = createApp(cfg);

  server = app.listen(cfg.port, () => {
    console.log(`API listening on port ${cfg.port} (${cfg.nodeEnv}).`);
  });

  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
}

main().catch((error) => {
  if (
    typeof error.message === "string" &&
    error.message.startsWith("Invalid configuration:")
  ) {
    console.error("Backend startup failed.", error.message);
  } else if (error.code === "MONGO_TRANSACTIONS_REQUIRED") {
    console.error("Backend startup failed.", error.message);
  } else {
    console.error("Backend startup failed. Check MongoDB connectivity and credentials.", {
      name: error.name || "Error",
      code: error.code || "unknown",
    });
  }

  process.exit(1);
});
