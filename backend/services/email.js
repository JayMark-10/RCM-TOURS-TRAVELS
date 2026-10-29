"use strict";

const { Resend } = require("resend");

function safeErrorDetails(error, protectedValues = []) {
  const details = {};
  const statusCode = Number(error?.statusCode);
  if (Number.isInteger(statusCode) && statusCode >= 100 && statusCode <= 599) {
    details.statusCode = statusCode;
  }
  for (const field of ["code", "name"]) {
    const value = error?.[field];
    if (
      typeof value === "string" &&
      value.length <= 30 &&
      /^[A-Za-z0-9_-]{1,30}$/.test(value) &&
      !protectedValues.some((secret) => secret && value.includes(secret))
    ) {
      details[field] = value;
    }
  }
  if (!Object.keys(details).length) details.code = "unknown";
  return details;
}

function logResendFailure(action, error, protectedValues) {
  // Provider messages may contain recipient data or request details; log only
  // bounded status/type fields and never the raw SDK error object.
  console.error(`[email] Resend ${action} failed.`, safeErrorDetails(error, protectedValues));
}

function isValidClientOrigin(value) {
  if (typeof value !== "string" || !value) return false;
  try {
    const parsed = new URL(value);
    return ["http:", "https:"].includes(parsed.protocol) &&
      !parsed.username &&
      !parsed.password &&
      (parsed.pathname === "/" || parsed.pathname === "") &&
      !parsed.search &&
      !parsed.hash;
  } catch {
    return false;
  }
}

async function sendEmailMessage(cfg, { to, subject, text, action = "delivery", sensitiveValues = [] }) {
  const protectedValues = [cfg.resendApiKey, to, ...sensitiveValues];
  const missing = [];
  if (!cfg.resendApiKey) missing.push("RESEND_API_KEY");
  if (!cfg.emailFrom) missing.push("EMAIL_FROM");
  if (missing.length) {
    console.warn(`[email] Resend ${action} unavailable; missing ${missing.join(", ")}.`);
    return false;
  }

  try {
    const client = cfg.resendClient || new Resend(cfg.resendApiKey);
    const result = await client.emails.send({
      from: cfg.emailFrom,
      to: [to],
      subject,
      text,
    });
    if (result?.error) {
      logResendFailure(action, result.error, protectedValues);
      return false;
    }
    if (typeof result?.data?.id !== "string" || !result.data.id) {
      logResendFailure(action, { code: "missing_provider_message_id" }, protectedValues);
      return false;
    }
    console.info(`[email] Resend accepted ${action}.`);
    return true;
  } catch (error) {
    logResendFailure(action, error, protectedValues);
    return false;
  }
}

async function sendActivationCode(cfg, to, code) {
  if (typeof cfg.sendEmail === "function") return cfg.sendEmail(to, code);
  return sendEmailMessage(cfg, {
    to,
    subject: "Your RCM account activation code",
    text: `Your RCM account activation code is ${code}. It expires in 10 minutes. If you did not request this, ignore this email.`,
    action: "activation delivery",
    sensitiveValues: [code],
  });
}

async function sendVerificationEmail(cfg, to, token) {
  if (typeof cfg.sendVerificationEmail === "function") return cfg.sendVerificationEmail(to, token);
  if (!isValidClientOrigin(cfg.clientOrigin)) {
    console.warn("[email] Resend verification delivery unavailable; CLIENT_ORIGIN is missing or invalid.");
    return false;
  }
  const link = `${cfg.clientOrigin}/verify-email#token=${encodeURIComponent(token)}`;
  return sendEmailMessage(cfg, {
    to,
    subject: "Verify your RCM Tours and Travels email",
    text: `Please verify your email address by opening this link within 24 hours:\n\n${link}\n\nIf you did not create this account, you can ignore this email.`,
    action: "verification delivery",
    sensitiveValues: [token, link],
  });
}

module.exports = { sendActivationCode, sendVerificationEmail, sendEmailMessage, logResendFailure };
