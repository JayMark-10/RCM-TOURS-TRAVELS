"use strict";

// Full-flow tests.
// These tests require a separate TEST MongoDB database.
// WARNING: The tests delete records from their test collections.
//
// PowerShell:
// $env:ALLOW_DESTRUCTIVE_TESTS = "1"
// $env:TEST_MONGODB_URI = "mongodb://127.0.0.1:27017/rcm_test"
// npm test

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");

const URI = process.env.TEST_MONGODB_URI;
const skip = URI
  ? false
  : "set TEST_MONGODB_URI to run database tests";

const { startServer, client, getTestActivationCode } = require("./helpers");
const { connectDb, mongoose } = require("../config/db");

const User = require("../models/User");
const Session = require("../models/Session");
const Invitation = require("../models/Invitation");
const SecurityEvent = require("../models/SecurityEvent");
const Request = require("../models/Request");
const Notification = require("../models/Notification");
const Service = require("../models/Service");
const SystemSetting = require("../models/SystemSetting");
const Payment = require("../models/Payment");
const RequestFile = require("../models/RequestFile");
const { ensureDefaultServices } = require("../config/defaultServices");
const { hashToken } = require("../utils/tokens");
const { isSafeTestDatabase } = require("./databaseSafety");
const { withPaymentTransaction } = require("../controllers/payments");

const PW = "correct-horse-battery";

let srv;

async function makeUser(overrides = {}) {
  return User.create({
    name: "T",
    email: "t@x.co",
    passwordHash: await bcrypt.hash(PW, 4),
    role: "customer",
    ...overrides,
  });
}

async function login(c, email, password = PW) {
  return c.call("POST", "/api/auth/login", {
    email,
    password,
  });
}

test.before(async () => {
  if (skip) {
    return;
  }

  if (!isSafeTestDatabase(URI, process.env.ALLOW_DESTRUCTIVE_TESTS)) {
    throw new Error(
      "Refusing database tests: explicitly set ALLOW_DESTRUCTIVE_TESTS=1 and use localhost with the exact disposable database rcm_test."
    );
  }

  await connectDb(URI);
  srv = await startServer({ maxFailedLogins: 3 });
});

test.beforeEach(async () => {
  if (skip) {
    return;
  }

  await Promise.all(
    [User, Session, Invitation, SecurityEvent, Request, Notification, Service, SystemSetting, Payment, RequestFile].map((model) =>
      model.deleteMany({})
    )
  );
  await ensureDefaultServices();
});

test.after(async () => {
  if (skip) {
    return;
  }

  if (srv) {
    await srv.close();
  }

  await mongoose.disconnect();
});

// 1. Login behavior and database-controlled roles.
test(
  "login: success, client-supplied role is ignored, wrong password and inactive accounts are rejected",
  { skip },
  async () => {
    await makeUser({
      email: "c@x.co",
      role: "customer",
    });

    await makeUser({
      email: "off@x.co",
      active: false,
    });

    const normalLogin = await login(client(srv.url), "c@x.co");

    assert.equal(normalLogin.status, 200);
    assert.equal(normalLogin.json.user.role, "customer");
    let account = await User.findOne({ email: "c@x.co" }).select("+passwordHash");
    assert.equal(account.failedLogins, 0);
    assert.equal(account.lockUntil, null);

    // Sending "admin" must not change the role stored in the database.
    const roleAttempt = await client(srv.url).call(
      "POST",
      "/api/auth/login",
      {
        email: "c@x.co",
        password: PW,
        role: "admin",
      }
    );

    assert.equal(roleAttempt.status, 200);
    assert.equal(roleAttempt.json.user.role, "customer");
    account = await User.findOne({ email: "c@x.co" }).select("+passwordHash");
    assert.equal(account.failedLogins, 0);

    const wrongPassword = await login(
      client(srv.url),
      "c@x.co",
      "wrong-password!"
    );

    assert.equal(wrongPassword.status, 401);
    account = await User.findOne({ email: "c@x.co" }).select("+passwordHash");
    assert.equal(account.failedLogins, 1);

    const inactive = await login(client(srv.url), "off@x.co");

    assert.equal(inactive.status, 401);

    const unknownUser = await login(
      client(srv.url),
      "nobody@x.co"
    );

    assert.equal(unknownUser.status, 401);
  }
);

// 2. Session cookie and logout.
test(
  "session cookie is httpOnly and logout really invalidates it",
  { skip },
  async () => {
    await makeUser({ email: "c@x.co" });

    const c = client(srv.url);
    const response = await login(c, "c@x.co");

    assert.match(response.setCookie[0], /HttpOnly/i);
    assert.match(response.setCookie[0], /SameSite=Lax/i);

    const stolenCookie = c.getCookie();

    assert.equal(
      (await c.call("GET", "/api/auth/me")).status,
      200
    );

    await c.call("POST", "/api/auth/logout");
    const account = await User.findOne({ email: "c@x.co" }).select("+passwordHash");
    assert.equal(account.failedLogins, 0);

    const replayClient = client(srv.url);
    replayClient.setCookie(stolenCookie);

    assert.equal(
      (await replayClient.call("GET", "/api/auth/me")).status,
      401
    );
  }
);

// 3. Session expiry and account deactivation.
test(
  "session expires after idle timeout and deactivation takes effect at once",
  { skip },
  async () => {
    const user = await makeUser({ email: "c@x.co" });

    const firstClient = client(srv.url);
    await login(firstClient, "c@x.co");

    await Session.updateMany(
      {},
      {
        lastSeenAt: new Date(Date.now() - 31 * 60 * 1000),
      }
    );

    assert.equal(
      (await firstClient.call("GET", "/api/auth/me")).status,
      401
    );

    const secondClient = client(srv.url);
    await login(secondClient, "c@x.co");

    await User.updateOne(
      { _id: user._id },
      { active: false }
    );

    assert.equal(
      (await secondClient.call("GET", "/api/auth/me")).status,
      401
    );
  }
);

// 4. Login lockout.
test(
  "lockout after repeated failures, even with the right password afterwards",
  { skip },
  async () => {
    await makeUser({ email: "c@x.co" });

    for (let i = 0; i < 3; i++) {
      await login(
        client(srv.url),
        "c@x.co",
        "wrong-password!"
      );
    }

    const response = await login(client(srv.url), "c@x.co");

    assert.equal(response.status, 429);

    assert.ok(
      await SecurityEvent.exists({ type: "account_locked" })
    );

    await User.updateOne(
      { email: "c@x.co" },
      { lockUntil: new Date(Date.now() - 1000), failedLogins: 2 }
    );
    const recovered = await login(client(srv.url), "c@x.co");
    assert.equal(recovered.status, 200);
    const user = await User.findOne({ email: "c@x.co" }).select("+passwordHash");
    assert.equal(user.failedLogins, 0);
    assert.equal(user.lockUntil, null);
  }
);

// 5. Only Admin can issue Staff invitations.
test(
  "invitations: only Admin can issue Staff invitations",
  { skip },
  async () => {
    await makeUser({ email: "cust@x.co" });
    await makeUser({ email: "staff@x.co", role: "staff" });
    await makeUser({ email: "admin@x.co", role: "admin" });

    const customer = client(srv.url);
    await login(customer, "cust@x.co");

    assert.equal(
      (
        await customer.call("POST", "/api/invitations", {
          role: "staff",
        })
      ).status,
      403
    );

    const staff = client(srv.url);
    await login(staff, "staff@x.co");

    assert.equal(
      (
        await staff.call("POST", "/api/invitations", {
          role: "staff",
        })
      ).status,
      403
    );

    assert.equal(
      (
        await staff.call("POST", "/api/invitations", {
          role: "customer",
        })
      ).status,
      403
    );

    assert.equal(
      (await staff.call("GET", "/api/invitations")).status,
      403
    );

    const admin = client(srv.url);
    await login(admin, "admin@x.co");

    assert.equal(
      (
        await admin.call("POST", "/api/invitations", {
          role: "staff",
        })
      ).status,
      201
    );

    assert.equal(
      (
        await admin.call("POST", "/api/invitations", {
          role: "customer",
        })
      ).status,
      400
    );

    assert.equal(
      (
        await admin.call("POST", "/api/invitations", {
          role: "admin",
        })
      ).status,
      400
    );

    const list = await admin.call("GET", "/api/invitations");

    assert.equal(list.status, 200);
    assert.ok(!JSON.stringify(list.json).includes("keyHash"));
    assert.ok(!JSON.stringify(list.json).includes('"key"'));
  }
);

// Helper: create a Staff invitation as Admin.
async function issue(role = "staff", email) {
  await User.deleteMany({ email: "issuer@x.co" });

  await makeUser({
    email: "issuer@x.co",
    role: "admin",
  });

  const admin = client(srv.url);
  await login(admin, "issuer@x.co");

  const response = await admin.call("POST", "/api/invitations", {
    role,
    ...(email ? { email } : {}),
  });

  if (
    response.status !== 201 ||
    !response.json?.key ||
    !response.json?.invitation?.id
  ) {
    throw new Error(
      `Could not issue ${role} invitation: ${JSON.stringify(response.json)}`
    );
  }

  return {
    key: response.json.key,
    id: response.json.invitation.id,
    admin,
  };
}

const reg = (c, key, overrides = {}) =>
  c.call("POST", "/api/auth/register", {
    ...(key !== undefined ? { key } : {}),
    name: "New",
    email: "new@x.co",
    password: PW,
    consent: true,
    ...overrides,
  });

// 6. Staff registration requires a valid, single-use invitation.
test(
  "registration: valid Staff key works once; client role is ignored",
  { skip },
  async () => {
    const { key } = await issue("staff");

    const response = await reg(client(srv.url), key, {
      role: "admin",
      active: true,
      canAssign: true,
    });

    assert.equal(response.status, 201);
    assert.equal(response.json.user.role, "staff");

    const user = await User.findOne({ email: "new@x.co" });

    assert.equal(user.role, "staff");
    assert.notEqual(user.passwordHash, PW);
    assert.notEqual(user.active, false);

    // A used key cannot create another account.
    assert.equal(
      (
        await reg(client(srv.url), key, {
          email: "other@x.co",
        })
      ).status,
      400
    );
  }
);

