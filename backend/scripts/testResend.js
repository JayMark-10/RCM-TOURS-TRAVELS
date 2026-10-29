"use strict";

const { loadEnv } = require("../config/env");
const { sendEmailMessage } = require("../services/email");

async function main() {
  const cfg = loadEnv();
  if (cfg.isProd) {
    console.error("Email test refused: this command is development-only.");
    process.exitCode = 1;
    return;
  }

  const recipient = process.argv[2] || "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    console.error("Usage: npm run test:email -- recipient@example.com");
    process.exitCode = 1;
    return;
  }

  const accepted = await sendEmailMessage(cfg, {
    to: recipient,
    subject: "RCM email configuration test",
    text: "This is a development test of the RCM email delivery configuration. No activation code or verification link is included.",
    action: "development test",
  });
  if (!accepted) process.exitCode = 1;
}

main().catch((error) => {
  // Avoid logging arbitrary exceptions that may contain configuration.
  console.error("[email test] Unexpected error while testing Resend.", {
    name: /^[A-Za-z]+$/.test(error?.name || "") ? error.name : "Error",
    code: /^[A-Za-z0-9_-]{1,60}$/.test(error?.code || "") ? error.code : "unknown",
  });
  process.exitCode = 1;
});
