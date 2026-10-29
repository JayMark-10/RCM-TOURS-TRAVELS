"use strict";

const crypto = require("crypto");
const fs = require("fs");
const AppError = require("../utils/AppError");
const v = require("../utils/validate");
const Payment = require("../models/Payment");
const Request = require("../models/Request");
const SystemSetting = require("../models/SystemSetting");
const User = require("../models/User");
const { mongoose } = require("../config/db");
const { logEvent } = require("../services/securityLog");
const { withMongoTransaction } = require("../services/mongoTransaction");
const {
  RECEIPT_DIR,
  assertPrivateDirectory,
  beginReceiptOperation,
  receiptPathFor,
} = require("../services/paymentReceiptRecovery");
const {
  centsToMoney,
  moneyToCents,
  quotationTotalCents,
  remainingBalanceCents,
  verifiedPaymentCents,
} = require("../utils/paymentMoney");

const MAX_RECEIPT_SIZE = 3 * 1024 * 1024;
const MAX_RECEIPTS_PER_REQUEST = 20;
const MAX_RECEIPT_BYTES_PER_REQUEST = 30 * 1024 * 1024;
const METHODS = ["Cash", "Bank Transfer", "GCash"];

function validatePaymentId(value) {
  if (typeof value !== "string" || !/^[a-f\d]{24}$/i.test(value)) {
    throw new AppError(404, "Payment not found.");
  }
}

async function removeReceiptFile(fileId) {
  try {
    await fs.promises.unlink(receiptPathFor(fileId));
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("[payments] Could not remove an uncommitted receipt file; recovery will retry.", {
        fileId,
        name: error.name || "Error",
        code: error.code || "unknown",
      });
    }
  }
}

async function writeReceiptFile(fileId, data) {
  await fs.promises.mkdir(RECEIPT_DIR, { recursive: true });
  await assertPrivateDirectory(RECEIPT_DIR);
  const receiptPath = receiptPathFor(fileId);
  let handle;
  try {
    handle = await fs.promises.open(receiptPath, "wx", 0o600);
    await handle.writeFile(data);
    await handle.close();
    handle = null;
  } catch (error) {
    if (handle) {
      try {
        await handle.close();
      } catch (closeError) {
        console.error("[payments] Could not close an incomplete receipt file.", {
          fileId,
          name: closeError.name || "Error",
          code: closeError.code || "unknown",
        });
      }
      await removeReceiptFile(fileId);
    }
    throw error;
  }
}

async function withPaymentTransaction(requestId, accessFilter, action) {
  return withMongoTransaction(mongoose, async (session) => {
    // Every payment operation writes this same Request document inside its
    // transaction. Concurrent snapshots therefore conflict and retry before
    // the balance or receipt quota can be committed from stale reads.
    const request = await Request.findOneAndUpdate(
      { _id: requestId, ...accessFilter },
      [{
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
      }],
      { new: true, session, updatePipeline: true }
    ).lean();
    if (!request) throw new AppError(404, "Request not found.");
    return action(session, request);
  });
}

function canAccess(req, request) {
  if (req.user.role === "admin") return true;
  if (req.user.role === "customer") return String(request.customerId) === String(req.user._id);
  return String(request.assignedTo || "") === String(req.user._id) || !request.assignedTo;
}

async function requireStaffAssignment(req, requestId, action) {
  if (req.user.role !== "staff") return;
  const request = await Request.findById(requestId).select("assignedTo ref").lean();
  if (!request) throw new AppError(404, "Request not found.");
  if (String(request.assignedTo || "") !== String(req.user._id)) {
    await logEvent(req, "request_assignment_denied", {
      userId: req.user._id,
      entityType: "Request",
      entityId: request._id,
      outcome: "denied",
      detail: `${request.ref}: ${action}`,
    });
    throw new AppError(403, "You must be assigned to this request to perform that payment action.");
  }
}

async function getRequest(req, requestId) {
  const request = await Request.findById(requestId).lean();
  if (!request || !canAccess(req, request)) throw new AppError(404, "Request not found.");
  return request;
}

