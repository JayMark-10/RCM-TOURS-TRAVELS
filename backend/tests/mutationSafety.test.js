"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const Request = require("../models/Request");
const Payment = require("../models/Payment");
const Service = require("../models/Service");
const User = require("../models/User");
const Notification = require("../models/Notification");
const SecurityEvent = require("../models/SecurityEvent");
const RequestFile = require("../models/RequestFile");
const { mongoose } = require("../config/db");
const { createReport, withPaymentTransaction, verify, receipt } = require("../controllers/payments");
const { createRequest, updateStatus, saveQuotation, requestMutationFilter } = require("../controllers/requests");
const audit = require("../controllers/audit");
const requestFiles = require("../controllers/requestFiles");
const { mutateRequest } = require("../services/requestMutation");
const { createNotifications } = require("../services/notifications");
const { logEvent } = require("../services/securityLog");
const { withMongoTransaction } = require("../services/mongoTransaction");
const {
  beginReceiptOperation,
  receiptPathFor,
  removeOrphanedReceiptFiles,
} = require("../services/paymentReceiptRecovery");

function installFakeSession(t) {
  const original = mongoose.startSession;
  const state = { committed: false, aborted: false, ended: false };
  mongoose.startSession = async () => ({
    withTransaction: async (work) => {
      try {
        const value = await work();
        state.committed = true;
        return value;
      } catch (error) {
        state.aborted = true;
        throw error;
      }
    },
    endSession: async () => { state.ended = true; },
  });
  t.after(() => { mongoose.startSession = original; });
  return state;
}

function recoveryLockCollection() {
  return {
    async findOneAndUpdate(_filter, update) {
      return { value: { owner: update.$set.owner } };
    },
    async deleteOne() {},
  };
}

test("payment report scopes the transaction lock to the signed-in customer", async (t) => {
  installFakeSession(t);
  const originalUpdate = Request.findOneAndUpdate;
  const originalPaymentCreate = Payment.create;
  t.after(() => {
    Request.findOneAndUpdate = originalUpdate;
    Payment.create = originalPaymentCreate;
  });

  let queryFilter;
  let paymentWrites = 0;
  Request.findOneAndUpdate = (filter) => {
    queryFilter = filter;
    return { lean: async () => null };
  };
  Payment.create = async () => { paymentWrites += 1; throw new Error("Payment must not be written"); };
  const ownerId = "0123456789abcdef01234567";
  await assert.rejects(
    createReport({ user: { _id: ownerId }, body: { requestId: "abcdefabcdefabcdefabcdef", method: "Cash", amount: 20, transactionReference: "forbidden" } }, { status() { return this; }, json() {} }),
    (error) => error.status === 404
  );
  assert.equal(String(queryFilter.customerId), ownerId);
  assert.equal(paymentWrites, 0);
});

test("payment transaction serializes on the request revision and applies the ownership filter", async (t) => {
  const state = installFakeSession(t);
  const originalUpdate = Request.findOneAndUpdate;
  t.after(() => { Request.findOneAndUpdate = originalUpdate; });
  const ownerId = "0123456789abcdef01234567";
  const request = { _id: "abcdefabcdefabcdefabcdef", customerId: ownerId };
  let captured;
  Request.findOneAndUpdate = (filter, update, options) => {
    captured = { filter, update, options };
    return { lean: async () => request };
  };
  let callbackSession;
  const result = await withPaymentTransaction(request._id, { customerId: ownerId }, async (session, lockedRequest) => {
    callbackSession = session;
    assert.equal(lockedRequest, request);
    return "committed";
  });
  assert.equal(result, "committed");
  assert.equal(String(captured.filter.customerId), ownerId);
  assert.deepEqual(captured.update, [{
    $set: {
      paymentRevision: {
        $add: [
          {
            $cond: [
              { $in: [{ $type: "$paymentRevision" }, ["int", "long", "double", "decimal"]] },
              "$paymentRevision",
              0,
            ],
          },
          1,
        ],
      },
    },
  }]);
  assert.equal(captured.options.session, callbackSession);
  assert.equal(captured.options.updatePipeline, true);
  assert.equal(state.committed, true);
});

test("payment report rejects a second submission while the request has a pending report", async (t) => {
  installFakeSession(t);
  const originals = {
    requestUpdate: Request.findOneAndUpdate,
    settingFindOne: require("../models/SystemSetting").findOne,
    paymentFind: Payment.find,
    paymentFindOne: Payment.findOne,
    paymentCreate: Payment.create,
  };
  t.after(() => {
    Request.findOneAndUpdate = originals.requestUpdate;
    require("../models/SystemSetting").findOne = originals.settingFindOne;
    Payment.find = originals.paymentFind;
    Payment.findOne = originals.paymentFindOne;
    Payment.create = originals.paymentCreate;
  });

  const ownerId = "0123456789abcdef01234567";
  const request = {
    _id: "abcdefabcdefabcdefabcdef",
    customerId: ownerId,
    ref: "RCM-2026-ABCDEF12",
    quotation: { state: "Accepted", quotationNumber: "QUO-1", items: [{ amount: 10 }] },
  };
  Request.findOneAndUpdate = () => ({ lean: async () => request });
  const SystemSetting = require("../models/SystemSetting");
  SystemSetting.findOne = () => ({
    select() { return this; },
    session() { return this; },
    lean: async () => ({ paymentMethods: [{ method: "Cash", enabled: true }] }),
  });
  Payment.find = () => ({
    select() { return this; },
    session() { return this; },
    lean: async () => [{ status: "Pending Verification" }],
  });
  Payment.findOne = () => ({ session() { return this; }, lean: async () => null });
  let paymentWrites = 0;
  Payment.create = async () => { paymentWrites += 1; };

  await assert.rejects(
    createReport({
      user: { _id: ownerId, role: "customer" },
      body: {
        requestId: request._id,
        method: "Cash",
        amount: 1,
        transactionReference: "RETRY-1",
      },
    }, { status() { return this; }, json() {} }),
    (error) => error.status === 409 && /already pending verification/.test(error.message)
  );
  assert.equal(paymentWrites, 0);
});

