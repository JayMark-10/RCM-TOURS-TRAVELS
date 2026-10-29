
"use strict";

const path = require("path");

if (process.env.NODE_ENV !== "test") {
  require("dotenv").config({
    path: path.resolve(__dirname, "../.env"),
  });
}

// Reads and validates environment variables once, at startup.
// Fails fast with a clear message instead of running with weak settings.
function loadEnv(env = process.env) {
  const nodeEnv = env.NODE_ENV || "development";
  const isProd = nodeEnv === "production";
  const problems = [];

  if (!["development", "test", "production"].includes(nodeEnv)) {
    problems.push("NODE_ENV must be development, test, or production.");
  }

  const mongoUri = env.MONGODB_URI || "";
  let clientOrigin = "";

  if (env.CLIENT_ORIGIN) {
    try {
      const parsedOrigin = new URL(env.CLIENT_ORIGIN);

      if (
        !["http:", "https:"].includes(parsedOrigin.protocol) ||
        parsedOrigin.username ||
        parsedOrigin.password ||
        (parsedOrigin.pathname !== "/" && parsedOrigin.pathname !== "") ||
        parsedOrigin.search ||
        parsedOrigin.hash
      ) {
        problems.push(
          "CLIENT_ORIGIN must be a site origin without a path, query, or credentials."
        );
      } else {
        clientOrigin = parsedOrigin.origin;
      }
    } catch {
      problems.push("CLIENT_ORIGIN must be a valid site origin.");
    }
  }

  if (mongoUri) {
    try {
      const parsedMongoUri = new URL(mongoUri);

      if (
        !["mongodb:", "mongodb+srv:"].includes(parsedMongoUri.protocol) ||
        !parsedMongoUri.hostname
      ) {
        problems.push(
          "MONGODB_URI must be a valid mongodb:// or mongodb+srv:// URI."
        );
      }
    } catch {
      problems.push(
        "MONGODB_URI must be a valid mongodb:// or mongodb+srv:// URI."
      );
    }
  }

  if (!mongoUri) {
    problems.push("MONGODB_URI is required.");
  }

  if (!clientOrigin) {
    problems.push(
      "CLIENT_ORIGIN is required (e.g. http://localhost:5173)."
    );
  }

  if (isProd && clientOrigin && !clientOrigin.startsWith("https://")) {
    problems.push("CLIENT_ORIGIN must use https:// in production.");
  }

  const int = (name, def) => {
    const value =
      env[name] === undefined || env[name] === ""
        ? def
        : Number(env[name]);

    if (!Number.isSafeInteger(value) || value <= 0) {
      problems.push(`${name} must be a positive integer.`);
    }

    return value;
  };

  const trustProxy =
    env.TRUST_PROXY === undefined || env.TRUST_PROXY === ""
      ? 0
      : Number(env.TRUST_PROXY);

  if (!Number.isSafeInteger(trustProxy) || trustProxy < 0) {
    problems.push("TRUST_PROXY must be a non-negative integer hop count.");
  }

  const cookieDomain = env.COOKIE_DOMAIN || undefined;

  if (
    cookieDomain &&
    !/^(?:\.)?(?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?)(?:\.[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?)*$/i.test(
      cookieDomain
    )
  ) {
    problems.push(
      "COOKIE_DOMAIN must be a hostname, optionally prefixed by a dot."
    );
  }

  const cookieSameSite = (
    env.COOKIE_SAME_SITE || "lax"
  ).toLowerCase();

  if (!["lax", "strict", "none"].includes(cookieSameSite)) {
    problems.push(
      "COOKIE_SAME_SITE must be lax, strict, or none."
    );
  }

  if (cookieSameSite === "none" && !isProd) {
    problems.push(
      "COOKIE_SAME_SITE=none requires production mode."
    );
  }

  const cfg = {
    nodeEnv,
    isProd,
    port: int("PORT", 4000),
    mongoUri,
    clientOrigin,
    cookieDomain,
    cookieSameSite,
    trustProxy,

    sessionIdleMs: int("SESSION_IDLE_MINUTES", 30) * 60 * 1000,
    sessionAbsoluteMs: int("SESSION_ABSOLUTE_HOURS", 8) * 60 * 60 * 1000,
    customerKeyMs: int("CUSTOMER_KEY_DAYS", 7) * 24 * 60 * 60 * 1000,

    resendApiKey: env.RESEND_API_KEY || "",
    emailFrom: env.EMAIL_FROM || "",

    staffKeyMs: int("STAFF_KEY_HOURS", 48),
    authRateMax: int("AUTH_RATE_MAX", 10),
    maxFailedLogins: int("MAX_FAILED_LOGINS", 5),
    lockoutMs: int("LOCKOUT_MINUTES", 15) * 60 * 1000,
  };

  if (problems.length) {
    throw new Error(
      "Invalid configuration:\n - " + problems.join("\n - ")
    );
  }

  return cfg;
}

module.exports = { loadEnv };