function receiptFromDataUrl(value) {
  if (typeof value !== "string" || value.length > 4_200_000) throw new AppError(400, "Choose a receipt smaller than 3 MB.");
  const match = /^data:(image\/jpeg|image\/png|application\/pdf);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) throw new AppError(400, "Receipt must be a JPEG, PNG, or PDF file.");
  const data = Buffer.from(match[2], "base64");
  if (!data.length || data.length > 3 * 1024 * 1024 || data.toString("base64") !== match[2]) throw new AppError(400, "Choose a valid receipt smaller than 3 MB.");
  const type = match[1];
  const valid = type === "image/jpeg"
    ? data.length > 3 && data[0] === 0xff && data[1] === 0xd8 && data[data.length - 2] === 0xff && data[data.length - 1] === 0xd9
    : type === "image/png"
      ? data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : data.subarray(0, 5).toString("ascii") === "%PDF-";
  if (!valid) throw new AppError(400, "The file contents do not match the selected receipt type.");
  return { data, type };
}

async function paymentDto(payment, request, totals) {
  const totalCents = totals.totalCents ?? moneyToCents(totals.total);
  const verifiedCents = totals.verifiedCents ?? moneyToCents(totals.verified);
  const outstandingCents = remainingBalanceCents(totalCents, verifiedCents);
  return {
    id: String(payment._id),
    requestId: String(request._id),
    requestRef: request.ref,
    customerId: String(payment.customerId),
    quotationNumber: payment.quotationNumber,
    method: payment.method,
    amountReported: payment.amountReported,
    amountVerified: payment.amountVerified,
    paymentDate: payment.paymentDate,
    transactionReference: payment.transactionReference,
    status: payment.status,
    verificationNote: payment.verificationNote,
    verifiedAt: payment.verifiedAt,
    verifiedBy: payment.verifiedBy ? String(payment.verifiedBy) : null,
    hasReceipt: Boolean(payment.receiptFileId),
    receiptUrl: payment.receiptFileId ? `/api/payments/${payment._id}/receipt` : "",
    quotationTotal: centsToMoney(totalCents),
    verifiedTotal: centsToMoney(verifiedCents),
    outstanding: centsToMoney(outstandingCents),
    balanceStatus: totalCents > 0 && outstandingCents === 0 ? "Paid" : verifiedCents > 0 ? "Partially Paid" : "Unpaid",
  };
}

async function list(req, res) {
  let payments;
  if (req.user.role === "customer") {
    payments = await Payment.find({ customerId: req.user._id }).sort({ createdAt: -1 }).lean();
  } else {
    const requests = await Request.find(req.user.role === "admin" ? {} : { assignedTo: req.user._id }).select("_id").lean();
    payments = await Payment.find({ requestId: mongoose.trusted({ $in: requests.map((request) => request._id) }) }).sort({ createdAt: -1 }).lean();
  }
  const response = [];
  for (const payment of payments) {
    const request = await Request.findById(payment.requestId).lean();
    if (!request) continue;
    const customer = await User.findById(payment.customerId).select("name").lean();
    const otherPayments = await Payment.find({ requestId: request._id, status: "Verified" }).select("_id status amountVerified").lean();
    const totals = { totalCents: quotationTotalCents(request), verifiedCents: verifiedPaymentCents(otherPayments) };
    response.push({ ...(await paymentDto(payment, request, totals)), customerName: customer?.name || "" });
  }
  res.json({ payments: response });
}

