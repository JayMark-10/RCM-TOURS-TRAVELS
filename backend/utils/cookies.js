"use strict";
const COOKIE_NAME = "rcm_sid";

function parseCookies(header) {
  const out = {};
  if (!header || typeof header !== "string") return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 1) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    try { out[k] = decodeURIComponent(v); } catch { /* ignore malformed cookie */ }
  }
  return out;
}

function cookieOptions(cfg, maxAgeMs) {
  const o = {
    httpOnly: true,
    secure: cfg.isProd,
    sameSite: "lax",
    path: "/",
  };
  if (cfg.cookieDomain) o.domain = cfg.cookieDomain;
  if (maxAgeMs) o.maxAge = maxAgeMs;
  return o;
}

module.exports = { COOKIE_NAME, parseCookies, cookieOptions };