test("cash reports allow an omitted reference; electronic reports still require one", async (t) => {
  const state = installFakeSession(t);
  const SystemSetting = require("../models/SystemSetting");
  const originals = {
    requestUpdate: Request.findOneAndUpdate,
    settingFindOne: SystemSetting.findOne,
    paymentFind: Payment.find,
    paymentFindOne: Payment.findOne,
    paymentCreate: Payment.create,
    auditCreate: SecurityEvent.create,
  };
  t.after(() => {
    Request.findOneAndUpdate = originals.requestUpdate;
    SystemSetting.findOne = originals.settingFindOne;
    Payment.find = originals.paymentFind;
    Payment.findOne = originals.paymentFindOne;
    Payment.create = originals.paymentCreate;
    SecurityEvent.create = originals.auditCreate;
  });

  const ownerId = "0123456789abcdef01234567";
  const request = {
    _id: "abcdefabcdefabcdefabcdef",
    customerId: ownerId,
    ref: "RCM-2026-ABCDEF12",
    quotation: { state: "Accepted", quotationNumber: "QUO-1", items: [{ amount: 100 }] },
  };
  Request.findOneAndUpdate = () => ({ lean: async () => request });
  SystemSetting.findOne = () => ({
    select() { return this; },
    session() { return this; },
    lean: async () => ({ paymentMethods: [{ method: "Cash", enabled: true }] }),
  });
  Payment.find = () => ({
    select() { return this; },
    session() { return this; },
    lean: async () => [],
  });
  Payment.findOne = () => ({ session() { return this; }, lean: async () => null });
  Payment.create = async (documents) => [{
    ...documents[0],
    _id: "123456789012345678901234",
    toObject() { return this; },
  }];
  SecurityEvent.create = async () => [];
  const response = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };

  await assert.rejects(
    createReport({
      user: { _id: ownerId, role: "customer" },
      body: { requestId: request._id, method: "Bank Transfer", amount: 20 },
    }, response),
    (error) => error.status === 400 && /Reference Number is required/.test(error.message)
  );
  assert.equal(state.committed, false);

  await createReport({
    user: { _id: ownerId, role: "customer" },
    body: { requestId: request._id, method: "Cash", amount: 20 },
  }, response);
  assert.equal(response.statusCode, 201);
  assert.equal(response.body.payment.method, "Cash");
  assert.equal(response.body.payment.transactionReference, "");
  assert.equal(state.committed, true);
});

test("unassigned staff receive audited 403 responses for status and quotation mutations", async (t) => {
  const originalFindById = Request.findById;
  const originalAuditCreate = SecurityEvent.create;
  t.after(() => {
    Request.findById = originalFindById;
    SecurityEvent.create = originalAuditCreate;
  });

  const staffId = "aaaaaaaaaaaaaaaaaaaaaaaa";
  const request = {
    _id: "0123456789abcdef01234567",
    ref: "RCM-2026-ASSIGN01",
    status: "For Quotation",
    assignedTo: { _id: "bbbbbbbbbbbbbbbbbbbbbbbb" },
    updatedAt: new Date("2026-10-28T00:00:00.000Z"),
  };
  Request.findById = () => ({
    populate() { return this; },
    lean: async () => request,
  });
  let auditEvents = 0;
  SecurityEvent.create = async (events) => { auditEvents += events.length; };
  const req = {
    user: { _id: staffId, name: "Unassigned Staff", role: "staff" },
    params: { id: request._id },
    method: "PATCH",
    path: `/${request._id}/status`,
    body: { status: "Under Review" },
  };

  await assert.rejects(updateStatus(req, {}), (error) =>
    error.status === 403 && /assigned to this request/.test(error.message));
  await assert.rejects(saveQuotation({
    ...req,
    method: "PUT",
    path: `/${request._id}/quotation`,
    body: { quotation: { items: [{ label: "Fee", amount: 10 }], validUntil: "2099-12-31" } },
  }, {}), (error) => error.status === 403);
  assert.equal(auditEvents, 2);
});

test("payment references have a per-method global unique database index", () => {
  const index = Payment.schema.indexes().find(([keys, options]) =>
    keys.method === 1 && keys.transactionReference === 1 && options.unique
  );
  assert.ok(index);
  assert.deepEqual(index[1].partialFilterExpression, { transactionReference: { $gt: "" } });
});