// 7. Invalid Staff invitations are rejected; customer registration is public.
test(
  "registration: invalid Staff invitations are rejected and customers can register publicly",
  { skip },
  async () => {
    const expired = await issue("staff");

    await Invitation.updateOne(
      { _id: expired.id },
      { $set: { expiresAt: new Date(Date.now() - 1000) } }
    );

    assert.equal(
      (await reg(client(srv.url), expired.key)).status,
      400
    );

    const revoked = await issue("staff");

    assert.equal(
      (
        await revoked.admin.call(
          "DELETE",
          `/api/invitations/${revoked.id}`
        )
      ).status,
      200
    );

    assert.equal(
      (await reg(client(srv.url), revoked.key)).status,
      400
    );

    assert.equal(
      (await reg(client(srv.url), "not-a-key")).status,
      400
    );

    const bound = await issue("staff", "bound@x.co");

    assert.equal(
      (
        await reg(client(srv.url), bound.key, {
          email: "new@x.co",
        })
      ).status,
      400
    );

    assert.equal(
      (
        await reg(client(srv.url), bound.key, {
          email: "bound@x.co",
        })
      ).status,
      201
    );

    assert.equal(
      (await User.findOne({ email: "bound@x.co" })).role,
      "staff"
    );

    // No invitation is required for a customer.
    // Client-supplied roles and permissions must be ignored.
    const customer = await reg(client(srv.url), undefined, {
      email: "public@x.co",
      role: "admin",
      active: false,
      canAssign: true,
    });

    assert.equal(customer.status, 201);
    assert.equal(customer.json.user.role, "customer");

    const publicUser = await User.findOne({ email: "public@x.co" });

    assert.equal(publicUser.role, "customer");
    assert.notEqual(publicUser.active, false);
    assert.equal(publicUser.canAssign, false);

    assert.ok(
      await SecurityEvent.exists({ type: "key_rejected" })
    );
  }
);

// 8. A Staff invitation can only be redeemed once, even concurrently.
test(
  "registration: concurrent use of one Staff key creates exactly one Staff account",
  { skip },
  async () => {
    const { key } = await issue("staff");

    const results = await Promise.all([
      reg(client(srv.url), key, { email: "p1@x.co" }),
      reg(client(srv.url), key, { email: "p2@x.co" }),
      reg(client(srv.url), key, { email: "p3@x.co" }),
    ]);

    assert.equal(
      results.filter((result) => result.status === 201).length,
      1
    );

    assert.equal(
      await User.countDocuments({ email: /^p\d@x\.co$/ }),
      1
    );

    assert.equal(
      await User.countDocuments({ role: "staff" }),
      1
    );
  }
);

// 9. Existing walk-in records require a staff-issued, one-time code to activate.
test(
  "registration: walk-in account activation preserves ownership and requires a one-time code",
  { skip },
  async () => {
    const walkIn = await User.create({
      name: "Walk In",
      email: "walk@x.co",
      role: "customer",
    });

    // Matching the existing email is not enough to claim this account.
    assert.equal(
      (
        await reg(client(srv.url), undefined, {
          email: "walk@x.co",
        })
      ).status,
      409
    );

    // A Staff invitation bound to the email cannot claim the customer record.
    const invitation = await issue("staff", "walk@x.co");
    assert.equal(
      (
        await reg(client(srv.url), invitation.key, {
          email: "walk@x.co",
        })
      ).status,
      409
    );

    await makeUser({ email: "walk-in-staff@x.co", role: "staff" });
    const staff = client(srv.url);
    await login(staff, "walk-in-staff@x.co");
    const recorded = await staff.call("POST", "/api/requests", {
      serviceId: "hotel",
      source: "Walk-in",
      customerId: String(walkIn._id),
      description: "Existing walk-in request",
      details: { destination: "Cebu", guests: "2", rooms: "1", stay: "Hotel" },
      checklist: [],
    });
    assert.equal(recorded.status, 201);
    assert.equal(recorded.json.request.customerId, String(walkIn._id));

    await makeUser({ email: "other-walk-in-staff@x.co", role: "staff" });
    const otherStaff = client(srv.url);
    await login(otherStaff, "other-walk-in-staff@x.co");
    assert.equal(
      (
        await otherStaff.call(
          "POST",
          `/api/requests/${recorded.json.request.id}/customer-activation`
        )
      ).status,
      404
    );

    const activationClient = client(srv.url);
    const firstCodeResponse = await activationClient.call("POST", "/api/auth/activation-code", { email: "walk@x.co" });
    assert.equal(firstCodeResponse.status, 202);
    const firstCode = getTestActivationCode();
    assert.match(firstCode, /^\d{6}$/);
    assert.equal(firstCodeResponse.json.message.includes(firstCode), false);

    const storedCode = await User.findById(walkIn._id)
      .select("+activationTokenHash +activationTokenExpiresAt +passwordHash");
    assert.equal(storedCode.activationTokenHash, hashToken(firstCode));
    assert.equal(storedCode.passwordHash, null);

    await User.updateOne(
      { _id: walkIn._id },
      { $set: { activationTokenExpiresAt: new Date(Date.now() - 1000) } }
    );
    assert.equal(
      (
        await reg(client(srv.url), undefined, {
          email: "walk@x.co",
          activationToken: firstCode,
        })
      ).status,
      409
    );

    await User.updateOne({ _id: walkIn._id }, { $set: { activationCodeRequestedAt: new Date(Date.now() - 61_000) } });
    const currentCodeResponse = await activationClient.call("POST", "/api/auth/activation-code", { email: "walk@x.co" });
    assert.equal(currentCodeResponse.status, 202);
    const currentCode = getTestActivationCode();
    const failedCode = await reg(client(srv.url), undefined, {
      email: "walk@x.co",
      activationToken: "000000",
    });
    assert.equal(failedCode.status, 409);
    assert.equal((await User.findById(walkIn._id).select("+activationCodeAttempts")).activationCodeAttempts, 1);
    const activationResults = await Promise.all(
      Array.from({ length: 3 }, () =>
        reg(client(srv.url), undefined, {
          email: "walk@x.co",
          activationToken: currentCode,
        })
      )
    );
    const successfulActivations = activationResults.filter(
      (result) => result.status === 200
    );
    assert.equal(successfulActivations.length, 1);
    const activation = successfulActivations[0];

    assert.equal(activation.json.user.id, String(walkIn._id));
    assert.equal(activation.json.user.role, "customer");
    assert.equal(await User.countDocuments({ email: "walk@x.co" }), 1);
    assert.equal(
      await Request.countDocuments({ customerId: walkIn._id }),
      1
    );

    const activatedUser = await User.findById(walkIn._id)
      .select("+passwordHash +activationTokenHash");
    assert.notEqual(activatedUser.passwordHash, PW);
    assert.equal(activatedUser.activationTokenHash, null);
    assert.ok(
      !JSON.stringify(await SecurityEvent.find().lean()).includes(currentCode)
    );

    const passwordLogin = client(srv.url);
    assert.equal(
      (await login(passwordLogin, "walk@x.co")).status,
      200
    );

    const customer = client(srv.url);
    customer.setCookie(activation.cookie);
    const ownRequests = await customer.call("GET", "/api/requests");
    assert.equal(ownRequests.status, 200);
    assert.equal(ownRequests.json.requests[0].id, recorded.json.request.id);

    assert.equal(
      (
        await reg(client(srv.url), undefined, {
          email: "walk@x.co",
          activationToken: currentCode,
        })
      ).status,
      409
    );
  }
);

// 10. Security logging must not expose secrets.
test(
  "security log records failures and never contains passwords or keys",
  { skip },
  async () => {
    await makeUser({ email: "c@x.co" });

    await login(
      client(srv.url),
      "c@x.co",
      "wrong-password!"
    );

    const { key } = await issue("staff");

    await reg(client(srv.url), "bad-key-123456");

    const events = JSON.stringify(
      await SecurityEvent.find().lean()
    );

    assert.ok(
      events.includes("login_failed") &&
      events.includes("key_rejected")
    );

    assert.ok(!events.includes("wrong-password!"));
    assert.ok(!events.includes(key));
    assert.ok(!events.includes("bad-key-123456"));
  }
);

// ---------------------------------------------------------------------------
// Request detail: GET /api/requests/:id (ownership and notes privacy)
// ---------------------------------------------------------------------------

// Helper: log in as a customer and create one online request through the API.
async function customerWithRequest(email, description) {
  await makeUser({ email });

  const c = client(srv.url);
  const loginResponse = await login(c, email);

  assert.equal(loginResponse.status, 200);

  const created = await c.call("POST", "/api/requests", {
    serviceId: "flight",
    details: {
      trip: "Round trip",
      origin: "Manila",
      destination: "Cebu",
      passengers: "1",
      cabin: "Economy",
    },
    description,
  });

  assert.equal(created.status, 201);

  return { c, request: created.json.request };
}

// 11. Access rules for GET /api/requests/:id.
test(
  "request detail: login required, bad IDs rejected, unknown IDs not found",
  { skip },
  async () => {
    const someId = new mongoose.Types.ObjectId().toHexString();

    // Not logged in.
    assert.equal(
      (await client(srv.url).call("GET", `/api/requests/${someId}`))
        .status,
      401
    );

    // Malformed IDs for a logged-in customer.
    await makeUser({ email: "cust@x.co" });

    const customer = client(srv.url);
    await login(customer, "cust@x.co");

    assert.equal(
      (await customer.call("GET", "/api/requests/abc")).status,
      400
    );

    assert.equal(
      (await customer.call("GET", "/api/requests/aaaaaaaaaaaa")).status,
      400
    );

    // Staff and admin may open requests they are allowed to see.
    // An unknown ID returns 404 for them, the same as for customers.
    await makeUser({ email: "staff@x.co", role: "staff" });
    await makeUser({ email: "admin@x.co", role: "admin" });

    const staff = client(srv.url);
    await login(staff, "staff@x.co");

    assert.equal(
      (await staff.call("GET", `/api/requests/${someId}`)).status,
      404
    );

    const admin = client(srv.url);
    await login(admin, "admin@x.co");

    assert.equal(
      (await admin.call("GET", `/api/requests/${someId}`)).status,
      404
    );
  }
);

