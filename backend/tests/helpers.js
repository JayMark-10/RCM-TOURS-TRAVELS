"use strict";
const { createApp } = require("../app");

const ORIGIN = "http://localhost:5173";
let testActivationCode = "";
let testVerificationToken = "";
const baseCfg = {
  nodeEnv: "test", isProd: false, port: 0, mongoUri: "", clientOrigin: ORIGIN, cookieDomain: undefined, trustProxy: 0,
  sessionIdleMs: 30 * 60 * 1000, sessionAbsoluteMs: 8 * 3600 * 1000, customerKeyMs: 7 * 86400000, staffKeyMs: 48 * 3600000,
  authRateMax: 100000, paymentReportMax: 100000, maxFailedLogins: 5, lockoutMs: 15 * 60 * 1000,
  sendEmail: async (_to, code) => { testActivationCode = code; return true; },
  sendVerificationEmail: async (_to, token) => { testVerificationToken = token; return true; },
};

async function startServer(over = {}) {
  const app = createApp({ ...baseCfg, ...over });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const url = `http://127.0.0.1:${server.address().port}`;
  return { url, close: () => new Promise((r) => server.close(r)) };
}

// Tiny client that keeps cookies, like a browser tab.
function client(url) {
  let cookie = "";
  async function call(method, path, body, { origin = ORIGIN, headers = {}, raw } = {}) {
    const h = { ...headers };
    if (origin) h.Origin = origin;
    if (cookie) h.Cookie = cookie;
    if (body !== undefined || raw !== undefined) h["Content-Type"] = h["Content-Type"] || "application/json";
    const res = await fetch(url + path, { method, headers: h, body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined });
    const set = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const sc of set) { const pair = sc.split(";")[0]; if (/=$/.test(pair)) cookie = ""; else cookie = pair; }
    let json = null; try { json = await res.json(); } catch {}
    return { status: res.status, json, headers: Object.fromEntries(res.headers.entries()), setCookie: set, cookie };
  }
  return { call, setCookie: (c) => { cookie = c; }, getCookie: () => cookie };
}

module.exports = { startServer, client, ORIGIN, getTestActivationCode: () => testActivationCode, getTestVerificationToken: () => testVerificationToken };