test("malformed payment IDs are rejected before database access", async (t) => {
  const originalFind = Payment.findById;
  t.after(() => { Payment.findById = originalFind; });
  let databaseReads = 0;
  Payment.findById = () => {
    databaseReads += 1;
    throw new Error("Database access must not occur for malformed IDs.");
  };
  await assert.rejects(verify({ params: { id: "invalid" }, body: {} }, {}), (error) => error.status === 404);
  await assert.rejects(receipt({ params: { id: "invalid" } }, {}), (error) => error.status === 404);
  assert.equal(databaseReads, 0);
});

test("receipt file is written once outside a retried payment transaction callback", async (t) => {
  const originals = {
    startSession: mongoose.startSession,
    requestFindOne: Request.findOne,
    requestUpdate: Request.findOneAndUpdate,
    settingFindOne: require("../models/SystemSetting").findOne,
    paymentFind: Payment.find,
    paymentFindOne: Payment.findOne,
    paymentCreate: Payment.create,
    securityCreate: SecurityEvent.create,
    mkdir: fs.mkdir,
    open: fs.open,
    unlink: fs.unlink,
    lstat: fs.lstat,
    realpath: fs.realpath,
  };
  t.after(() => {
    mongoose.startSession = originals.startSession;
    Request.findOne = originals.requestFindOne;
    Request.findOneAndUpdate = originals.requestUpdate;
    require("../models/SystemSetting").findOne = originals.settingFindOne;
    Payment.find = originals.paymentFind;
    Payment.findOne = originals.paymentFindOne;
    Payment.create = originals.paymentCreate;
    SecurityEvent.create = originals.securityCreate;
    fs.mkdir = originals.mkdir;
    fs.open = originals.open;
    fs.unlink = originals.unlink;
    fs.lstat = originals.lstat;
    fs.realpath = originals.realpath;
  });

  const ownerId = "0123456789abcdef01234567";
  const request = {
    _id: "abcdefabcdefabcdefabcdef",
    customerId: ownerId,
    ref: "RCM-2026-ABCDEF12",
    quotation: { state: "Accepted", quotationNumber: "QUO-1", items: [{ amount: 10 }] },
  };
  mongoose.startSession = async () => ({
    withTransaction: async (work) => {
      await work();
      await work();
    },
    endSession: async () => {},
  });
  Request.findOne = () => ({ select() { return this; }, lean: async () => request });
  Request.findOneAndUpdate = () => ({ lean: async () => request });
  const SystemSetting = require("../models/SystemSetting");
  SystemSetting.findOne = () => ({
    select() { return this; },
    session() { return this; },
    lean: async () => ({ paymentMethods: [{ method: "Bank Transfer", enabled: true }] }),
  });
  Payment.find = () => ({
    select() { return this; },
    session() { return this; },
    lean: async () => [],
  });
  Payment.findOne = (filter) => {
    duplicateFilters.push(filter);
    return { session() { return this; }, lean: async () => null };
  };
  let paymentWrites = 0;
  const duplicateFilters = [];
  Payment.create = async ([payment]) => {
    paymentWrites += 1;
    return [{ toObject: () => ({ ...payment, _id: "fedcbafedcbafedcbafedcba" }) }];
  };
  SecurityEvent.create = async () => {};
  let fileOpens = 0;
  let fileUnlinks = 0;
  fs.mkdir = async () => {};
  fs.lstat = async () => ({ isDirectory: () => true, isSymbolicLink: () => false });
  fs.realpath = async (target) => target;
  fs.open = async () => {
    fileOpens += 1;
    return { writeFile: async () => {}, close: async () => {} };
  };
  fs.unlink = async () => { fileUnlinks += 1; };

  const reportRequest = {
    user: { _id: ownerId },
    body: {
      requestId: request._id,
      method: "Bank Transfer",
      amount: 1,
      transactionReference: "RETRY-1",
      receiptData: `data:application/pdf;base64,${Buffer.from("%PDF-test").toString("base64")}`,
    },
  };
  let response;
  const result = await createReport(reportRequest, {
    status(code) { this.statusCode = code; return this; },
    json(value) { response = { statusCode: this.statusCode, value }; },
  });
  assert.equal(result, undefined);
  assert.equal(response.statusCode, 201);
  assert.equal(fileOpens, 1);
  assert.equal(paymentWrites, 2);
  assert.ok(duplicateFilters.every((filter) => filter.method === "Bank Transfer"));

  mongoose.startSession = async () => ({
    withTransaction: async (work) => {
      await work();
      throw new Error("ambiguous commit result");
    },
    endSession: async () => {},
  });
  await assert.rejects(createReport({
    ...reportRequest,
    body: { ...reportRequest.body, transactionReference: "AMBIGUOUS-1" },
  }, { status() { return this; }, json() {} }), /ambiguous commit result/);
  assert.equal(fileOpens, 2);
  assert.equal(fileUnlinks, 0);

  mongoose.startSession = async () => ({
    withTransaction: async (work) => work(),
    endSession: async () => {},
  });
  Payment.create = async () => {
    const error = new Error("duplicate key");
    error.code = 11000;
    throw error;
  };
  await assert.rejects(createReport({
    ...reportRequest,
    body: { ...reportRequest.body, transactionReference: "DUPLICATE-1" },
  }, { status() { return this; }, json() {} }), (error) =>
    error.status === 409 && /already been reported/.test(error.message));
  assert.equal(fileUnlinks, 0);
});