// 12. A customer can fetch their own request.
test(
  "request detail: a customer can fetch their own request by ID",
  { skip },
  async () => {
    const { c, request } = await customerWithRequest(
      "own@x.co",
      "My own trip to Cebu"
    );

    const response = await c.call(
      "GET",
      `/api/requests/${request.id}`
    );

    assert.equal(response.status, 200);
    assert.equal(response.json.request.id, request.id);
    assert.equal(response.json.request.ref, request.ref);
    assert.equal(
      response.json.request.description,
      "My own trip to Cebu"
    );
    assert.deepEqual(response.json.request.notes, []);
  }
);

// 13. A customer cannot fetch another customer's request.
test(
  "request detail: another customer's request looks the same as a missing one",
  { skip },
  async () => {
    const a = await customerWithRequest(
      "a@x.co",
      "Customer A private trip"
    );

    const b = await customerWithRequest(
      "b@x.co",
      "Customer B private trip"
    );

    const otherResponse = await a.c.call(
      "GET",
      `/api/requests/${b.request.id}`
    );

    assert.equal(otherResponse.status, 404);

    const otherBody = JSON.stringify(otherResponse.json);

    assert.ok(!otherBody.includes(b.request.ref));
    assert.ok(!otherBody.includes("Customer B private trip"));

    // A valid-looking ID that does not exist gives the identical answer.
    const missingId = new mongoose.Types.ObjectId().toHexString();

    const missingResponse = await a.c.call(
      "GET",
      `/api/requests/${missingId}`
    );

    assert.equal(missingResponse.status, otherResponse.status);
    assert.deepEqual(missingResponse.json, otherResponse.json);

    // Customer B can still read their own request.
    assert.equal(
      (await b.c.call("GET", `/api/requests/${b.request.id}`)).status,
      200
    );
  }
);

// 14. Internal notes are never sent to customers.
test(
  "request detail: internal notes are never exposed to customers",
  { skip },
  async () => {
    const SECRET = "SECRET-INTERNAL-NOTE-9f3a";

    const user = await makeUser({ email: "notes@x.co" });

    const saved = await Request.create({
      ref: "RCM-2026-TESTNOTE",
      customerId: user._id,
      serviceId: "hotel",
      description: "Hotel stay",
      notes: [{ id: "n1", text: SECRET }],
    });

    // Prove the note really is stored in the database.
    const stored = await Request.findById(saved._id).lean();

    assert.ok(JSON.stringify(stored.notes).includes(SECRET));

    const c = client(srv.url);
    await login(c, "notes@x.co");

    const detail = await c.call(
      "GET",
      `/api/requests/${String(saved._id)}`
    );

    assert.equal(detail.status, 200);
    assert.ok(!JSON.stringify(detail.json).includes(SECRET));
    assert.deepEqual(detail.json.request.notes, []);

    const list = await c.call("GET", "/api/requests");

    assert.equal(list.status, 200);
    assert.equal(list.json.requests.length, 1);
    assert.ok(!JSON.stringify(list.json).includes(SECRET));
    assert.deepEqual(list.json.requests[0].notes, []);
  }
);

// 15. The customer request list still returns only the customer's own requests.
test(
  "request list: returns only the logged-in customer's own requests",
  { skip },
  async () => {
    const a = await customerWithRequest("a@x.co", "A trip");
    await customerWithRequest("b@x.co", "B trip");

    const list = await a.c.call("GET", "/api/requests");

    assert.equal(list.status, 200);
    assert.equal(list.json.requests.length, 1);
    assert.equal(list.json.requests[0].id, a.request.id);
    assert.ok(!JSON.stringify(list.json).includes("B trip"));
  }
);

test(
  "request workflow persists messages, notes, status, checklist, assignment, and quotation with role boundaries",
  { skip },
  async () => {
    const { c: customer, request } = await customerWithRequest(
      "workflow-customer@x.co",
      "Trip details"
    );
    const staffUser = await makeUser({ email: "workflow-staff@x.co", role: "staff" });
    await makeUser({ email: "workflow-admin@x.co", role: "admin" });
    const staff = client(srv.url);
    const admin = client(srv.url);
    await login(staff, "workflow-staff@x.co");
    await login(admin, "workflow-admin@x.co");

    const initialAssignment = await admin.call("PATCH", `/api/requests/${request.id}/assignment`, { staffId: String(staffUser._id) });
    assert.equal(initialAssignment.status, 200);
    assert.equal((await customer.call("GET", "/api/requests")).json.requests.length, 1);
    assert.equal(
      (
        await customer.call(
          "POST",
          `/api/requests/${request.id}/customer-activation`
        )
      ).status,
      404
    );
    assert.equal((await staff.call("GET", "/api/requests")).json.requests.length, 1);
    assert.equal((await staff.call("GET", `/api/requests/${request.id}`)).status, 200);

    const note = await staff.call("POST", `/api/requests/${request.id}/notes`, { text: "Private staff note" });
    assert.equal(note.status, 201);
    assert.equal(note.json.request.notes[0].text, "Private staff note");
    assert.deepEqual((await customer.call("GET", `/api/requests/${request.id}`)).json.request.notes, []);

    const staffMessage = await staff.call("POST", `/api/requests/${request.id}/messages`, { text: "Please confirm your dates." });
    assert.equal(staffMessage.status, 201);
    assert.equal(staffMessage.json.request.messages[0].senderId, String(staffUser._id));
    const customerNotifications = await customer.call("GET", "/api/notifications");
    assert.equal(customerNotifications.status, 200);
    assert.equal(customerNotifications.json.notifications.length, 1);
    assert.equal((await staff.call("GET", "/api/notifications")).json.notifications.length, 0);
    assert.equal((await staff.call("PATCH", `/api/notifications/${customerNotifications.json.notifications[0].id}/read`)).status, 404);
    await customer.call("POST", `/api/requests/${request.id}/messages`, { text: "Dates are correct." });
    const refreshedStaffView = await staff.call("GET", `/api/requests/${request.id}`);
    assert.equal(refreshedStaffView.json.request.messages.length, 2);
    assert.ok(refreshedStaffView.json.request.messages.every((message) => message.createdAt));

    assert.equal((await staff.call("PATCH", `/api/requests/${request.id}/status`, { status: "Completed", confirmationRecord: "Record" })).status, 409);
    const changedStatus = await staff.call("PATCH", `/api/requests/${request.id}/status`, { status: "Under Review", note: "Initial review" });
    assert.equal(changedStatus.status, 200);
    assert.equal(changedStatus.json.request.timeline.at(-1).actorId, String(staffUser._id));
    assert.equal(changedStatus.json.request.timeline.at(-1).status, "Under Review");

    const assignment = await admin.call("PATCH", `/api/requests/${request.id}/assignment`, { staffId: String(staffUser._id) });
    assert.equal(assignment.status, 200);
    assert.equal(assignment.json.request.assignedTo, String(staffUser._id));
    assert.equal((await Request.findById(request.id)).assignedTo.toString(), String(staffUser._id));

    const checklist = await staff.call("PATCH", `/api/requests/${request.id}/checklist`, { label: "Passport bio page", received: true });
    assert.equal(checklist.status, 200);
    assert.equal(checklist.json.request.checklist[0].received, true);
    assert.equal((await staff.call("PATCH", `/api/requests/${request.id}/checklist`, { label: "Invented document", received: true })).status, 400);

    for (const status of ["Processing", "For Quotation"]) {
      const response = await staff.call("PATCH", `/api/requests/${request.id}/status`, { status });
      assert.equal(response.status, 200);
    }
    assert.equal((await Request.findById(request.id)).quotation, undefined);
    const quotation = await staff.call("PUT", `/api/requests/${request.id}/quotation`, {
      quotation: { items: [{ label: "Air fare", description: "Return flight", quantity: "2", unitPrice: "625.25", amount: "1" }], validUntil: "2099-12-31", note: "Supplier price" },
    });
    assert.equal(quotation.status, 200);
    assert.equal(quotation.json.request.quotation.items[0].amount, 1250.5);
    assert.equal(quotation.json.request.quotation.items[0].quantity, 2);
    assert.equal(quotation.json.request.quotation.items[0].unitPrice, 625.25);
    assert.equal(quotation.json.request.quotation.items[0].description, "Return flight");
    assert.match(quotation.json.request.quotation.quotationNumber, /^QUO-\d{4}-[A-F0-9]{8}$/);
    assert.equal(quotation.json.request.quotation.serviceDescription, "Trip details");
    const quotationNumber = quotation.json.request.quotation.quotationNumber;
    const refreshedDraft = await staff.call("GET", `/api/requests/${request.id}`);
    assert.equal(refreshedDraft.json.request.quotation.state, "Draft");
    assert.equal(
      (await customer.call("GET", `/api/requests/${request.id}`)).json.request.quotation,
      null
    );
    const staffRequestList = await staff.call("GET", "/api/requests");
    assert.equal(staffRequestList.json.requests[0].quotation.state, "Draft");
    const customerQuotationWrite = await customer.call(
      "PUT",
      `/api/requests/${request.id}/quotation`,
      { quotation: { items: [{ label: "Unauthorized", amount: 10 }] } }
    );
    assert.equal(customerQuotationWrite.status, 403);

    const unassignedStaffUser = await makeUser({ email: "unassigned-staff@x.co", role: "staff" });
    const unassignedStaff = client(srv.url);
    await login(unassignedStaff, "unassigned-staff@x.co");
    assert.equal(
      (await unassignedStaff.call("GET", `/api/requests/${request.id}`)).status,
      404
    );
    assert.equal(
      (
        await unassignedStaff.call(
          "PUT",
          `/api/requests/${request.id}/quotation`,
          { quotation: { items: [{ label: "Unauthorized", amount: 10 }] } }
        )
      ).status,
      403
    );
    assert.equal((await unassignedStaff.call("PATCH", `/api/requests/${request.id}/status`, { status: "Rejected" })).status, 403);
    assert.equal((await unassignedStaff.call("POST", `/api/requests/${request.id}/quotation/send`)).status, 403);
    assert.ok(await SecurityEvent.countDocuments({ type: "request_assignment_denied" }));
    const assignmentDenial = await SecurityEvent.findOne({
      type: "request_assignment_denied",
      entityId: request.id,
      userId: unassignedStaffUser._id,
    }).lean();
    assert.equal(assignmentDenial?.category, "security");
    assert.equal(assignmentDenial?.outcome, "denied");
    assert.equal(await SecurityEvent.countDocuments({
      type: "request_status_changed",
      entityId: request.id,
      userId: unassignedStaffUser._id,
    }), 0);

    await makeUser({ email: "workflow-assigner@x.co", role: "staff", canAssign: true });
    const assigner = client(srv.url);
    await login(assigner, "workflow-assigner@x.co");
    const unassigned = await assigner.call("PATCH", `/api/requests/${request.id}/assignment`, { staffId: null });
    assert.equal(unassigned.status, 200);
    const reassigned = await admin.call("PATCH", `/api/requests/${request.id}/assignment`, { staffId: String(staffUser._id) });
    assert.equal(reassigned.status, 200);

    const adminQuotation = await admin.call(
      "PUT",
      `/api/requests/${request.id}/quotation`,
      {
        quotation: {
          items: [{ label: "Admin-reviewed fare", quantity: 2, unitPrice: 625.25 }],
          validUntil: "2099-12-31",
          note: "Admin review",
        },
      }
    );
    assert.equal(adminQuotation.status, 200);
    assert.equal(adminQuotation.json.request.quotation.note, "Admin review");
    assert.equal(adminQuotation.json.request.quotation.quotationNumber, quotationNumber);
    const adminRequestList = await admin.call("GET", "/api/requests");
    assert.ok(adminRequestList.json.requests.some((item) => item.id === request.id));

    await Service.updateOne(
      { id: request.serviceId },
      { $set: { usesQuotation: false } }
    );
    const updatedExistingDraft = await admin.call(
      "PUT",
      `/api/requests/${request.id}/quotation`,
      {
        quotation: {
          items: [{ label: "Updated historical draft", quantity: 1, unitPrice: 900 }],
          validUntil: "2099-12-31",
          note: "Service setting changed",
        },
      }
    );
    assert.equal(updatedExistingDraft.status, 200);
    await Service.updateOne(
      { id: request.serviceId },
      { $set: { usesQuotation: true } }
    );

    const expiredDraft = await staff.call("PUT", `/api/requests/${request.id}/quotation`, {
      quotation: { items: [{ label: "Past quote", amount: 1 }], validUntil: "2020-01-01" },
    });
    assert.equal(expiredDraft.status, 400);
    const invalidQuantity = await staff.call("PUT", `/api/requests/${request.id}/quotation`, {
      quotation: { items: [{ label: "Bad item", quantity: 0, unitPrice: 100 }], validUntil: "2099-12-31" },
    });
    assert.equal(invalidQuantity.status, 400);
    assert.equal((await staff.call("POST", `/api/requests/${request.id}/quotation/send`)).status, 200);
    assert.equal((await Request.findById(request.id)).quotation.state, "Sent");
    assert.equal(
      (await customer.call("GET", `/api/requests/${request.id}`)).json.request.quotation.state,
      "Sent"
    );

    const response = await customer.call("POST", `/api/requests/${request.id}/quotation/respond`, { accept: true });
    assert.equal(response.status, 200);
    const stored = await Request.findById(request.id).lean();
    assert.equal(stored.status, "Processing");
    assert.equal(stored.quotation.state, "Accepted");
    assert.ok(stored.quotation.sentAt);
    assert.ok(stored.quotation.respondedAt);
    assert.ok(!JSON.stringify(response.json).includes("Private staff note"));
  }
);

