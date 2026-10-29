
"use strict";

// These tests do not require a database connection.
const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

const { startServer, client, ORIGIN } = require("./helpers");
const { authLimiter } = require("../middleware/rateLimit");
const { loadEnv } = require("../config/env");
const { assertTransactionTopology } = require("../config/db");
const { newToken, hashToken } = require("../utils/tokens");
const { parseCookies } = require("../utils/cookies");
const { assertSafeKeys, escapeRegex } = require("../utils/sanitize");
const v = require("../utils/validate");
const { validateServiceDetails, readStaffId } = require("../controllers/requests");
const { errorHandler } = require("../middleware/errorHandler");
const { sendActivationCode } = require("../services/email");
const { configureLocalDns } = require("../utils/localDns");
const {
  centsToMoney,
  moneyToCents,
  quotationTotalCents,
  remainingBalanceCents,
  verifiedPaymentCents,
} = require("../utils/paymentMoney");

let srv;
let c;

test("auth limiter counts failed responses but not successful login or logout", async () => {
  const app = express();
  app.use(express.json());
  app.post("/login", authLimiter({ authRateMax: 2 }), (req, res) => {
    if (req.body.success) return res.json({ ok: true });
    return res.status(401).json({ error: "Invalid credentials." });
  });
  app.post("/logout", (_req, res) => res.json({ ok: true }));
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, () => resolve(listener));
  });
  const c = client(`http://127.0.0.1:${server.address().port}`);

  try {
    for (let i = 0; i < 5; i++) {
      assert.equal((await c.call("POST", "/login", { success: true })).status, 200);
      assert.equal((await c.call("POST", "/logout")).status, 200);
    }

    assert.equal((await c.call("POST", "/login", { success: false })).status, 401);
    assert.equal((await c.call("POST", "/login", { success: false })).status, 401);
    assert.equal((await c.call("POST", "/login", { success: false })).status, 429);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("payment money uses cents, clamps zero balances, and deduplicates verified records", () => {
  const request = { quotation: { items: [{ amount: 124.99 }, { amount: 125.01 }] } };
  const repeatedPayments = [
    { _id: "verified-1", status: "Verified", amountVerified: 100.1 },
    { _id: "verified-1", status: "Verified", amountVerified: 100.1 },
    { _id: "pending-1", status: "Pending Verification", amountVerified: 100 },
    { _id: "rejected-1", status: "Rejected", amountVerified: 100 },
  ];

  assert.equal(quotationTotalCents(request), 25000);
  assert.equal(verifiedPaymentCents(repeatedPayments), 10010);
  assert.equal(remainingBalanceCents(quotationTotalCents(request), verifiedPaymentCents(repeatedPayments)), 14990);
  assert.equal(moneyToCents(1.005), 101);
  assert.equal(centsToMoney(1001), 10.01);
  assert.equal(remainingBalanceCents(25000, 25000), 0);
  assert.equal(remainingBalanceCents(25000, 25001), 0);
});

test("customer payment balance ignores pending/rejected reports and handles paid and rounded totals", async () => {
  const {
    centsToMoney: uiCentsToMoney,
    moneyToCents: uiMoneyToCents,
    paymentBalance,
    quotationPaymentSummaries,
    combinedPaymentBalance,
    formatPaymentDate,
    formatReviewedAt,
  } =
    await import("../../frontend/src/utils/paymentMoney.js");
  const quotation = { items: [{ amount: 124.99 }, { amount: 125.01 }] };
  const initial = paymentBalance(quotation, []);
  assert.deepEqual(initial, { totalCents: 25000, verifiedCents: 0, outstandingCents: 25000, status: "Unpaid" });
  assert.equal(paymentBalance(quotation, [{ id: "pending", status: "Pending Verification", amountReported: 250 }]).outstandingCents, 25000);
  assert.equal(paymentBalance(quotation, [{ id: "rejected", status: "Rejected", amountReported: 250 }]).outstandingCents, 25000);
  assert.deepEqual(paymentBalance(quotation, [{ id: "partial", status: "Verified", amountVerified: 200 }]), { totalCents: 25000, verifiedCents: 20000, outstandingCents: 5000, status: "Partially Paid" });
  assert.equal(paymentBalance(quotation, [{ id: "paid", status: "Verified", amountVerified: 250 }]).status, "Paid");
  assert.equal(paymentBalance(quotation, [{ id: "duplicate", status: "Verified", amountVerified: 250 }, { id: "duplicate", status: "Verified", amountVerified: 250 }]).verifiedCents, 25000);
  assert.equal(uiMoneyToCents(1.005), 101);
  assert.equal(uiCentsToMoney(0), 0);
  assert.equal(paymentBalance({ items: [{ amount: 0 }] }, []).outstandingCents, 0);
  assert.equal(paymentBalance({ items: [] }, [{ id: "unexpected", status: "Verified", amountVerified: 10 }]).status, "Unpaid");

  const requests = [
    { id: "quote-a", ref: "RCM-A", customerName: "Customer", quotation: { state: "Accepted", items: [{ amount: 100 }], quotationNumber: "Q-A" } },
    { id: "quote-b", ref: "RCM-B", customerName: "Customer", quotation: { state: "Accepted", items: [{ amount: 50 }], quotationNumber: "Q-B" } },
    { id: "quote-b", ref: "RCM-B", customerName: "Customer", quotation: { state: "Accepted", items: [{ amount: 50 }], quotationNumber: "Q-B" } },
  ];
  const summaries = quotationPaymentSummaries(requests, [
    { id: "paid-1", requestId: "quote-a", status: "Verified", amountVerified: 30 },
    { id: "paid-1", requestId: "quote-a", status: "Verified", amountVerified: 30 },
    { id: "paid-2", requestId: "quote-a", status: "Verified", amountVerified: 20 },
    { id: "pending", requestId: "quote-a", status: "Pending Verification", amountReported: 40 },
    { id: "rejected", requestId: "quote-b", status: "Rejected", amountReported: 50 },
  ]);
  assert.equal(summaries.length, 2);
  assert.deepEqual(summaries.map(({ balance }) => balance), [
    { totalCents: 10000, verifiedCents: 5000, outstandingCents: 5000, status: "Partially Paid" },
    { totalCents: 5000, verifiedCents: 0, outstandingCents: 5000, status: "Unpaid" },
  ]);
  assert.deepEqual(combinedPaymentBalance(summaries), {
    totalCents: 15000,
    verifiedCents: 5000,
    outstandingCents: 10000,
    status: "Partially Paid",
  });
  assert.equal(formatPaymentDate("2026-10-29T00:00:00.000Z"), "10/29/2026");
  assert.equal(formatPaymentDate("invalid"), "Not available");
  assert.equal(formatReviewedAt("invalid"), "Not available");
  assert.match(formatReviewedAt("2026-10-29T12:27:24.000Z"), /^10\/29\/2026, /);
});

test.before(async () => {
  srv = await startServer();
  c = client(srv.url);
});

test.after(async () => {
  await srv.close();
});

test("health route works", async () => {
  const r = await c.call("GET", "/api/health");

  assert.equal(r.status, 200);
});

test("readiness reports unavailable while MongoDB is disconnected", async () => {
  const r = await c.call("GET", "/api/ready");
  assert.equal(r.status, 503);
  assert.deepEqual(r.json, { ok: false });
});

test("document and payment uploads reject unauthenticated requests before parsing JSON", async () => {
  const requestId = "0123456789abcdef01234567";
  const document = await c.call(
    "POST",
    `/api/requests/${requestId}/documents`,
    undefined,
    { raw: "{" }
  );
  const payment = await c.call(
    "POST",
    "/api/payments",
    undefined,
    { raw: "{" }
  );

  assert.equal(document.status, 401);
  assert.equal(payment.status, 401);
});

test("security headers are set and x-powered-by is hidden", async () => {
  const res = await fetch(srv.url + "/api/health");

  assert.ok(res.headers.get("x-content-type-options"));
  assert.equal(res.headers.get("x-powered-by"), null);
});

test("CORS allows only the site origin", async () => {
  const ok = await fetch(srv.url + "/api/health", {
    headers: { Origin: ORIGIN },
  });

  assert.equal(ok.headers.get("access-control-allow-origin"), ORIGIN);

  const bad = await fetch(srv.url + "/api/health", {
    headers: { Origin: "http://evil.example" },
  });

  assert.notEqual(
    bad.headers.get("access-control-allow-origin"),
    "http://evil.example"
  );
});

test("state-changing request from a foreign origin is refused (CSRF)", async () => {
  const r = await c.call(
    "POST",
    "/api/auth/login",
    {
      email: "a@b.co",
      password: "x",
      role: "customer",
    },
    { origin: "http://evil.example" }
  );

  assert.equal(r.status, 403);
});

test("form-encoded body is refused (CSRF)", async () => {
  const r = await c.call(
    "POST",
    "/api/auth/login",
    undefined,
    {
      raw: "email=a@b.co&password=x",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );

  assert.equal(r.status, 415);
});

test("NoSQL operator login payload is rejected", async () => {
  const r = await c.call("POST", "/api/auth/login", {
    email: { $ne: "" },
    password: { $ne: "" },
    role: "admin",
  });

  assert.equal(r.status, 400);
});

test("keys containing $ or . are rejected anywhere in the body", async () => {
  const r = await c.call("POST", "/api/auth/login", {
    email: "a@b.co",
    password: "x",
    role: "customer",
    extra: {
      "a.b": 1,
    },
  });

  assert.equal(r.status, 400);
});

test("database connection failures return a safe 503 response", () => {
  const error = new Error(
    "Operation `users.findOne()` buffering timed out after 10000ms"
  );

  error.name = "MongooseError";

  let statusCode;
  let responseBody;

  const req = {
    method: "POST",
    path: "/api/auth/login",
  };

  const res = {
    headersSent: false,

    status(code) {
      statusCode = code;
      return this;
    },

    json(body) {
      responseBody = body;
      return this;
    },
  };

  const originalConsoleError = console.error;

  try {
    console.error = () => {};

    errorHandler(error, req, res, () => {});
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(statusCode, 503);

  assert.equal(
    responseBody.error,
    "Service temporarily unavailable."
  );

  assert.ok(responseBody.ref);

  assert.equal(
    JSON.stringify(responseBody).includes("users.findOne"),
    false
  );
});

test("empty, oversized and malformed bodies give clean errors", async () => {
  const empty = await c.call("POST", "/api/auth/login", {});

  assert.equal(empty.status, 400);

  const big = await c.call("POST", "/api/auth/login", {
    email: "a@b.co",
    password: "x".repeat(60000),
    role: "customer",
  });

  assert.equal(big.status, 413);

  const bad = await c.call(
    "POST",
    "/api/auth/login",
    undefined,
    { raw: "{not json" }
  );

  assert.equal(bad.status, 400);
  assert.equal(bad.json.error, "Malformed JSON.");

  for (const r of [big, bad]) {
    const responseText = JSON.stringify(r.json);

    assert.ok(!/stack|node_modules|at \w+/.test(responseText));
  }
});

test("registration rejects weak password and missing consent before touching the database", async () => {
  const base = {
    key: "abc",
    name: "N",
    email: "a@b.co",
    consent: true,
  };

  const weakPassword = await c.call(
    "POST",
    "/api/auth/register",
    {
      ...base,
      password: "short",
    }
  );

  assert.equal(weakPassword.status, 400);

  const missingConsent = await c.call(
    "POST",
    "/api/auth/register",
    {
      ...base,
      password: "longenoughpass",
      consent: false,
    }
  );

  assert.equal(missingConsent.status, 400);
});

test("registration API rejects invalid full names and Philippine mobile numbers before database access", async () => {
  const base = {
    email: "validation@example.com",
    password: "longenoughpass",
    consent: true,
  };

  for (const name of ["Juan123", "Juan😀", "12345"]) {
    const response = await c.call("POST", "/api/auth/register", {
      ...base,
      name,
      phone: "09171234567",
    });
    assert.equal(response.status, 400, name);
    assert.match(response.json.error, /full name/i);
  }

  const unicodeName = await c.call("POST", "/api/auth/register", {
    ...base,
    name: "  José D’Arcy  ",
    phone: "+639171234567",
  });
  assert.equal(unicodeName.status, 400);
  assert.match(unicodeName.json.error, /11-digit Philippine mobile/i);

  for (const key of [undefined, null, "", false, 0]) {
    const response = await c.call("POST", "/api/auth/register", {
      ...base,
      ...(key === undefined ? {} : { key }),
      name: "Juan Dela Cruz",
      phone: "+639171234567",
    });
    assert.equal(response.status, 400, `key=${String(key)}`);
    assert.match(response.json.error, /11-digit Philippine mobile/i);
  }
});

test("protected routes return 401 without a session cookie", async () => {
  const routes = [
    ["GET", "/api/auth/me"],
    ["GET", "/api/invitations"],
    ["POST", "/api/invitations"],
    ["DELETE", "/api/invitations/abc"],
    ["GET", "/api/requests"],
    ["POST", "/api/requests"],
    ["GET", "/api/requests/aaaaaaaaaaaaaaaaaaaaaaaa"],
    ["POST", "/api/requests/aaaaaaaaaaaaaaaaaaaaaaaa/messages"],
    ["PATCH", "/api/requests/aaaaaaaaaaaaaaaaaaaaaaaa/status"],
    ["GET", "/api/users"],
    ["PATCH", "/api/users/me"],
    ["GET", "/api/notifications"],
    ["PATCH", "/api/notifications/read-all"],
    ["GET", "/api/services/admin"],
    ["GET", "/api/services/workspace"],
    ["PUT", "/api/services/example"],
    ["DELETE", "/api/services/example"],
    ["PATCH", "/api/settings"],
    ["GET", "/api/audit-events"],
    ["GET", "/api/services/admin"],
    ["PUT", "/api/services/example"],
    ["DELETE", "/api/services/example"],
    ["PATCH", "/api/settings"],
    ["GET", "/api/audit-events"],
    ["GET", "/api/services/admin"],
    ["PUT", "/api/services/example"],
    ["DELETE", "/api/services/example"],
    ["PATCH", "/api/settings"],
    ["GET", "/api/audit-events"],
  ];

  for (const [method, path] of routes) {
    const r = await c.call(
      method,
      path,
      method === "POST" ? { role: "customer" } : undefined
    );

    assert.equal(r.status, 401, `${method} ${path}`);
  }
});

test("obsolete staff-issued request activation endpoint is retired", async () => {
  const response = await c.call("POST", "/api/requests/aaaaaaaaaaaaaaaaaaaaaaaa/customer-activation");
  assert.equal(response.status, 404);
});

test("unknown route returns a plain 404", async () => {
  const r = await c.call("GET", "/api/nothing");

  assert.equal(r.status, 404);
});

test("customer email-verification endpoints are retired", async () => {
  assert.equal((await c.call("POST", "/api/auth/verify-email", { token: "ignored" })).status, 404);
  assert.equal((await c.call("POST", "/api/auth/resend-verification", { email: "person@example.com" })).status, 404);
});

test("tokens: random, long, hashed deterministically", () => {
  const a = newToken();
  const b = newToken();

  assert.notEqual(a, b);
  assert.ok(a.length >= 43);
  assert.equal(hashToken(a), hashToken(a));
  assert.notEqual(hashToken(a), a);
});

test("cookie parsing and regex escaping", () => {
  assert.deepEqual(
    parseCookies("a=1; rcm_sid=xyz"),
    {
      a: "1",
      rcm_sid: "xyz",
    }
  );

  assert.deepEqual(parseCookies(undefined), {});

  assert.equal(new RegExp(escapeRegex(".*")).test("abc"), false);

  assert.throws(() => assertSafeKeys({ a: { $gt: 1 } }));
});

test("password rules", () => {
  assert.throws(() => v.newPassword("short"));
  assert.throws(() => v.newPassword("é".repeat(40)));

  assert.equal(
    v.newPassword("a-long-enough-password"),
    "a-long-enough-password"
  );
});

test("activation email delivery is disabled without an injected test sender", async () => {
  const previous = console.warn;
  let warning = "";
  console.warn = (...args) => { warning = args.join(" "); };
  try {
    const cfg = {};
    assert.equal(await sendActivationCode(cfg, "customer@example.com", "123456"), false);
    assert.match(warning, /disabled/);
    assert.equal(warning.includes("123456"), false);
  } finally {
    console.warn = previous;
  }
});

test("activation email injection receives its original arguments", async () => {
  let deliveredTo = "";
  let deliveredCode = "";
  const sent = await sendActivationCode({ sendEmail: async (to, code) => { deliveredTo = to; deliveredCode = code; return true; } }, "customer@example.com", "654321");
  assert.equal(sent, true);
  assert.equal(deliveredTo, "customer@example.com");
  assert.equal(deliveredCode, "654321");
});

test("existing injected email callbacks remain supported", async () => {
  let sent = null;
  const activation = await sendActivationCode({
    sendEmail: async (to, code) => { sent = { to, code }; return true; },
  }, "customer@example.com", "654321");
  assert.equal(activation, true);
  assert.deepEqual(sent, { to: "customer@example.com", code: "654321" });
});

test("local DNS workaround matches server startup and is skipped in production", () => {
  const dns = require("node:dns");
  const original = dns.getServers();
  try {
    configureLocalDns({ nodeEnv: "development" });
    assert.deepEqual(dns.getServers(), ["8.8.8.8", "8.8.4.4"]);
    configureLocalDns({ nodeEnv: "production" });
    assert.deepEqual(dns.getServers(), ["8.8.8.8", "8.8.4.4"]);
  } finally {
    dns.setServers(original);
  }
});

test("config refuses weak production settings", () => {
  assert.equal(
    loadEnv({
      MONGODB_URI: "mongodb://localhost:27017/rcm",
      CLIENT_ORIGIN: "http://localhost:5173",
    }).staffKeyMs,
    48 * 60 * 60 * 1000,
  );
  assert.equal(
    loadEnv({
      MONGODB_URI: "mongodb://localhost:27017/rcm",
      CLIENT_ORIGIN: "http://localhost:5173",
      STAFF_KEY_HOURS: "72",
    }).staffKeyMs,
    72 * 60 * 60 * 1000,
  );

  assert.throws(
    () =>
      loadEnv({
        NODE_ENV: "production",
        MONGODB_URI: "x",
        CLIENT_ORIGIN: "http://site.example",
      }),
    /https/
  );

  assert.throws(
    () => loadEnv({ NODE_ENV: "development" }),
    /MONGODB_URI/
  );

  assert.equal(
    loadEnv({
      MONGODB_URI: "mongodb://localhost:27017/rcm",
      CLIENT_ORIGIN: "http://localhost:5173/",
    }).clientOrigin,
    "http://localhost:5173"
  );

  assert.throws(
    () => loadEnv({
      MONGODB_URI: "mongodb://localhost:27017/rcm",
      CLIENT_ORIGIN: "https://site.example/path",
      TRUST_PROXY: "-1",
    }),
    /CLIENT_ORIGIN|TRUST_PROXY/
  );
  assert.throws(
    () => loadEnv({
      MONGODB_URI: "mongodb://localhost:27017/rcm",
      CLIENT_ORIGIN: "https://site.example",
      TRUST_PROXY: "1.5",
    }),
    /TRUST_PROXY/
  );
});

test("startup rejects MongoDB topologies without transaction support", () => {
  assert.doesNotThrow(() => assertTransactionTopology("ReplicaSetWithPrimary"));
  assert.doesNotThrow(() => assertTransactionTopology("Sharded"));
  assert.throws(() => assertTransactionTopology("Single"), {
    code: "MONGO_TRANSACTIONS_REQUIRED",
  });
});

test("full-name and Philippine mobile validators enforce accepted formats", () => {
  for (const name of ["Juan Dela Cruz", "Mary-Jane O'Connor", "José Dela Peña", "D’Arcy Santos"]) {
    assert.equal(v.fullName(` ${name} `), name);
  }
  for (const name of ["", "Juan123", "Juan😀", "12345", "Juan_Santos"]) {
    assert.throws(() => v.fullName(name), /full name/i);
  }

  assert.equal(v.philippineMobile("09171234567"), "09171234567");
  for (const phone of ["0917123456", "091712345678", "0917ABC4567", "+639171234567", "0917 123 4567"]) {
    assert.throws(() => v.philippineMobile(phone), /11-digit Philippine mobile/i);
  }
  assert.equal(v.philippineMobile("", "phone", { optional: true }), "");
});

test("numeric validation rejects coercible non-numbers and keeps business bounds", () => {
  assert.equal(v.numeric("12.50", "amount", { min: 0.01, max: 100000000, label: "payment amount" }), 12.5);
  assert.equal(v.numeric(1e3, "amount", { min: 0.01, max: 100000000, label: "payment amount" }), 1000);
  for (const value of [true, false, null, "", "   ", "0x10", "Infinity", {}, []]) {
    assert.throws(
      () => v.numeric(value, "amount", { min: 0.01, max: 100000000, label: "payment amount" }),
      /valid payment amount/i,
    );
  }
  assert.throws(() => v.numeric(100000001, "amount", { min: 0.01, max: 100000000, label: "payment amount" }), /valid payment amount/i);
});

test("dynamic request fields enforce their configured input types", () => {
  const service = { fields: [
    { key: "travellers", label: "Travellers", type: "number", required: true },
    { key: "destination", label: "Destination", type: "text", required: true },
    { key: "depart", label: "Departure", type: "date", required: true },
  ] };
  const valid = { travellers: "2", destination: "Cebu", depart: "2027-01-10" };
  validateServiceDetails(service, valid);
  assert.equal(valid.travellers, 2);
  for (const details of [
    { travellers: true, destination: "Cebu", depart: "2027-01-10" },
    { travellers: "2", destination: 2, depart: "2027-01-10" },
    { travellers: "2", destination: "Cebu", depart: true },
  ]) {
    assert.throws(() => validateServiceDetails(service, details), /valid/i);
  }
});

test("request assignment only clears when staffId is explicitly null", () => {
  assert.equal(readStaffId({ staffId: null }), null);
  assert.equal(readStaffId({ staffId: "507f1f77bcf86cd799439011" }), "507f1f77bcf86cd799439011");
  for (const body of [{}, { staffId: "" }, { staffId: false }, { staffId: [] }]) {
    assert.throws(() => readStaffId(body), /staff account|assignment/i);
  }
});