test("quotation endpoint saves drafts only and cannot record or mark payments", async (t) => {
  const state = installFakeSession(t);
  const originalFindById = Request.findById;
  const originalUpdate = Request.findOneAndUpdate;
  const originalServiceFindOne = Service.findOne;
  const originalAuditCreate = SecurityEvent.create;
  const originalPaymentCreate = Payment.create;
  t.after(() => {
    Request.findById = originalFindById;
    Request.findOneAndUpdate = originalUpdate;
    Service.findOne = originalServiceFindOne;
    SecurityEvent.create = originalAuditCreate;
    Payment.create = originalPaymentCreate;
  });

  const staffId = "0123456789abcdef01234567";
  const request = {
    _id: "abcdefabcdefabcdefabcdef",
    ref: "RCM-2026-ABCDEF12",
    status: "For Quotation",
    assignedTo: staffId,
    updatedAt: new Date("2026-10-28T00:00:00.000Z"),
    serviceId: "hotel",
    description: "Trip details",
    quotation: { state: "Draft", quotationNumber: "QUO-1" },
  };
  Request.findById = () => ({
    populate() { return this; },
    lean: async () => request,
  });
  Service.findOne = () => ({ select() { return this; }, lean: async () => ({ usesQuotation: true }) });
  let captured;
  let capturedFilter;
  let capturedUpdate;
  const saved = { ...request, quotation: { state: "Draft", quotationNumber: "QUO-1", items: [{ label: "Fee", amount: 20 }] } };
  Request.findOneAndUpdate = (filter, update, options) => {
    capturedFilter = filter;
    capturedUpdate = update;
    captured = options;
    return {
      populate() { return this; },
      lean: async () => saved,
    };
  };
  let auditOptions;
  SecurityEvent.create = async (_events, options) => { auditOptions = options; };
  let paymentWrites = 0;
  Payment.create = async () => { paymentWrites += 1; };

  let response;
  await saveQuotation({
    user: { _id: staffId, name: "Staff", role: "staff" },
    params: { id: request._id },
    body: { quotation: {
      items: [{ label: "Fee", amount: 20 }],
      validUntil: "2099-12-31",
      state: "Paid",
      paymentStatus: "Verified",
      amountPaid: 20,
    } },
  }, { json(value) { response = value; return this; } });
  assert.equal(captured.session, auditOptions.session);
  assert.equal(capturedFilter.updatedAt, request.updatedAt);
  assert.equal(capturedFilter.quotation, request.quotation);
  assert.equal(state.committed, true);
  assert.equal(response.request.quotation.quotationNumber, "QUO-1");
  assert.equal(capturedUpdate.$set.quotation.state, "Draft");
  assert.deepEqual(Object.keys(capturedUpdate.$set), ["quotation"]);
  assert.equal(paymentWrites, 0);

  Request.findOneAndUpdate = () => ({
    populate() { return this; },
    lean: async () => null,
  });
  let auditWrites = 0;
  SecurityEvent.create = async () => { auditWrites += 1; };
  await assert.rejects(saveQuotation({
    user: { _id: staffId, name: "Staff", role: "staff" },
    params: { id: request._id },
    body: { quotation: { items: [{ label: "New fee", amount: 25 }], validUntil: "2099-12-31" } },
  }, { json() { return this; } }), (error) => error.status === 409);
  assert.equal(auditWrites, 0);
});

test("request creation keeps the request, event, and notifications in one transaction", async (t) => {
  const state = installFakeSession(t);
  const originals = {
    serviceFindOne: Service.findOne,
    userFind: User.find,
    userExists: User.exists,
    userCreate: User.create,
    requestCreate: Request.create,
    requestFindById: Request.findById,
    notificationInsert: Notification.insertMany,
    securityCreate: SecurityEvent.create,
  };
  t.after(() => {
    Service.findOne = originals.serviceFindOne;
    User.find = originals.userFind;
    User.exists = originals.userExists;
    User.create = originals.userCreate;
    Request.create = originals.requestCreate;
    Request.findById = originals.requestFindById;
    Notification.insertMany = originals.notificationInsert;
    SecurityEvent.create = originals.securityCreate;
  });
  const staffId = "0123456789abcdef01234567";
  let userOptions;
  let requestOptions;
  let notificationOptions;
  let eventOptions;
  Service.findOne = () => ({ lean: async () => ({ active: true, fields: [], documents: [] }) });
  User.exists = () => ({ session() { return this; }, then(resolve) { resolve(null); } });
  User.create = async (users, options) => {
    userOptions = options;
    return users.map((user) => ({ ...user }));
  };
  User.find = () => ({
    select() { return this; },
    session() { return this; },
    lean: async () => [{ _id: "fedcbafedcbafedcbafedcba" }],
  });
  Request.create = async (requests, options) => {
    requestOptions = options;
    return requests;
  };
  Request.findById = () => ({
    populate() { return this; },
    session() { return this; },
    lean: async () => ({
      _id: "aaaaaaaaaaaaaaaaaaaaaaaa",
      ref: "RCM-2026-AAAAAAAA",
      customerId: { _id: "bbbbbbbbbbbbbbbbbbbbbbbb", name: "Walk In" },
      assignedTo: { _id: staffId, name: "Staff" },
      status: "Pending",
      timeline: [],
    }),
  });
  Notification.insertMany = async (_notifications, options) => { notificationOptions = options; };
  SecurityEvent.create = async (_events, options) => { eventOptions = options; };

  let response;
  await createRequest({
    user: { _id: staffId, name: "Staff", role: "staff" },
    body: {
      serviceId: "hotel",
      source: "Walk-in",
      customer: { name: "Walk In", email: "walkin@example.com" },
      description: "Hotel request",
      details: {},
    },
  }, {
    status(code) { this.statusCode = code; return this; },
    json(value) { response = { statusCode: this.statusCode, value }; },
  });

  assert.equal(userOptions.session, requestOptions.session);
  assert.equal(notificationOptions.session, requestOptions.session);
  assert.equal(eventOptions.session, requestOptions.session);
  assert.equal(state.committed, true);
  assert.equal(response.statusCode, 201);
});

