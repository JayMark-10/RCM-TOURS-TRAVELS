
"use strict";

const COOKIE_NAME = "rcm_sid";

function parseCookies(header = "") {
  const out = {};

  for (const part of header.split(";")) {
    const i = part.indexOf("=");

    if (i < 1) continue;

    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();

    try {
      out[key] = decodeURIComponent(value);
    } catch {
      // Ignore malformed cookie values.
    }
  }

  return out;
}

function cookieOptions(cfg, maxAgeMs) {
  const sameSite = cfg.cookieSameSite || "lax";

  const options = {
    httpOnly: true,
    secure: cfg.isProd,
    sameSite,
    path: "/",
  };

  if (cfg.cookieDomain) {
    options.domain = cfg.cookieDomain;
  }

  if (maxAgeMs) {
    options.maxAge = maxAgeMs;
  }

  return options;
}

module.exports = {
  COOKIE_NAME,
  parseCookies,
  cookieOptions,
};