async function createReport(req, res) {
  const body = v.body(req);
  if (typeof body.requestId !== "string" || !/^[a-f\d]{24}$/i.test(body.requestId)) throw new AppError(400, "Invalid request.");
  const method = v.oneOf(body.method, "method", METHODS);
  let transactionReference = "";
  if (method !== "Cash") {
    transactionReference = v.text(body.transactionReference, "transactionReference", {
      max: 120,
      label: "Receipt / Transaction Reference Number",
    });
  } else if (body.transactionReference !== undefined) {
    if (typeof body.transactionReference !== "string") {
      v.text(body.transactionReference, "transactionReference", {
        max: 120,
        label: "Receipt / Transaction Reference Number",
      });
    }
    if (body.transactionReference.trim()) {
      transactionReference = v.text(body.transactionReference, "transactionReference", {
        max: 120,
        label: "Receipt / Transaction Reference Number",
      });
    }
  }
  if (/[\u0000-\u001f\u007f]/.test(transactionReference)) throw new AppError(400, "Receipt / Transaction Reference Number contains invalid characters.");
  const amount = v.numeric(body.amount, "amount", { min: Number.EPSILON, max: 100000000, label: "payment amount" });
  const amountCents = moneyToCents(amount);
  if (amountCents <= 0) throw new AppError(400, "Enter an amount of at least 0.01.");
  const receipt = ["Bank Transfer", "GCash"].includes(method) ? receiptFromDataUrl(body.receiptData) : null;
  const paymentDate = body.paymentDate === undefined || body.paymentDate === ""
    ? new Date()
    : typeof body.paymentDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.paymentDate) && !Number.isNaN(Date.parse(`${body.paymentDate}T00:00:00.000Z`)) && new Date(`${body.paymentDate}T00:00:00.000Z`).toISOString().slice(0, 10) === body.paymentDate
      ? new Date(`${body.paymentDate}T00:00:00.000Z`)
      : null;
  if (!paymentDate) throw new AppError(400, "Enter a valid payment date.");

  const receiptFileId = receipt ? crypto.randomUUID() : "";
  if (receipt) {
    const ownedRequest = await Request.findOne({
      _id: body.requestId,
      customerId: req.user._id,
    }).select("quotation").lean();
    if (!ownedRequest) throw new AppError(404, "Request not found.");
    if (!ownedRequest.quotation || ownedRequest.quotation.state !== "Accepted") {
      throw new AppError(404, "An accepted quotation was not found.");
    }
  }

  let response;
  const releaseReceipt = receipt ? beginReceiptOperation(receiptFileId) : () => {};
  try {
    if (receipt) {
      await writeReceiptFile(receiptFileId, receipt.data);
    }
    response = await withPaymentTransaction(body.requestId, { customerId: req.user._id }, async (session, request) => {
      if (!request.quotation || request.quotation.state !== "Accepted") throw new AppError(404, "An accepted quotation was not found.");
      const settings = await SystemSetting.findOne({ key: "global" }).select("paymentMethods").session(session).lean();
      const methodSetting = settings?.paymentMethods?.find((item) => item.method === method && item.enabled);
      if (!methodSetting) throw new AppError(400, "This payment method is not currently configured by the agency.");
      const allPayments = await Payment.find({ requestId: request._id }).select("_id status amountVerified").session(session).lean();
      if (allPayments.some((payment) => payment.status === "Pending Verification")) {
        throw new AppError(409, "A payment report is already pending verification for this request. Wait for staff to review it before submitting another report.");
      }
      const totalCents = quotationTotalCents(request);
      const verifiedCents = verifiedPaymentCents(allPayments);
      if (amountCents > remainingBalanceCents(totalCents, verifiedCents)) throw new AppError(400, "The reported amount exceeds the remaining quotation balance.");
      if (receipt) {
        const existingReceipts = await Payment.find({ requestId: request._id, receiptFileId: mongoose.trusted({ $gt: "" }) }).select("receiptSize").session(session).lean();
        if (existingReceipts.length >= MAX_RECEIPTS_PER_REQUEST) throw new AppError(409, "This request has reached its 20-receipt upload limit.");
        const currentReceiptBytes = existingReceipts.reduce((sum, item) => sum + (item.receiptSize > 0 ? item.receiptSize : MAX_RECEIPT_SIZE), 0);
        if (currentReceiptBytes + receipt.data.length > MAX_RECEIPT_BYTES_PER_REQUEST) throw new AppError(409, "Payment receipts for a request cannot exceed 30 MiB in total.");
      }
      if (transactionReference && await Payment.findOne({ method, transactionReference }).session(session).lean()) throw new AppError(409, "This transaction reference has already been reported.");
      const [createdPayment] = await Payment.create([{
        requestId: request._id,
        customerId: req.user._id,
        quotationNumber: request.quotation.quotationNumber || "QUO-" + request.ref.replace(/^RCM-/, ""),
        method,
        amountReported: centsToMoney(amountCents),
        paymentDate,
        transactionReference,
        receiptFileId,
        receiptMimeType: receipt?.type || "",
        receiptSize: receipt?.data.length || 0,
        status: "Pending Verification",
      }], { session });
      await logEvent(req, "payment_reported", {
        userId: req.user._id,
        entityType: "Payment",
        entityId: createdPayment._id,
        context: { requestId: String(request._id), method, amount: centsToMoney(amountCents) },
        detail: request.ref,
      }, session);
      const verifiedPayments = await Payment.find({ requestId: request._id, status: "Verified" }).select("_id status amountVerified").session(session).lean();
      const totals = { totalCents, verifiedCents: verifiedPaymentCents(verifiedPayments) };
      return { payment: await paymentDto(createdPayment.toObject(), request, totals) };
    });
  } catch (error) {
    // A transaction error can have an ambiguous commit result; let recovery
    // check whether the database references this file before removing it.
    if (error?.code === 11000) throw new AppError(409, "This transaction reference has already been reported.");
    throw error;
  } finally {
    releaseReceipt();
  }
  return res.status(201).json(response);
}
async function verify(req, res) {
  validatePaymentId(req.params.id);
  const body = v.body(req);
  const initialPayment = await Payment.findById(req.params.id).lean();
  if (!initialPayment) throw new AppError(404, "Payment not found.");
  if (req.user.role === "customer") throw new AppError(403, "You do not have permission to verify payments.");
  await requireStaffAssignment(req, initialPayment.requestId, "payment verification");
  const accessFilter = req.user.role === "admin" ? {} : { assignedTo: req.user._id };
  const response = await withPaymentTransaction(initialPayment.requestId, accessFilter, async (session, request) => {
    const payment = await Payment.findById(req.params.id).session(session);
    if (!payment) throw new AppError(404, "Payment not found.");
    if (payment.status !== "Pending Verification") throw new AppError(409, "This payment is no longer awaiting verification.");
    const note = body.note === undefined || body.note === "" ? "" : v.text(body.note, "note", { max: 1000, label: "Note" });
    const decision = v.oneOf(body.decision, "decision", ["verify", "reject"]);
    const verification = {
      status: decision === "verify" ? "Verified" : "Rejected",
      verificationNote: note,
      verifiedBy: req.user._id,
      verifiedAt: new Date(),
    };
    if (decision === "verify") {
      const amount = body.amountVerified === undefined
        ? payment.amountReported
        : v.numeric(body.amountVerified, "amountVerified", { min: Number.EPSILON, max: 100000000, label: "verified amount" });
      const amountCents = moneyToCents(amount);
      if (amountCents <= 0 || amountCents > moneyToCents(payment.amountReported)) throw new AppError(400, "Verified amount must be positive and cannot exceed the reported amount.");
      const others = await Payment.find({ requestId: request._id, _id: mongoose.trusted({ $ne: payment._id }) }).select("_id status amountVerified").session(session).lean();
      const totalCents = quotationTotalCents(request);
      const verifiedOtherCents = verifiedPaymentCents(others);
      if (amountCents > remainingBalanceCents(totalCents, verifiedOtherCents)) throw new AppError(409, "Verified payments cannot exceed the remaining quotation balance.");
      verification.amountVerified = centsToMoney(amountCents);
    }
    const updatedPayment = await Payment.findOneAndUpdate(
      { _id: payment._id, status: "Pending Verification" },
      { $set: verification },
      { new: true, runValidators: true, session }
    );
    if (!updatedPayment) throw new AppError(409, "This payment changed while you were working. Refresh and try again.");
    await logEvent(req, decision === "verify" ? "payment_verified" : "payment_rejected", {
      userId: req.user._id,
      entityType: "Payment",
      entityId: updatedPayment._id,
      outcome: decision === "verify" ? "success" : "rejected",
      context: {
        requestId: String(request._id),
        amount: decision === "verify" ? verification.amountVerified : payment.amountReported,
      },
      detail: request.ref,
    }, session);
    const verified = await Payment.find({ requestId: request._id, status: "Verified" }).select("_id status amountVerified").session(session).lean();
    const totals = { totalCents: quotationTotalCents(request), verifiedCents: verifiedPaymentCents(verified) };
    return { payment: await paymentDto(updatedPayment.toObject(), request, totals) };
  });
  return res.json(response);
}