test("receipt recovery enforces path containment, DB readiness, active-operation, and query failure safety", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "rcm-receipt-recovery-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  assert.throws(() => receiptPathFor("..\\outside", directory), /Invalid receipt storage identifier/);
  assert.throws(() => receiptPathFor("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa\\..\\outside", directory), /Invalid receipt storage identifier/);
  const linkDirectory = path.join(directory, "link");
  await fs.symlink(directory, linkDirectory, "junction");
  await assert.rejects(removeOrphanedReceiptFiles({
    directory: linkDirectory,
    mongooseInstance: { connection: { readyState: 1 }, trusted: (value) => value },
  }), /real private directory|symlink/);

  const staleOrphan = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const staleReferenced = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const recent = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000);
  await Promise.all([staleOrphan, staleReferenced, recent, "not-a-uuid"].map((name) =>
    fs.writeFile(path.join(directory, name), "fixture")
  ));
  await Promise.all([staleOrphan, staleReferenced, "not-a-uuid"].map((name) =>
    fs.utimes(path.join(directory, name), oldDate, oldDate)
  ));

  const paymentModel = {
    find() {
      return {
        select() { return this; },
        lean: async () => [{ receiptFileId: staleReferenced }],
      };
    },
  };
  const connectedMongoose = { connection: { readyState: 1 }, trusted: (value) => value };
  const removed = await removeOrphanedReceiptFiles({
    directory,
    PaymentModel: paymentModel,
    mongooseInstance: connectedMongoose,
    lockCollection: recoveryLockCollection(),
  });
  assert.equal(removed, 1);
  const remaining = await fs.readdir(directory);
  assert.ok(remaining.includes(staleReferenced));
  assert.ok(remaining.includes(recent));
  assert.ok(remaining.includes("not-a-uuid"));
  assert.ok(!remaining.includes(staleOrphan));

  const activeId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  await fs.writeFile(path.join(directory, activeId), "fixture");
  await fs.utimes(path.join(directory, activeId), oldDate, oldDate);
  const release = beginReceiptOperation(activeId);
  try {
    const activeRemoved = await removeOrphanedReceiptFiles({
      directory,
      PaymentModel: {
        find() {
          return {
            select() { return this; },
            lean: async () => [{ receiptFileId: staleReferenced }],
          };
        },
      },
      mongooseInstance: connectedMongoose,
      lockCollection: recoveryLockCollection(),
    });
    assert.equal(activeRemoved, 0);
    assert.ok((await fs.readdir(directory)).includes(activeId));
  } finally {
    release();
  }

  const leasedId = "11111111-1111-4111-8111-111111111111";
  await fs.writeFile(path.join(directory, leasedId), "fixture");
  await fs.utimes(path.join(directory, leasedId), oldDate, oldDate);
  const leasedResult = await removeOrphanedReceiptFiles({
    directory,
    PaymentModel: { find() { throw new Error("another recovery worker owns the lease"); } },
    mongooseInstance: connectedMongoose,
    lockCollection: {
      async findOneAndUpdate() { return null; },
      async deleteOne() {},
    },
  });
  assert.equal(leasedResult, 0);
  assert.ok((await fs.readdir(directory)).includes(leasedId));

  const unavailableId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
  await fs.writeFile(path.join(directory, unavailableId), "fixture");
  await fs.utimes(path.join(directory, unavailableId), oldDate, oldDate);
  let unavailableQueries = 0;
  await assert.rejects(removeOrphanedReceiptFiles({
    directory,
    PaymentModel: { find() { unavailableQueries += 1; } },
    mongooseInstance: { connection: { readyState: 0 }, trusted: (value) => value },
    lockCollection: recoveryLockCollection(),
  }), /MongoDB is not ready/);
  assert.equal(unavailableQueries, 0);
  assert.ok((await fs.readdir(directory)).includes(unavailableId));

  await assert.rejects(removeOrphanedReceiptFiles({
    directory,
    PaymentModel: { find() { throw new Error("database query failed"); } },
    mongooseInstance: connectedMongoose,
    lockCollection: recoveryLockCollection(),
  }), /database query failed/);
  assert.ok((await fs.readdir(directory)).includes(unavailableId));
  await fs.unlink(path.join(directory, unavailableId));
  await fs.unlink(path.join(directory, activeId));
  await fs.unlink(path.join(directory, leasedId));

  const failureId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  await fs.writeFile(path.join(directory, failureId), "fixture");
  await fs.utimes(path.join(directory, failureId), oldDate, oldDate);
  const errors = [];
  const failingFileSystem = {
    readdir: fs.readdir.bind(fs),
    lstat: fs.lstat.bind(fs),
    realpath: fs.realpath.bind(fs),
    unlink: async () => {
      const error = new Error("simulated cleanup failure");
      error.code = "EACCES";
      throw error;
    },
  };
  const failedRemoval = await removeOrphanedReceiptFiles({
    directory,
    PaymentModel: {
      find() {
        return {
          select() { return this; },
          lean: async () => [{ receiptFileId: staleReferenced }],
        };
      },
    },
    mongooseInstance: connectedMongoose,
    fileSystem: failingFileSystem,
    reportError: (...args) => errors.push(args),
    lockCollection: recoveryLockCollection(),
  });
  assert.equal(failedRemoval, 0);
  assert.equal(errors.length, 1);
  assert.ok((await fs.readdir(directory)).includes(failureId));
});