test(
  "manual payment reports stay pending until authorized verification and partial balances remain accurate",
  { skip },
  async () => {
    const { c: customer, request } = await customerWithRequest("payments-customer@x.co", "Payment workflow request");
    const secondCustomer = await makeUser({ email: "payments-other@x.co" });
    const other = client(srv.url);
    await login(other, "payments-other@x.co");
    const paymentStaff = await makeUser({ email: "payments-staff@x.co", role: "staff" });
    const staff = client(srv.url);
    await login(staff, "payments-staff@x.co");
    await makeUser({ email: "payments-unassigned-staff@x.co", role: "staff" });
    const unassignedStaff = client(srv.url);
    await login(unassignedStaff, "payments-unassigned-staff@x.co");
    await makeUser({ email: "payments-admin@x.co", role: "admin" });
    const admin = client(srv.url);
    await login(admin, "payments-admin@x.co");
    assert.equal((await admin.call("PATCH", `/api/requests/${request.id}/assignment`, { staffId: String(paymentStaff._id) })).status, 200);

    const malformedReport = await customer.call("POST", "/api/payments", undefined, { raw: "{" });
    assert.equal(malformedReport.status, 400);

    await SystemSetting.create({ key: "global", paymentMethods: [
      { method: "Cash", enabled: true, instructions: "Pay at the agency office." },
      { method: "Bank Transfer", enabled: true, instructions: "Use the agency bank details provided by staff." },
      { method: "GCash", enabled: false, instructions: "" },
    ] });
    for (const status of ["Under Review", "For Quotation"]) {
      assert.equal((await staff.call("PATCH", `/api/requests/${request.id}/status`, { status })).status, 200);
    }
    assert.equal((await staff.call("PUT", `/api/requests/${request.id}/quotation`, { quotation: {
      items: [{ label: "Service fee", quantity: 1, unitPrice: 5000 }], validUntil: "2099-12-31",
    } })).status, 200);
    assert.equal((await staff.call("POST", `/api/requests/${request.id}/quotation/send`)).status, 200);
    assert.equal((await customer.call("POST", `/api/requests/${request.id}/quotation/respond`, { accept: true })).status, 200);

    const receiptData = `data:application/pdf;base64,${Buffer.from("%PDF-1.4 test receipt").toString("base64")}`;
    assert.equal((await customer.call("POST", "/api/payments", { requestId: request.id, method: "GCash", amount: 2000 })).status, 400);
    assert.equal((await customer.call("POST", "/api/payments", { requestId: request.id, method: "Bank Transfer", amount: 2000 })).status, 400);
    const spoofedReceipt = `data:image/png;base64,${Buffer.from("%PDF-1.4 spoofed").toString("base64")}`;
    assert.equal((await customer.call("POST", "/api/payments", { requestId: request.id, method: "Bank Transfer", amount: 2000, receiptData: spoofedReceipt })).status, 400);
    assert.equal((await customer.call("POST", "/api/payments", { requestId: request.id, method: "Cash", amount: 200 })).status, 400);
    assert.equal((await customer.call("POST", "/api/payments", { requestId: request.id, method: "Bank Transfer", amount: 2000, transactionReference: "x".repeat(121) })).status, 400);
    assert.equal((await customer.call("POST", "/api/payments", { requestId: request.id, method: "Bank Transfer", amount: 2000, transactionReference: "PAY-001\nINVALID" })).status, 400);
    const report = await customer.call("POST", "/api/payments", {
      requestId: request.id, method: "Bank Transfer", amount: 2000,
      transactionReference: "  BANK-REF-001  ", receiptData,
    });
    assert.equal(report.status, 201);
    assert.equal(report.json.payment.status, "Pending Verification");
    assert.equal(report.json.payment.outstanding, 5000);
    assert.equal(report.json.payment.transactionReference, "BANK-REF-001");
    assert.equal((await Payment.findById(report.json.payment.id)).transactionReference, "BANK-REF-001");
    assert.equal((await Payment.findById(report.json.payment.id)).receiptSize, Buffer.from("%PDF-1.4 test receipt").length);
    assert.equal((await staff.call("GET", "/api/payments")).json.payments[0].transactionReference, "BANK-REF-001");
    assert.equal((await staff.call("GET", `/api/payments/${report.json.payment.id}/receipt`)).status, 200);
    assert.deepEqual((await unassignedStaff.call("GET", "/api/payments")).json.payments, []);
    assert.equal((await unassignedStaff.call("PATCH", `/api/payments/${report.json.payment.id}/verification`, { decision: "verify" })).status, 403);
    const savedPayment = await Payment.findById(report.json.payment.id);
    const duplicateReferenceRequest = await Request.create({
      ref: `RCM-2026-${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
      customerId: savedPayment.customerId,
      serviceId: request.serviceId,
      source: "Online",
      status: "Processing",
      description: "Duplicate payment reference regression",
      quotation: {
        quotationNumber: "QUO-DUPLICATE-REFERENCE",
        items: [{ label: "Service fee", quantity: 1, unitPrice: 5000, amount: 5000 }],
        state: "Accepted",
      },
    });
    const duplicateReference = await customer.call("POST", "/api/payments", {
      requestId: String(duplicateReferenceRequest._id),
      method: "Bank Transfer",
      amount: 2000,
      transactionReference: "BANK-REF-001",
      receiptData,
    });
    assert.equal(duplicateReference.status, 409);
    assert.equal(await Payment.exists({ requestId: duplicateReferenceRequest._id }), null);
    await Payment.collection.updateOne({ _id: savedPayment._id }, { $unset: { transactionReference: "" } });
    const legacyPayment = (await staff.call("GET", "/api/payments")).json.payments.find((payment) => payment.id === report.json.payment.id);
    assert.equal(legacyPayment.id, report.json.payment.id);
    assert.equal(legacyPayment.transactionReference, undefined);
    assert.equal((await other.call("GET", "/api/payments")).json.payments.length, 0);
    assert.equal((await customer.call("PATCH", `/api/payments/${report.json.payment.id}/verification`, { decision: "verify" })).status, 403);

    const verified = await staff.call("PATCH", `/api/payments/${report.json.payment.id}/verification`, {
      decision: "verify", amountVerified: 2000, note: "Bank credit confirmed",
    });
    assert.equal(verified.status, 200);
    assert.equal(verified.json.payment.status, "Verified");
    assert.equal(verified.json.payment.verifiedTotal, 2000);
    assert.equal(verified.json.payment.outstanding, 3000);
    assert.equal(verified.json.payment.balanceStatus, "Partially Paid");
    const verificationEvent = await SecurityEvent.findOne({
      type: "payment_verified",
      entityId: report.json.payment.id,
    }).lean();
    assert.equal(verificationEvent.actorRole, "staff");
    assert.equal(String(verificationEvent.userId), String(paymentStaff._id));
    assert.equal(verificationEvent.outcome, "success");
    assert.equal(verificationEvent.entityType, "Payment");

    assert.equal((await customer.call("GET", "/api/settings")).json.settings.paymentMethods[0].enabled, true);
    const disabled = await admin.call("PATCH", "/api/settings", { paymentMethods: [{ method: "Cash", enabled: false, instructions: "" }] });
    assert.equal(disabled.status, 200);
    assert.equal((await customer.call("GET", "/api/settings")).json.settings.paymentMethods[0].enabled, false);
    assert.equal((await staff.call("POST", "/api/payments/cash", { requestId: request.id, amount: 100 })).status, 409);
    const enabled = await admin.call("PATCH", "/api/settings", { paymentMethods: [{ method: "Cash", enabled: true, instructions: "Pay at reception." }] });
    assert.equal(enabled.status, 200);
    assert.equal((await customer.call("GET", "/api/settings")).json.settings.paymentMethods[0].enabled, true);
    assert.equal((await customer.call("POST", "/api/payments/cash", { requestId: request.id, amount: 100 })).status, 403);
    const cash = await staff.call("POST", "/api/payments/cash", { requestId: request.id, amount: 1000, note: "Agency receipt 001", paymentDate: "2026-10-20" });
    assert.equal(cash.status, 201);
    assert.equal(cash.json.payment.status, "Verified");
    assert.equal(cash.json.payment.verifiedTotal, 3000);
    assert.equal(cash.json.payment.outstanding, 2000);
    assert.equal(new Date(cash.json.payment.paymentDate).toISOString().slice(0, 10), "2026-10-20");
    assert.equal((await Payment.findById(cash.json.payment.id)).quotationNumber.length > 0, true);
    assert.equal((await Request.findById(request.id)).status, "Processing");

    const overpayment = await staff.call("POST", "/api/payments/cash", { requestId: request.id, amount: 2001 });
    assert.equal(overpayment.status, 400);
    const unauthorizedReceipt = await other.call("GET", `/api/payments/${report.json.payment.id}/receipt`);
    assert.equal(unauthorizedReceipt.status, 404);

    const receiptBytes = Buffer.alloc(3 * 1024 * 1024, 0);
    Buffer.from("%PDF-").copy(receiptBytes);
    const oversizedReceipt = await customer.call("POST", "/api/payments", {
      requestId: request.id,
      method: "Bank Transfer",
      amount: 1,
      transactionReference: "OVERSIZED-RECEIPT",
      receiptData: `data:application/pdf;base64,${receiptBytes.toString("base64")}`,
    });
    assert.equal(oversizedReceipt.status, 400);
    assert.equal(await Payment.exists({ requestId: request.id, transactionReference: "OVERSIZED-RECEIPT" }), null);

    const paymentOwner = await User.findOne({ email: "payments-customer@x.co" });
    await Payment.insertMany(Array.from({ length: 10 }, () => ({
      requestId: request.id,
      customerId: paymentOwner._id,
      quotationNumber: report.json.payment.quotationNumber,
      method: "Bank Transfer",
      amountReported: 1,
      receiptFileId: crypto.randomUUID(),
      receiptMimeType: "application/pdf",
      receiptSize: 3 * 1024 * 1024,
      status: "Rejected",
    })));
    const receiptQuota = await customer.call("POST", "/api/payments", {
      requestId: request.id,
      method: "Bank Transfer",
      amount: 1,
      transactionReference: "RECEIPT-QUOTA",
      receiptData,
    });
    assert.equal(receiptQuota.status, 409);
    assert.equal(await Payment.exists({ requestId: request.id, transactionReference: "RECEIPT-QUOTA" }), null);
    const receiptRecords = await Payment.find({ requestId: request.id }).select("receiptFileId").lean();
    for (const item of receiptRecords) {
      if (item.receiptFileId) {
        await require("node:fs/promises").unlink(
          require("node:path").join(__dirname, "..", "private-receipts", item.receiptFileId)
        ).catch(() => {});
      }
    }
  }
);

test(
  "payment balances use verified amounts only, enforce remaining cents, and close fully paid quotations",
  { skip },
  async () => {
    const { c: customer, request } = await customerWithRequest("payment-balance-customer@x.co", "Payment balance calculation");
    const paymentStaff = await makeUser({ email: "payment-balance-staff@x.co", role: "staff" });
    const staff = client(srv.url);
    await login(staff, "payment-balance-staff@x.co");
    await makeUser({ email: "payment-balance-unassigned@x.co", role: "staff" });
    const unassignedStaff = client(srv.url);
    await login(unassignedStaff, "payment-balance-unassigned@x.co");
    await makeUser({ email: "payment-balance-admin@x.co", role: "admin" });
    const admin = client(srv.url);
    await login(admin, "payment-balance-admin@x.co");
    assert.equal((await admin.call("PATCH", `/api/requests/${request.id}/assignment`, { staffId: String(paymentStaff._id) })).status, 200);
    await SystemSetting.create({ key: "global", paymentMethods: [
      { method: "Cash", enabled: true, instructions: "Pay at the agency office." },
      { method: "Bank Transfer", enabled: true, instructions: "Agency bank details are configured by the administrator." },
      { method: "GCash", enabled: false, instructions: "" },
    ] });

    assert.equal((await staff.call("PATCH", `/api/requests/${request.id}/status`, { status: "Under Review" })).status, 200);
    assert.equal((await staff.call("PATCH", `/api/requests/${request.id}/status`, { status: "For Quotation" })).status, 200);
    const savedQuotation = await staff.call("PUT", `/api/requests/${request.id}/quotation`, { quotation: {
      items: [
        { label: "Service fee", quantity: 1, unitPrice: 124.99 },
        { label: "Processing fee", quantity: 1, unitPrice: 125.01 },
      ],
      validUntil: "2099-12-31",
    } });
    assert.equal(savedQuotation.status, 200);
    assert.equal(savedQuotation.json.request.quotation.items.reduce((sum, item) => sum + item.amount, 0), 250);
    assert.equal((await staff.call("POST", `/api/requests/${request.id}/quotation/send`)).status, 200);
    assert.equal((await customer.call("POST", `/api/requests/${request.id}/quotation/respond`, { accept: true })).status, 200);
    assert.equal((await customer.call("GET", "/api/payments")).json.payments.length, 0);

    assert.deepEqual((await staff.call("GET", "/api/payments")).json.payments, []);
    assert.deepEqual((await admin.call("GET", "/api/payments")).json.payments, []);

    const pending100 = await customer.call("POST", "/api/payments", { requestId: request.id, method: "Cash", amount: 100, transactionReference: "BALANCE-PENDING-100" });
    assert.equal(pending100.status, 201);
    assert.equal(pending100.json.payment.quotationTotal, 250);
    assert.equal(pending100.json.payment.verifiedTotal, 0);
    assert.equal(pending100.json.payment.outstanding, 250);
    assert.equal(pending100.json.payment.balanceStatus, "Unpaid");
    const staffReports = await staff.call("GET", "/api/payments");
    const adminReports = await admin.call("GET", "/api/payments");
    assert.equal(staffReports.status, 200);
    assert.equal(staffReports.json.payments.length, 1);
    assert.deepEqual((await unassignedStaff.call("GET", "/api/payments")).json.payments, []);
    assert.equal((await unassignedStaff.call("PATCH", `/api/payments/${pending100.json.payment.id}/verification`, { decision: "reject", note: "Not assigned" })).status, 403);
    assert.equal(adminReports.status, 200);
    assert.equal(adminReports.json.payments.length, 1);
    assert.equal((await customer.call("POST", "/api/payments", { requestId: request.id, method: "Cash", amount: 250.01, transactionReference: "BALANCE-OVER-250" })).status, 400);

    const anotherWhilePending = await customer.call("POST", "/api/payments", { requestId: request.id, method: "Cash", amount: 200, transactionReference: "BALANCE-DUPLICATE-PENDING" });
    assert.equal(anotherWhilePending.status, 409);
    assert.equal(await Payment.countDocuments({ requestId: request.id, status: "Pending Verification" }), 1);
    assert.equal((await staff.call("PATCH", `/api/payments/${pending100.json.payment.id}/verification`, { decision: "reject", note: "Not received" })).status, 200);
    const rejectionEvent = await SecurityEvent.findOne({
      type: "payment_rejected",
      entityId: pending100.json.payment.id,
    }).lean();
    assert.equal(rejectionEvent.actorRole, "staff");
    assert.equal(String(rejectionEvent.userId), String(paymentStaff._id));
    assert.equal(rejectionEvent.outcome, "rejected");
    assert.equal(rejectionEvent.entityType, "Payment");
    const afterReject = await customer.call("GET", "/api/payments");
    assert.equal(afterReject.json.payments.find((payment) => payment.id === pending100.json.payment.id).status, "Rejected");
    assert.ok(afterReject.json.payments.every((payment) => payment.verifiedTotal === 0 && payment.outstanding === 250 && payment.balanceStatus === "Unpaid"));

    const pending200 = await customer.call("POST", "/api/payments", { requestId: request.id, method: "Cash", amount: 200, transactionReference: "BALANCE-PENDING-200" });
    assert.equal(pending200.status, 201);
    assert.equal(pending200.json.payment.outstanding, 250);
    const partial = await staff.call("PATCH", `/api/payments/${pending200.json.payment.id}/verification`, { decision: "verify", amountVerified: 200 });
    assert.equal(partial.status, 200);
    assert.equal(partial.json.payment.verifiedTotal, 200);
    assert.equal(partial.json.payment.outstanding, 50);
    assert.equal(partial.json.payment.balanceStatus, "Partially Paid");

    const pending50 = await customer.call("POST", "/api/payments", { requestId: request.id, method: "Cash", amount: 50, transactionReference: "BALANCE-PENDING-50" });
    assert.equal(pending50.status, 201);
    assert.equal(pending50.json.payment.verifiedTotal, 200);
    assert.equal(pending50.json.payment.outstanding, 50);
    const fullyPaid = await staff.call("PATCH", `/api/payments/${pending50.json.payment.id}/verification`, { decision: "verify", amountVerified: 50 });
    assert.equal(fullyPaid.status, 200);
    assert.equal(fullyPaid.json.payment.quotationTotal, 250);
    assert.equal(fullyPaid.json.payment.verifiedTotal, 250);
    assert.equal(fullyPaid.json.payment.outstanding, 0);
    assert.equal(fullyPaid.json.payment.balanceStatus, "Paid");
    assert.equal((await customer.call("POST", "/api/payments", { requestId: request.id, method: "Cash", amount: 0.01, transactionReference: "BALANCE-PAID-EXTRA" })).status, 400);

    // A pending record can remain from before a quotation was reduced or paid.
    // Its verification must fail safely without making payment-list retrieval fail.
    const paymentCustomer = await User.findOne({ email: "payment-balance-customer@x.co" });
    const overBalancePending = await Payment.create({
      requestId: request.id,
      customerId: paymentCustomer._id,
      quotationNumber: fullyPaid.json.payment.quotationNumber,
      method: "Cash",
      amountReported: 1,
      status: "Pending Verification",
    });
    const verificationConflict = await staff.call("PATCH", `/api/payments/${overBalancePending._id}/verification`, { decision: "verify" });
    assert.equal(verificationConflict.status, 409);
    assert.equal(verificationConflict.json.error, "Verified payments cannot exceed the remaining quotation balance.");
    const staffAfterConflict = await staff.call("GET", "/api/payments");
    const adminAfterConflict = await admin.call("GET", "/api/payments");
    assert.equal(staffAfterConflict.status, 200);
    assert.equal(adminAfterConflict.status, 200);
    assert.equal(staffAfterConflict.json.payments.length, 4);
    assert.equal(adminAfterConflict.json.payments.length, 4);
    assert.equal((await Payment.findById(overBalancePending._id)).status, "Pending Verification");
    assert.equal((await Request.findById(request.id)).status, "Processing");
  }
);

test("request documents are private, validated, and preserve original names", { skip }, async () => {
  const { c: customer, request } = await customerWithRequest("document-owner@x.co", "Private file test");
  await makeUser({ email: "document-other@x.co" });
  await makeUser({ email: "document-unassigned-staff@x.co", role: "staff" });
  const other = client(srv.url);
  const unassignedStaff = client(srv.url);
  await login(other, "document-other@x.co");
  await login(unassignedStaff, "document-unassigned-staff@x.co");
  assert.equal((await unassignedStaff.call("POST", `/api/requests/${request.id}/documents`, undefined, { raw: "{" })).status, 403);
  const malformedUpload = await customer.call("POST", `/api/requests/${request.id}/documents`, undefined, { raw: "{" });
  assert.equal(malformedUpload.status, 400);
  const png = Buffer.from([137,80,78,71,13,10,26,10,1,2,3]);
  const upload = await customer.call("POST", `/api/requests/${request.id}/documents`, { name: "scan.png", type: "image/png", data: `data:image/png;base64,${png.toString("base64")}` });
  assert.equal(upload.status, 201);
  assert.equal((await other.call("GET", `/api/requests/${request.id}/documents`)).status, 404);
  assert.equal((await other.call("GET", `/api/requests/${request.id}/documents/${upload.json.file.id}`)).status, 404);
  const listing = await customer.call("GET", `/api/requests/${request.id}/documents`);
  assert.equal(listing.json.files[0].name, "scan.png");
  assert.equal(listing.json.files[0].type, "image/png");
  const content = await customer.call("GET", `/api/requests/${request.id}/documents/${upload.json.file.id}`);
  assert.equal(content.status, 200);
  assert.match(content.headers["content-disposition"], /inline/);
  assert.equal(content.headers["cross-origin-resource-policy"], "cross-origin");
  assert.equal((await customer.call("GET", `/api/requests/${request.id}/documents/${upload.json.file.id}?download=1`)).headers["content-disposition"].startsWith("attachment"), true);
  assert.equal((await customer.call("POST", `/api/requests/${request.id}/documents`, { name: "spoof.png", type: "image/png", data: `data:image/png;base64,${Buffer.from("not png").toString("base64")}` })).status, 400);
  const mp4 = Buffer.from([0,0,0,24,102,116,121,112,109,112,52,50,0,0,0,0,109,112,52,50,105,115,111,109]);
  const video = await customer.call("POST", `/api/requests/${request.id}/documents`, { name: "clip.mp4", type: "video/mp4", data: `data:video/mp4;base64,${mp4.toString("base64")}` });
  assert.equal(video.status, 201);
  assert.match((await customer.call("GET", `/api/requests/${request.id}/documents/${video.json.file.id}`)).headers["content-disposition"], /inline/);
  const pdfBytes = Buffer.from("%PDF-1.4 minimal");
  const pdf = await customer.call("POST", `/api/requests/${request.id}/documents`, { name: "form.pdf", type: "application/pdf", data: `data:application/pdf;base64,${pdfBytes.toString("base64")}` });
  assert.equal(pdf.status, 201);
  assert.match((await customer.call("GET", `/api/requests/${request.id}/documents/${pdf.json.file.id}`)).headers["content-disposition"], /attachment/);
  const storedFiles = await RequestFile.find({ requestId: request.id }).lean();
  for (const stored of storedFiles) await require("node:fs/promises").unlink(require("node:path").join(__dirname, "..", "private-documents", stored.storageId)).catch(() => {});
});

test("document upload quotas are atomic per request and reject over-quota files", { skip }, async () => {
  const first = await customerWithRequest("document-quota@x.co", "Document quota test");
  const owner = await User.findOne({ email: "document-quota@x.co" });
  const existing = (count, size) => Array.from({ length: count }, (_, index) => ({
    requestId: first.request.id,
    customerId: owner._id,
    uploadedBy: owner._id,
    storageId: crypto.randomUUID(),
    originalName: `existing-${index}.png`,
    mimeType: "image/png",
    size,
  }));
  await RequestFile.insertMany(existing(19, 1));

  const png = Buffer.from([137,80,78,71,13,10,26,10,1,2,3]);
  const uploadBody = {
    name: "concurrent.png",
    type: "image/png",
    data: `data:image/png;base64,${png.toString("base64")}`,
  };
  const concurrent = await Promise.all([
    first.c.call("POST", `/api/requests/${first.request.id}/documents`, uploadBody),
    first.c.call("POST", `/api/requests/${first.request.id}/documents`, uploadBody),
  ]);
  assert.deepEqual(concurrent.map((result) => result.status).sort(), [201, 409]);
  assert.equal(await RequestFile.countDocuments({ requestId: first.request.id }), 20);
  const createdFileId = concurrent.find((result) => result.status === 201).json.file.id;
  const createdFile = await RequestFile.findById(createdFileId).lean();
  await require("node:fs/promises").unlink(
    require("node:path").join(__dirname, "..", "private-documents", createdFile.storageId)
  ).catch(() => {});

  const second = await customerWithRequest("document-size-quota@x.co", "Document size quota test");
  const secondOwner = await User.findOne({ email: "document-size-quota@x.co" });
  await RequestFile.insertMany(Array.from({ length: 5 }, (_, index) => ({
    requestId: second.request.id,
    customerId: secondOwner._id,
    uploadedBy: secondOwner._id,
    storageId: crypto.randomUUID(),
    originalName: `large-${index}.pdf`,
    mimeType: "application/pdf",
    size: 20 * 1024 * 1024,
  })));
  const overQuota = await second.c.call("POST", `/api/requests/${second.request.id}/documents`, uploadBody);
  assert.equal(overQuota.status, 409);
  assert.equal(await RequestFile.countDocuments({ requestId: second.request.id }), 5);

  const oversizedBytes = Buffer.alloc(20 * 1024 * 1024 + 1, 0);
  oversizedBytes.set([137,80,78,71,13,10,26,10]);
  const oversized = await second.c.call("POST", `/api/requests/${second.request.id}/documents`, {
    name: "too-large.png",
    type: "image/png",
    data: `data:image/png;base64,${oversizedBytes.toString("base64")}`,
  });
  assert.equal(oversized.status, 400);
  assert.equal(await RequestFile.countDocuments({ requestId: second.request.id }), 5);
});

test("competing request status changes cannot overwrite each other", { skip }, async () => {
  const { request } = await customerWithRequest("status-race@x.co", "Concurrent status update");
  const requestRecord = await Request.findById(request.id).select("ref status").lean();
  const statusStaff = await makeUser({ email: "status-race-staff@x.co", role: "staff" });
  const staff = client(srv.url);
  await login(staff, "status-race-staff@x.co");
  await makeUser({ email: "status-race-admin@x.co", role: "admin" });
  const admin = client(srv.url);
  await login(admin, "status-race-admin@x.co");
  assert.equal((await admin.call("PATCH", `/api/requests/${request.id}/assignment`, { staffId: String(statusStaff._id) })).status, 200);
  const originalFindById = Request.findById;
  let reads = 0;
  let releaseReads;
  const bothReadInitialState = new Promise((resolve) => { releaseReads = resolve; });
  Request.findById = function (...args) {
    const query = originalFindById.apply(this, args);
    if (String(args[0]) !== String(request.id)) return query;
    const originalLean = query.lean.bind(query);
    query.lean = (...leanArgs) => Promise.resolve(originalLean(...leanArgs)).then(async (document) => {
      if (document) {
        reads += 1;
        if (reads === 2) releaseReads();
        await bothReadInitialState;
      }
      return document;
    });
    return query;
  };
  let results;
  try {
    results = await Promise.all([
      staff.call("PATCH", `/api/requests/${request.id}/status`, { status: "Cancelled" }),
      staff.call("PATCH", `/api/requests/${request.id}/status`, { status: "Rejected" }),
    ]);
  } finally {
    Request.findById = originalFindById;
  }
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
  assert.match(results.find((result) => result.status === 409).json.error, /changed while you were working|request is closed/i);

  const saved = await Request.findById(request.id).lean();
  assert.ok(["Cancelled", "Rejected"].includes(saved.status));
  assert.equal(saved.timeline.filter((item) => ["Cancelled", "Rejected"].includes(item.status)).length, 1);
  const statusEvents = await SecurityEvent.find({ type: "request_status_changed", entityId: String(request.id) }).lean();
  assert.equal(statusEvents.length, 1);
  assert.equal(statusEvents[0].actorRole, "staff");
  assert.equal(statusEvents[0].entityType, "Request");
  assert.equal(statusEvents[0].outcome, "success");
  assert.equal(statusEvents[0].previousStatus, requestRecord.status);
  assert.equal(statusEvents[0].newStatus, saved.status);
  assert.equal(await Notification.countDocuments({ requestId: request.id, text: new RegExp(`^${requestRecord.ref}: Request status updated`) }), 1);
});

test("payment transactions serialize balance reads and reject a competing overpayment", { skip }, async () => {
  const { request } = await customerWithRequest("payment-transaction-race@x.co", "Payment transaction serialization");
  const owner = await User.findOne({ email: "payment-transaction-race@x.co" });
  let releaseFirst;
  let markFirstEntered;
  let markSecondAttempt;
  const firstEntered = new Promise((resolve) => { markFirstEntered = resolve; });
  const secondAttempt = new Promise((resolve) => { markSecondAttempt = resolve; });
  const allowFirstCommit = new Promise((resolve) => { releaseFirst = resolve; });
  const originalUpdate = Request.findOneAndUpdate;
  let updateAttempts = 0;
  Request.findOneAndUpdate = function (...args) {
    updateAttempts += 1;
    if (updateAttempts === 2) markSecondAttempt();
    return originalUpdate.apply(this, args);
  };
  let secondActionRan = false;
  try {
    const first = withPaymentTransaction(request.id, { customerId: owner._id }, async (session) => {
      await Payment.create([{
        requestId: request.id,
        customerId: owner._id,
        quotationNumber: "QUO-RACE",
        method: "Cash",
        amountReported: 60,
        amountVerified: 60,
        status: "Verified",
      }], { session });
      markFirstEntered();
      await allowFirstCommit;
    });
    await firstEntered;
    const second = withPaymentTransaction(request.id, { customerId: owner._id }, async (session) => {
      secondActionRan = true;
      const verified = await Payment.find({ requestId: request.id, status: "Verified" }).session(session).lean();
      const total = verified.reduce((sum, item) => sum + item.amountVerified, 0);
      if (total + 50 > 100) throw new Error("balance conflict");
    });
    await secondAttempt;
    assert.equal(secondActionRan, false, "second transaction must wait at the shared Request revision write");
    releaseFirst();
    await first;
    await assert.rejects(second, /balance conflict/);
  } finally {
    releaseFirst();
    Request.findOneAndUpdate = originalUpdate;
  }
  const verified = await Payment.find({ requestId: request.id, status: "Verified" }).lean();
  assert.equal(verified.length, 1);
  assert.equal(verified.reduce((sum, item) => sum + item.amountVerified, 0), 60);
});

test("concurrent customer payment reports create only one pending payment per request", { skip }, async () => {
  const { c: customer, request } = await customerWithRequest("payment-report-race@x.co", "Concurrent payment reports");
  await Request.updateOne({ _id: request.id }, {
    $set: {
      status: "Processing",
      quotation: {
        quotationNumber: "QUO-REPORT-RACE",
        items: [{ label: "Service fee", quantity: 1, unitPrice: 100, amount: 100 }],
        state: "Accepted",
      },
    },
  });
  await SystemSetting.create({
    key: "global",
    paymentMethods: [{ method: "Cash", enabled: true, instructions: "Pay at the agency office." }],
  });

  const report = {
    requestId: request.id,
    method: "Cash",
    amount: 50,
  };
  const results = await Promise.all([
    customer.call("POST", "/api/payments", { ...report, transactionReference: "PAYMENT-REPORT-RACE-1" }),
    customer.call("POST", "/api/payments", { ...report, transactionReference: "PAYMENT-REPORT-RACE-2" }),
  ]);
  assert.deepEqual(results.map((result) => result.status).sort(), [201, 409]);
  assert.equal(await Payment.countDocuments({ requestId: request.id }), 1);
  assert.equal(await Payment.countDocuments({ requestId: request.id, status: "Pending Verification" }), 1);
  assert.equal(await SecurityEvent.countDocuments({
    type: "payment_reported",
    "context.requestId": request.id,
  }), 1);
});

test(
  "offline intake and profile/account APIs persist data without role escalation",
  { skip },
  async () => {
    await makeUser({ email: "intake-staff@x.co", role: "staff" });
    const staff = client(srv.url);
    await login(staff, "intake-staff@x.co");
    const created = await staff.call("POST", "/api/requests", {
      serviceId: "hotel",
      source: "Phone",
      customer: { name: "Walk In", email: "walk-in@x.co", phone: "12345" },
      description: "Two-night stay",
      details: { destination: "Cebu", guests: "2", rooms: "1", stay: "Hotel" },
      checklist: [],
    });
    assert.equal(created.status, 201);
    assert.match(created.json.request.ref, /^RCM-\d{4}-[A-F0-9]{8}$/);
    assert.equal(created.json.request.source, "Phone");
    assert.match(created.json.request.timeline[0].text, /phone call inquiry/i);
    assert.equal(
      (await Request.findById(created.json.request.id)).source,
      "Phone"
    );
    assert.equal(await Request.countDocuments({ customerId: created.json.request.customerId }), 1);

    await makeUser({ email: "profile-customer@x.co" });
    const customer = client(srv.url);
    await login(customer, "profile-customer@x.co");
    const profile = await customer.call("PATCH", "/api/users/me", { name: "Walk In Updated", phone: "54321" });
    assert.equal(profile.status, 200);
    assert.equal(profile.json.user.name, "Walk In Updated");
    const profileUser = await User.findOne({ email: "profile-customer@x.co" });
    assert.equal(profileUser.phone, "54321");
    assert.equal((await customer.call("PATCH", "/api/users/me", { role: "admin" })).status, 400);
    assert.equal(profileUser.role, "customer");
    assert.equal((await customer.call("GET", "/api/users")).status, 403);

    await makeUser({ name: "Only Admin", email: "only-admin@x.co", role: "admin" });
    const admin = client(srv.url);
    await login(admin, "only-admin@x.co");
    assert.equal((await admin.call("GET", "/api/users")).status, 200);
    assert.equal((await admin.call("PATCH", `/api/users/${String((await User.findOne({ email: "only-admin@x.co" }))._id)}/active`, { active: false })).status, 409);
    const invitation = await admin.call("POST", "/api/invitations", { role: "staff", email: "new-staff@x.co" });
    assert.equal(invitation.status, 201);
    assert.ok(invitation.json.key);
  }
);

test(
  "staff customer directory returns public selectable accounts and denies customers",
  { skip },
  async () => {
    const activeCustomer = await makeUser({ email: "directory-customer@x.co" });
    const inactiveCustomer = await makeUser({ email: "directory-inactive@x.co", active: false });
    await makeUser({ email: "directory-staff@x.co", role: "staff" });
    await makeUser({ email: "directory-reader@x.co" });

    const staff = client(srv.url);
    await login(staff, "directory-staff@x.co");
    const directory = await staff.call("GET", "/api/users/directory");

    assert.equal(directory.status, 200);
    assert.ok(directory.json.users.some((item) => item.id === String(activeCustomer._id)));
    assert.ok(!directory.json.users.some((item) => item.id === String(inactiveCustomer._id)));
    assert.ok(directory.json.users.some((item) => item.role === "staff"));
    assert.ok(directory.json.users.every((item) => item.email && item.name && item.id));
    assert.ok(!JSON.stringify(directory.json).includes("passwordHash"));
    assert.ok(!JSON.stringify(directory.json).includes("keyHash"));

    const customer = client(srv.url);
    await login(customer, "directory-reader@x.co");
    assert.equal((await customer.call("GET", "/api/users/directory")).status, 403);
  }
);

test(
  "staff offline request links an existing active customer by database ID",
  { skip },
  async () => {
    const customer = await makeUser({ email: "existing-offline-customer@x.co" });
    await makeUser({ email: "existing-offline-staff@x.co", role: "staff" });
    await makeUser({ email: "unrelated-offline-customer@x.co" });

    const staff = client(srv.url);
    await login(staff, "existing-offline-staff@x.co");
    const created = await staff.call("POST", "/api/requests", {
      serviceId: "hotel",
      source: "Walk-in",
      customerId: String(customer._id),
      description: "Existing customer stay",
      details: { destination: "Cebu", guests: "2", rooms: "1", stay: "Hotel" },
    });

    assert.equal(created.status, 201);
    assert.equal(created.json.request.customerId, String(customer._id));
    const stored = await Request.findById(created.json.request.id).lean();
    assert.equal(String(stored.customerId), String(customer._id));
    assert.equal(String(stored.assignedTo), String((await User.findOne({ email: "existing-offline-staff@x.co" }))._id));
    assert.ok((await staff.call("GET", "/api/requests")).json.requests.some((item) => item.id === created.json.request.id));

    const customerClient = client(srv.url);
    await login(customerClient, "existing-offline-customer@x.co");
    const customerRequests = await customerClient.call("GET", "/api/requests");
    assert.ok(customerRequests.json.requests.some((item) => item.id === created.json.request.id));

    const unrelated = client(srv.url);
    await login(unrelated, "unrelated-offline-customer@x.co");
    assert.ok(!(await unrelated.call("GET", "/api/requests")).json.requests.some((item) => item.id === created.json.request.id));
  }
);

test(
  "admin service catalog and system settings persist and drive request validation",
  { skip },
  async () => {
    await makeUser({ email: "catalog-admin@x.co", role: "admin" });
    await makeUser({ email: "catalog-customer@x.co" });
    const admin = client(srv.url);
    const customer = client(srv.url);
    await login(admin, "catalog-admin@x.co");
    await login(customer, "catalog-customer@x.co");
    const visitor = client(srv.url);
    const initialSettings = await visitor.call("GET", "/api/settings");
    assert.equal(initialSettings.status, 200);
    assert.equal(initialSettings.json.settings.contactEmail, "");
    assert.equal(initialSettings.json.settings.contactPhone, "");
    assert.equal(initialSettings.json.settings.address, "");
    assert.deepEqual(initialSettings.json.settings.paymentMethods, []);

    const savedService = await admin.call("PUT", "/api/services/custom-consult", {
      name: "Custom Consultation",
      description: "Saved service",
      icon: "map",
      active: true,
      usesQuotation: false,
      datesLabel: "Visit date",
      documents: ["Photo ID"],
      fields: [{ key: "topic", label: "Topic", type: "text", required: true }],
    });
    assert.equal(savedService.status, 200);
    assert.ok((await customer.call("GET", "/api/services")).json.services.some((service) => service.id === "custom-consult"));
    const missingField = await customer.call("POST", "/api/requests", {
      serviceId: "custom-consult",
      description: "Consultation request",
    });
    assert.equal(missingField.status, 400);
    const created = await customer.call("POST", "/api/requests", {
      serviceId: "custom-consult",
      details: { topic: "Visa documents" },
      description: "Consultation request",
    });
    assert.equal(created.status, 201);
    assert.equal(created.json.request.serviceId, "custom-consult");
    await admin.call("PUT", "/api/services/custom-consult", {
      ...savedService.json.service,
      active: false,
    });
    assert.ok(!(await customer.call("GET", "/api/services")).json.services.some((service) => service.id === "custom-consult"));
    assert.ok((await customer.call("GET", "/api/services/workspace")).json.services.some((service) => service.id === "custom-consult"));
    assert.ok((await admin.call("GET", "/api/services/admin")).json.services.some((service) => service.id === "custom-consult"));

    const updatedSettings = await admin.call("PATCH", "/api/settings", {
      companyName: "RCM Verified",
      contactEmail: "contact@example.test",
      contactPhone: "+100000000",
      address: "Main office",
      disclaimer: "Requests are not bookings.",
      allowRegistration: false,
      paymentMethods: [
        { method: "Cash", enabled: true, instructions: "Pay at the office." },
        { method: "Bank Transfer", enabled: true, instructions: "Verified agency transfer instructions." },
      ],
    });
    assert.equal(updatedSettings.status, 200);
    const publicSettings = await customer.call("GET", "/api/settings");
    assert.equal(publicSettings.status, 200);
    assert.equal(publicSettings.json.settings.companyName, "RCM Verified");
    assert.equal(publicSettings.json.settings.contactEmail, "contact@example.test");
    assert.equal(publicSettings.json.settings.contactPhone, "+100000000");
    assert.equal(publicSettings.json.settings.address, "Main office");
    assert.equal(publicSettings.json.settings.paymentMethods[1].instructions, "Verified agency transfer instructions.");
    assert.equal((await admin.call("PATCH", "/api/settings", { paymentMethods: [{ method: "GCash", enabled: true, instructions: "" }] })).status, 400);
    assert.equal((await customer.call("POST", "/api/auth/register", {
      name: "New Customer",
      email: "registration-closed@x.co",
      password: PW,
      consent: true,
    })).status, 403);
    assert.equal((await customer.call("PATCH", "/api/settings", { companyName: "No" })).status, 403);
    assert.equal((await customer.call("GET", "/api/audit-events")).status, 403);
    assert.equal((await admin.call("GET", "/api/audit-events")).status, 200);
    const auditPage = await admin.call("GET", "/api/audit-events?category=business&search=system_settings_updated&limit=1");
    assert.equal(auditPage.status, 200);
    assert.equal(auditPage.json.events.length, 1);
    assert.equal(auditPage.json.events[0].action, "system_settings_updated");
    assert.equal(auditPage.json.events[0].actor, "T");
    assert.equal(auditPage.json.events[0].role, "admin");
    assert.equal(auditPage.json.events[0].category, "business");
    assert.equal(auditPage.json.events[0].outcome, "success");
    assert.equal(auditPage.json.events[0].entityType, "SystemSetting");
    const refreshedAuditPage = await admin.call("GET", "/api/audit-events?category=business&search=system_settings_updated&limit=1");
    assert.equal(refreshedAuditPage.json.events[0].id, auditPage.json.events[0].id);
    assert.equal((await admin.call("POST", "/api/audit-events", { type: "fake_success" })).status, 404);
  }
);

// NEW: Document Assistance conditional validation.
test(
  "document assistance: action must match the document type, destination only where relevant",
  { skip },
  async () => {
    await makeUser({ email: "docs-customer@x.co" });
    const customer = client(srv.url);
    await login(customer, "docs-customer@x.co");

    const post = (details) =>
      customer.call("POST", "/api/requests", {
        serviceId: "documents",
        description: "Document help",
        details,
      });

    // Valid visa request with a destination and a deadline.
    const visa = await post({
      docType: "Visa Assistance",
      requestedAction: "Renewal or extension",
      destination: "Japan",
      neededBy: "2099-01-01",
      additionalDetails: "Need it before my trip",
    });
    assert.equal(visa.status, 201);

    const stored = await Request.findById(visa.json.request.id).lean();
    assert.equal(stored.details.docType, "Visa Assistance");
    assert.equal(stored.details.requestedAction, "Renewal or extension");
    assert.equal(stored.details.destination, "Japan");
    assert.equal(stored.details.neededBy, "2099-01-01");

    // An action that belongs to a different document type is rejected.
    assert.equal(
      (await post({ docType: "Philippine Passport", requestedAction: "CENOMAR" })).status,
      400
    );

    // A destination is required for visa assistance.
    assert.equal(
      (await post({ docType: "Visa Assistance", requestedAction: "New application" })).status,
      400
    );

    // A destination sent for a passport request is dropped, not saved.
    const passport = await post({
      docType: "Philippine Passport",
      requestedAction: "Renewal",
      destination: "Japan",
    });
    assert.equal(passport.status, 201);
    const passportStored = await Request.findById(passport.json.request.id).lean();
    assert.equal(passportStored.details.destination, undefined);

    // "Other Document" requires a description of the document and help needed.
    assert.equal(
      (await post({ docType: "Other Document", requestedAction: "Anything" })).status,
      400
    );

    // An invalid deadline is rejected.
    assert.equal(
      (await post({
        docType: "Police Clearance",
        requestedAction: "Renewal",
        neededBy: "not-a-date",
      })).status,
      400
    );
  }
);

test(
  "Document Assistance quotation access follows the stored service configuration",
  { skip },
  async () => {
    await makeUser({ email: "docs-quote-customer@x.co" });
    const docsStaff = await makeUser({ email: "docs-quote-staff@x.co", role: "staff" });
    await makeUser({ email: "docs-quote-admin@x.co", role: "admin" });
    const customer = client(srv.url);
    const staff = client(srv.url);
    const admin = client(srv.url);
    await login(customer, "docs-quote-customer@x.co");
    await login(staff, "docs-quote-staff@x.co");
    await login(admin, "docs-quote-admin@x.co");
    const details = { docType: "Visa Assistance", requestedAction: "New application", destination: "Japan" };
    const created = await customer.call("POST", "/api/requests", { serviceId: "documents", description: "Visa document support", details });
    assert.equal(created.status, 201);
    assert.equal((await admin.call("PATCH", `/api/requests/${created.json.request.id}/assignment`, { staffId: String(docsStaff._id) })).status, 200);
    assert.equal((await Service.findOne({ id: "documents" })).usesQuotation, true);
    for (const status of ["Under Review", "For Quotation"]) assert.equal((await staff.call("PATCH", `/api/requests/${created.json.request.id}/status`, { status })).status, 200);
    const saved = await staff.call("PUT", `/api/requests/${created.json.request.id}/quotation`, { quotation: { items: [{ label: "Document service fee", amount: 2500 }], validUntil: "2099-12-31" } });
    assert.equal(saved.status, 200);
    assert.ok(saved.json.request.quotation.quotationNumber);

    const second = await customer.call("POST", "/api/requests", { serviceId: "documents", description: "Another document request", details });
    assert.equal((await admin.call("PATCH", `/api/requests/${second.json.request.id}/assignment`, { staffId: String(docsStaff._id) })).status, 200);
    await staff.call("PATCH", `/api/requests/${second.json.request.id}/status`, { status: "Under Review" });
    await staff.call("PATCH", `/api/requests/${second.json.request.id}/status`, { status: "For Quotation" });
    await Service.updateOne({ id: "documents" }, { $set: { usesQuotation: false } });
    const ineligible = await staff.call("PUT", `/api/requests/${second.json.request.id}/quotation`, { quotation: { items: [{ label: "Fee", amount: 10 }], validUntil: "2099-12-31" } });
    assert.equal(ineligible.status, 400);
  }
);

// NEW: Admin editor keeps Document Assistance conditional fields.
test(
  "admin can re-save Document Assistance without losing its conditional fields",
  { skip },
  async () => {
    await makeUser({ email: "docs-admin@x.co", role: "admin" });
    const admin = client(srv.url);
    await login(admin, "docs-admin@x.co");

    const current = (await admin.call("GET", "/api/services/admin"))
      .json.services.find((service) => service.id === "documents");

    const saved = await admin.call("PUT", "/api/services/documents", current);
    assert.equal(saved.status, 200);

    const action = saved.json.service.fields.find((field) => field.key === "requestedAction");
    assert.equal(action.dependsOn, "docType");
    assert.ok(action.optionsByValue["Police Clearance"].includes("Renewal"));

    const destination = saved.json.service.fields.find((field) => field.key === "destination");
    assert.deepEqual(destination.showWhen.values, [
      "Visa Assistance",
      "DFA Apostille / Document Authentication",
    ]);
  }
);
