
"use strict";

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const {
  originGuard,
  rejectOperatorKeys,
} = require("./middleware/security");
const {
  notFound,
  errorHandler,
} = require("./middleware/errorHandler");
const { apiLimiter } = require("./middleware/rateLimit");
const { mongoose } = require("./config/db");

function createApp(cfg) {
  const app = express();

  app.disable("x-powered-by");

  if (cfg.trustProxy) {
    app.set("trust proxy", cfg.trustProxy);
  }

  app.use(helmet());

  app.use(
    cors({
      origin: cfg.clientOrigin,
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    })
  );

  app.use(apiLimiter());
  app.use(originGuard(cfg));
  // Large upload bodies are parsed in their authenticated route middleware.
  // Skip the global parser only for those two endpoints; every other route
  // keeps its existing parser and limit.
  app.use((req, res, next) => {
    const documentUpload = req.method === "POST" &&
      /^\/api\/requests\/[a-f\d]{24}\/documents\/?$/i.test(req.path);
    const paymentReport = req.method === "POST" &&
      /^\/api\/payments\/?$/i.test(req.path);
    if (documentUpload || paymentReport) return next();

    express.json({ limit: "50kb", strict: true })(req, res, next);
  });
  app.use(rejectOperatorKeys);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  // Liveness stays independent of MongoDB; schedulers can use readiness to
  // stop routing traffic when persistent storage is unavailable.
  app.get("/api/ready", (_req, res) => {
    if (mongoose.connection.readyState !== 1) return res.status(503).json({ ok: false });
    return res.json({ ok: true });
  });

  app.use("/api/auth", require("./routes/auth")(cfg));
  app.use("/api/invitations", require("./routes/invitations")(cfg));
  app.use("/api/users", require("./routes/users")(cfg));
  app.use("/api/notifications", require("./routes/notifications")(cfg));
  app.use("/api/services", require("./routes/services")(cfg));
  app.use("/api/settings", require("./routes/settings")(cfg));
  app.use("/api/audit-events", require("./routes/audit")(cfg));
  app.use("/api/requests", require("./routes/requests")(cfg));
  app.use("/api/payments", require("./routes/payments")(cfg));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