test("request conflict aborts its transaction before audit or notification callbacks", async (t) => {
  const state = installFakeSession(t);
  const originalUpdate = Request.findOneAndUpdate;
  t.after(() => { Request.findOneAndUpdate = originalUpdate; });
  Request.findOneAndUpdate = () => ({
    populate() { return this; },
    lean: async () => null,
  });
  let sideEffects = 0;
  await assert.rejects(mutateRequest({
    mongoose,
    Request,
    filter: { _id: "0123456789abcdef01234567", status: "Pending" },
    update: { $set: { status: "Cancelled" } },
    afterUpdate: async () => { sideEffects += 1; },
  }), (error) => error.status === 409);
  assert.equal(sideEffects, 0);
  assert.equal(state.aborted, true);
  assert.equal(state.committed, false);
  assert.equal(state.ended, true);
});

test("request mutation filters include the loaded revision and assignment", () => {
  const updatedAt = new Date("2026-10-28T00:00:00.000Z");
  const filter = requestMutationFilter({
    user: { _id: "aaaaaaaaaaaaaaaaaaaaaaaa", role: "staff" },
  }, {
    _id: "0123456789abcdef01234567",
    status: "Processing",
    assignedTo: { _id: "aaaaaaaaaaaaaaaaaaaaaaaa" },
    updatedAt,
  });
  assert.equal(filter.status, "Processing");
  assert.equal(filter.assignedTo, "aaaaaaaaaaaaaaaaaaaaaaaa");
  assert.equal(filter.updatedAt, updatedAt);
});

test("transaction helper marks session cleanup failures after a committed transaction", async () => {
  const cleanupError = new Error("session cleanup failed");
  let actionCompleted = false;
  let sessionEnded = false;
  const transactionMongoose = {
    async startSession() {
      return {
        async withTransaction(work) { await work(); },
        async endSession() {
          sessionEnded = true;
          throw cleanupError;
        },
      };
    },
  };
  await assert.rejects(
    withMongoTransaction(transactionMongoose, async () => {
      actionCompleted = true;
      return "committed";
    }),
    (error) => error === cleanupError && error.transactionCommitted === true
  );
  assert.equal(actionCompleted, true);
  assert.equal(sessionEnded, true);
});

test("request mutation commits its write and audit/notification work in one transaction callback", async (t) => {
  const state = installFakeSession(t);
  const originalUpdate = Request.findOneAndUpdate;
  t.after(() => { Request.findOneAndUpdate = originalUpdate; });
  const saved = { _id: "0123456789abcdef01234567", status: "Cancelled" };
  let passedSession;
  Request.findOneAndUpdate = (_filter, _update, options) => {
    passedSession = options.session;
    return {
      populate() { return this; },
      lean: async () => saved,
    };
  };
  let sideEffects = 0;
  const result = await mutateRequest({
    mongoose,
    Request,
    filter: { _id: saved._id, status: "Pending" },
    update: { $set: { status: "Cancelled" } },
    afterUpdate: async (_updated, session) => {
      assert.equal(session, passedSession);
      sideEffects += 1;
    },
  });
  assert.equal(result, saved);
  assert.equal(sideEffects, 1);
  assert.equal(state.committed, true);
  assert.equal(state.ended, true);
});

test("request mutation aborts when its audit or notification callback fails", async (t) => {
  const state = installFakeSession(t);
  const originalUpdate = Request.findOneAndUpdate;
  t.after(() => { Request.findOneAndUpdate = originalUpdate; });
  Request.findOneAndUpdate = () => ({
    populate() { return this; },
    lean: async () => ({ _id: "0123456789abcdef01234567", status: "Cancelled" }),
  });
  await assert.rejects(mutateRequest({
    mongoose,
    Request,
    filter: { _id: "0123456789abcdef01234567", status: "Pending" },
    update: { $set: { status: "Cancelled" } },
    afterUpdate: async () => { throw new Error("audit write failed"); },
  }), /audit write failed/);
  assert.equal(state.aborted, true);
  assert.equal(state.committed, false);
  assert.equal(state.ended, true);
});

