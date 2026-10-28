"use strict";

const { loadEnv } = require("../config/env");
const { createSmtpTransport, logSmtpFailure } = require("../services/email");

async function main() {
  const cfg = loadEnv();
  if (cfg.isProd) {
    console.error("SMTP test refused: this command is development-only.");
    process.exitCode = 1;
    return;
  }

  const recipient = process.argv[2] || "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    console.error("Usage: npm run test:email -- recipient@example.com");
    process.exitCode = 1;
    return;
  }

  const transport = createSmtpTransport(cfg);
  if (!transport) {
    process.exitCode = 1;
    return;
  }

  if (cfg.smtpUser.toLowerCase() !== cfg.emailFrom.toLowerCase()) {
    console.warn("[email test] EMAIL_FROM differs from SMTP_USER; Gmail may require that sender alias to be configured.");
  }

  try {
    await transport.verify();
    console.info("[email test] SMTP connection and authentication succeeded.");
    await transport.sendMail({
      from: cfg.emailFrom,
      to: recipient,
      subject: "RCM SMTP configuration test",
      text: "This is a development test of the RCM email delivery configuration. No activation code is included.",
    });
    console.info("[email test] Gmail's SMTP relay accepted the test email. Check the recipient inbox and spam folder.");
  } catch (error) {
    logSmtpFailure("development test", error);
    process.exitCode = 1;
  } finally {
    transport.close();
  }
}

main().catch((error) => {
  // Avoid logging an arbitrary exception message that could contain configuration.
  console.error("[email test] Unexpected error while testing SMTP.", { name: error.name || "Error" });
  process.exitCode = 1;
});
