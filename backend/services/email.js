"use strict";

const nodemailer = require("nodemailer");

function logSmtpFailure(action, error) {
  // Never print error.message or the Nodemailer config; either can contain private values.
  console.error(`[email] SMTP ${action} failed.`, {
    code: error.code || "unknown",
    command: error.command || "unknown",
    responseCode: error.responseCode || null,
  });
}

function createSmtpTransport(cfg) {
  const missing = [
    ["SMTP_HOST", cfg.smtpHost],
    ["SMTP_USER", cfg.smtpUser],
    ["SMTP_PASS", cfg.smtpPass],
    ["EMAIL_FROM", cfg.emailFrom],
  ].filter(([, value]) => !value).map(([name]) => name);

  if (missing.length) {
    console.warn(`[email] SMTP is not configured; missing ${missing.join(", ")}.`);
    return null;
  }

  try {
    return nodemailer.createTransport({
      host: cfg.smtpHost,
      port: cfg.smtpPort,
      secure: cfg.smtpSecure,
      auth: { user: cfg.smtpUser, pass: cfg.smtpPass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
  } catch (error) {
    logSmtpFailure("transport creation", error);
    return null;
  }
}

async function sendActivationCode(cfg, to, code) {
  if (typeof cfg.sendEmail === "function") return cfg.sendEmail(to, code);

  const transport = createSmtpTransport(cfg);
  if (!transport) return false;
  try {
    await transport.sendMail({
      from: cfg.emailFrom,
      to,
      subject: "Your RCM account activation code",
      text: `Your RCM account activation code is ${code}. It expires in 10 minutes. If you did not request this, ignore this email.`,
    });
    console.info("[email] SMTP relay accepted an activation email.");
    return true;
  } catch (error) {
    logSmtpFailure("activation delivery", error);
    return false;
  } finally {
    transport.close();
  }
}

async function sendVerificationEmail(cfg, to, token) {
  if (typeof cfg.sendVerificationEmail === "function") return cfg.sendVerificationEmail(to, token);

  const transport = createSmtpTransport(cfg);
  if (!transport) return false;
  try {
    const link = `${cfg.clientOrigin}/verify-email#token=${encodeURIComponent(token)}`;
    await transport.sendMail({
      from: cfg.emailFrom,
      to,
      subject: "Verify your RCM Tours and Travels email",
      text: `Please verify your email address by opening this link within 24 hours:\n\n${link}\n\nIf you did not create this account, you can ignore this email.`,
    });
    console.info("[email] SMTP relay accepted an email verification message.");
    return true;
  } catch (error) {
    logSmtpFailure("verification delivery", error);
    return false;
  } finally {
    transport.close();
  }
}

module.exports = { sendActivationCode, sendVerificationEmail, createSmtpTransport, logSmtpFailure };