test("document metadata and its audit event use one transaction and retain upload authorization", async (t) => {
  const originals = {
    startSession: mongoose.startSession,
    findOneAndUpdate: Request.findOneAndUpdate,
    findById: Request.findById,
    updateOne: Request.updateOne,
    fileFind: RequestFile.find,
    fileCreate: RequestFile.create,
    eventCreate: SecurityEvent.create,
    mkdir: fs.mkdir,
    open: fs.open,
    unlink: fs.unlink,
  };
  t.after(() => {
    mongoose.startSession = originals.startSession;
    Request.findOneAndUpdate = originals.findOneAndUpdate;
    Request.findById = originals.findById;
    Request.updateOne = originals.updateOne;
    RequestFile.find = originals.fileFind;
    RequestFile.create = originals.fileCreate;
    SecurityEvent.create = originals.eventCreate;
    fs.mkdir = originals.mkdir;
    fs.open = originals.open;
    fs.unlink = originals.unlink;
  });

  const state = { committed: false, aborted: false, ended: false };
  mongoose.startSession = async () => ({
    withTransaction: async (work) => {
      try {
        await work();
        state.committed = true;
      } catch (error) {
        state.aborted = true;
        throw error;
      }
    },
    endSession: async () => { state.ended = true; },
  });

  const currentRequest = {
    _id: "abcdefabcdefabcdefabcdef",
    customerId: "0123456789abcdef01234567",
    assignedTo: null,
    ref: "RCM-2026-ABCDEF12",
  };
  Request.findOneAndUpdate = async () => ({ _id: currentRequest._id });
  Request.findById = () => ({
    select() { return this; },
    lean: async () => currentRequest,
  });
  RequestFile.find = () => ({
    select() { return this; },
    limit() { return this; },
    lean: async () => [],
  });
  let metadataSession;
  RequestFile.create = async ([file], options) => {
    metadataSession = options.session;
    return [{ ...file, _id: "fedcbafedcbafedcbafedcba" }];
  };
  const requestUpdates = [];
  Request.updateOne = async (filter, update, options) => {
    requestUpdates.push({ filter, update, options });
    return { matchedCount: 1 };
  };
  let auditSession;
  SecurityEvent.create = async (_events, options) => { auditSession = options.session; };
  fs.mkdir = async () => {};
  fs.open = async () => ({ writeFile: async () => {}, close: async () => {} });
  fs.unlink = async () => {};

  let response;
  await requestFiles.upload({
    user: { _id: currentRequest.customerId, role: "customer" },
    uploadRequest: currentRequest,
    params: { id: currentRequest._id },
    body: {
      name: "identity.pdf",
      type: "application/pdf",
      data: `data:application/pdf;base64,${Buffer.from("%PDF-test").toString("base64")}`,
    },
  }, {
    status(code) { this.statusCode = code; return this; },
    json(value) { response = { statusCode: this.statusCode, value }; },
  });

  assert.equal(response.statusCode, 201);
  assert.equal(state.committed, true);
  assert.equal(state.aborted, false);
  assert.equal(state.ended, true);
  assert.ok(metadataSession);
  assert.equal(auditSession, metadataSession);
  assert.equal(requestUpdates[0].options.session, metadataSession);
  assert.equal(String(requestUpdates[0].filter.customerId), currentRequest.customerId);
  assert.equal(requestUpdates[0].filter.documentUploadLockToken.length > 0, true);
  assert.equal(requestUpdates.length, 2);
});

test("document audit failure aborts metadata and removes only its uncommitted file", async (t) => {
  const originals = {
    startSession: mongoose.startSession,
    findOneAndUpdate: Request.findOneAndUpdate,
    findById: Request.findById,
    updateOne: Request.updateOne,
    fileFind: RequestFile.find,
    fileCreate: RequestFile.create,
    eventCreate: SecurityEvent.create,
    mkdir: fs.mkdir,
    open: fs.open,
    unlink: fs.unlink,
  };
  t.after(() => {
    mongoose.startSession = originals.startSession;
    Request.findOneAndUpdate = originals.findOneAndUpdate;
    Request.findById = originals.findById;
    Request.updateOne = originals.updateOne;
    RequestFile.find = originals.fileFind;
    RequestFile.create = originals.fileCreate;
    SecurityEvent.create = originals.eventCreate;
    fs.mkdir = originals.mkdir;
    fs.open = originals.open;
    fs.unlink = originals.unlink;
  });

  const state = { aborted: false, ended: false };
  mongoose.startSession = async () => ({
    withTransaction: async (work) => {
      try {
        await work();
      } catch (error) {
        state.aborted = true;
        throw error;
      }
    },
    endSession: async () => { state.ended = true; },
  });
  const currentRequest = {
    _id: "abcdefabcdefabcdefabcdef",
    customerId: "0123456789abcdef01234567",
    assignedTo: null,
    ref: "RCM-2026-ABCDEF12",
  };
  Request.findOneAndUpdate = async () => ({ _id: currentRequest._id });
  Request.findById = () => ({
    select() { return this; },
    lean: async () => currentRequest,
  });
  RequestFile.find = () => ({
    select() { return this; },
    limit() { return this; },
    lean: async () => [],
  });
  RequestFile.create = async ([file]) => [{ ...file, _id: "fedcbafedcbafedcbafedcba" }];
  Request.updateOne = async () => ({ matchedCount: 1 });
  SecurityEvent.create = async () => { throw new Error("audit write failed"); };
  fs.mkdir = async () => {};
  fs.open = async () => ({ writeFile: async () => {}, close: async () => {} });
  const removedFiles = [];
  fs.unlink = async (filePath) => { removedFiles.push(filePath); };

  await assert.rejects(requestFiles.upload({
    user: { _id: currentRequest.customerId, role: "customer" },
    uploadRequest: currentRequest,
    params: { id: currentRequest._id },
    body: {
      name: "identity.pdf",
      type: "application/pdf",
      data: `data:application/pdf;base64,${Buffer.from("%PDF-test").toString("base64")}`,
    },
  }, { status() { return this; }, json() {} }), /audit write failed/);
  assert.equal(state.aborted, true);
  assert.equal(state.ended, true);
  assert.equal(removedFiles.length, 1);
});