async function recordCash(req, res) {
  const body = v.body(req);
  if (typeof body.requestId !== "string" || !/^[a-f\d]{24}$/i.test(body.requestId)) throw new AppError(400, "Invalid request.");
  if (req.user.role === "customer") throw new AppError(403, "You do not have permission to record cash received.");
  await requireStaffAssignment(req, body.requestId, "cash payment recording");
  const amount = v.numeric(body.amount, "amount", { min: Number.EPSILON, max: 100000000, label: "payment amount" });
  const note = body.note === undefined || body.note === "" ? "" : v.text(body.note, "note", { max: 1000, label: "Note" });
  const accessFilter = req.user.role === "admin" ? {} : { assignedTo: req.user._id };
  const response = await withPaymentTransaction(body.requestId, accessFilter, async (session, request) => {
    const settings = await SystemSetting.findOne({ key: "global" }).select("paymentMethods").session(session).lean();
    if (!settings?.paymentMethods?.some((item) => item.method === "Cash" && item.enabled)) throw new AppError(409, "Cash recording is disabled until the agency enables this payment method.");
    if (!request.quotation || request.quotation.state !== "Accepted") throw new AppError(409, "Cash can be recorded only for an accepted quotation.");
    const paymentDate = body.paymentDate === undefined || body.paymentDate === ""
      ? new Date()
      : typeof body.paymentDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.paymentDate) && !Number.isNaN(Date.parse(`${body.paymentDate}T00:00:00.000Z`)) && new Date(`${body.paymentDate}T00:00:00.000Z`).toISOString().slice(0, 10) === body.paymentDate
        ? new Date(`${body.paymentDate}T00:00:00.000Z`)
        : null;
    if (!paymentDate) throw new AppError(400, "Enter a valid payment date.");
    const amountCents = moneyToCents(amount);
    if (amountCents <= 0) throw new AppError(400, "Enter an amount of at least 0.01.");
    const existing = await Payment.find({ requestId: request._id }).select("_id status amountVerified").session(session).lean();
    const totalCents = quotationTotalCents(request);
    const totalVerifiedCents = verifiedPaymentCents(existing);
    if (amountCents > remainingBalanceCents(totalCents, totalVerifiedCents)) throw new AppError(400, "The amount exceeds the remaining quotation balance.");
    const [payment] = await Payment.create([{
      requestId: request._id,
      customerId: request.customerId,
      quotationNumber: request.quotation.quotationNumber || "QUO-" + request.ref.replace(/^RCM-/, ""),
      method: "Cash",
      amountReported: centsToMoney(amountCents),
      amountVerified: centsToMoney(amountCents),
      paymentDate,
      status: "Verified",
      verifiedBy: req.user._id,
      verifiedAt: new Date(),
      verificationNote: note,
    }], { session });
    await logEvent(req, "cash_payment_recorded", {
      userId: req.user._id,
      entityType: "Payment",
      entityId: payment._id,
      context: { requestId: String(request._id), method: "Cash", amount: centsToMoney(amountCents) },
      detail: request.ref,
    }, session);
    return { payment: await paymentDto(payment.toObject(), request, { totalCents, verifiedCents: totalVerifiedCents + amountCents }) };
  });
  return res.status(201).json(response);
}
async function receipt(req, res) {
  validatePaymentId(req.params.id);
  const payment = await Payment.findById(req.params.id).lean();
  if (!payment) throw new AppError(404, "Receipt not found.");
  const request = await getRequest(req, String(payment.requestId));
  if (req.user.role === "customer" && String(payment.customerId) !== String(req.user._id)) throw new AppError(404, "Receipt not found.");
  if (!payment.receiptFileId || !/^[\da-f-]{36}$/.test(payment.receiptFileId)) throw new AppError(404, "Receipt not found.");
  res.setHeader("Content-Type", payment.receiptMimeType);
  const extension = payment.receiptMimeType === "application/pdf" ? "pdf" : payment.receiptMimeType === "image/png" ? "png" : "jpg";
  res.setHeader("Content-Disposition", `attachment; filename="payment-receipt-${payment._id}.${extension}"`);
  res.setHeader("Cache-Control", "private, no-store");
  res.sendFile(receiptPathFor(payment.receiptFileId), (error) => {
    if (error && !res.headersSent) res.status(404).json({ error: "Receipt not found." });
  });
}

module.exports = { list, createReport, verify, recordCash, receipt, withPaymentTransaction, validatePaymentId };