test("notification and audit services pass the transaction session and propagate write failures", async (t) => {
  const originalInsert = Notification.insertMany;
  const originalCreate = SecurityEvent.create;
  t.after(() => {
    Notification.insertMany = originalInsert;
    SecurityEvent.create = originalCreate;
  });
  const session = { marker: "tx" };
  let notificationOptions;
  let auditOptions;
  let auditDocument;
  Notification.insertMany = async (_docs, options) => { notificationOptions = options; };
  SecurityEvent.create = async (documents, options) => {
    auditDocument = documents[0];
    auditOptions = options;
  };
  await createNotifications(["0123456789abcdef01234567"], { _id: "abcdefabcdefabcdefabcdef", ref: "RCM-1" }, "Changed", session);
  await logEvent({ ip: "127.0.0.1", user: { _id: "actor-1", name: "Assigned Staff", role: "staff" } }, "request_status_changed", {
    userId: "actor-1",
    entityType: "Request",
    entityId: "request-1",
    previousStatus: "Pending",
    newStatus: "Under Review",
    detail: "RCM-1",
  }, session);
  assert.equal(notificationOptions.session, session);
  assert.equal(auditOptions.session, session);
  assert.equal(String(auditDocument.userId), "actor-1");
  assert.equal(auditDocument.actorName, "Assigned Staff");
  assert.equal(auditDocument.actorRole, "staff");
  assert.equal(auditDocument.category, "business");
  assert.equal(auditDocument.entityType, "Request");
  assert.equal(auditDocument.entityId, "request-1");
  assert.equal(auditDocument.outcome, "success");
  assert.equal(auditDocument.previousStatus, "Pending");
  assert.equal(auditDocument.newStatus, "Under Review");

  SecurityEvent.create = async () => { throw new Error("audit write failed"); };
  await assert.rejects(logEvent({}, "request_changed", {}), /audit write failed/);
});

test("activity log query filters safely and returns persisted event pagination", async (t) => {
  const originalFind = SecurityEvent.find;
  const originalCount = SecurityEvent.countDocuments;
  t.after(() => {
    SecurityEvent.find = originalFind;
    SecurityEvent.countDocuments = originalCount;
  });
  let filter;
  let skip;
  let limit;
  const storedEvent = {
    _id: "event-1",
    at: new Date("2026-10-28T05:00:00.000Z"),
    type: "request_status_changed",
    actorName: "Assigned Staff",
    actorRole: "staff",
    category: "business",
    outcome: "success",
    entityType: "Request",
    entityId: "request-1",
    previousStatus: "Pending",
    newStatus: "Under Review",
    context: {},
    detail: "RCM-1",
    userId: { name: "Assigned Staff" },
  };
  const legacyEvent = {
    _id: "event-legacy",
    at: new Date("2026-10-28T04:00:00.000Z"),
    type: "login_failed",
    userId: null,
  };
  SecurityEvent.find = (query) => {
    filter = query;
    const chain = {
      sort() { return this; },
      skip(value) { skip = value; return this; },
      limit(value) { limit = value; return this; },
      populate() { return this; },
      lean: async () => [storedEvent, legacyEvent],
    };
    return chain;
  };
  SecurityEvent.countDocuments = async () => 101;
  const response = { json(value) { this.body = value; } };
  await audit.list({
    query: {
      page: "2",
      limit: "50",
      role: "staff",
      category: "business",
      outcome: "success",
      search: "RCM-1.*",
    },
  }, response);
  assert.equal(filter.actorRole, "staff");
  assert.equal(filter.$and[0].$or[0].category, "business");
  assert.equal(filter.$and[0].$or[1].category, null);
  assert.equal(filter.$and[1].$or[0].outcome, "success");
  assert.equal(filter.$and[1].$or[1].outcome, null);
  assert.equal(filter.$and[2].$or[4].detail.source, "RCM-1\\.\\*");
  assert.equal(skip, 50);
  assert.equal(limit, 50);
  assert.deepEqual(response.body.pagination, { page: 2, limit: 50, total: 101, totalPages: 3 });
  assert.equal(response.body.events[0].role, "staff");
  assert.equal(response.body.events[0].previousStatus, "Pending");
  assert.equal(response.body.events[0].newStatus, "Under Review");
  assert.equal(response.body.events[1].category, "security");
  assert.equal(response.body.events[1].outcome, "failure");
  assert.equal(response.body.events[1].role, "anonymous");
  assert.equal(response.body.events[1].actor, "Unauthenticated");
});

test("login-blocked, login-success, and logout events have accurate security classifications", async (t) => {
  const originalCreate = SecurityEvent.create;
  t.after(() => {
    SecurityEvent.create = originalCreate;
  });
  const events = [];
  SecurityEvent.create = async ([event]) => { events.push(event); };
  await logEvent({}, "login_blocked_locked");
  await logEvent({}, "login_success");
  await logEvent({}, "logout");
  assert.deepEqual(events.map(({ category, outcome }) => ({ category, outcome })), [
    { category: "security", outcome: "denied" },
    { category: "security", outcome: "success" },
    { category: "security", outcome: "success" },
  ]);
});
