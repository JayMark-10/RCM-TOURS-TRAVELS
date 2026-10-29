"use strict";

const crypto = require("crypto");
const { mongoose } = require("../config/db");
const AppError = require("../utils/AppError");
const v = require("../utils/validate");
const Request = require("../models/Request");
const User = require("../models/User");
const Service = require("../models/Service");
const { isValidId } = require("../middleware/auth");
const { logEvent } = require("../services/securityLog");
const { createNotifications } = require("../services/notifications");
const { mutateRequest } = require("../services/requestMutation");
const { withMongoTransaction } = require("../services/mongoTransaction");

const NEXT_STATUSES = {
  Pending: ["Under Review", "Cancelled", "Rejected"],
  "Under Review": ["Awaiting Information", "Processing", "For Quotation", "Rejected", "Cancelled"],
  "Awaiting Information": ["Under Review", "Processing", "Cancelled"],
  Processing: ["For Quotation", "Awaiting Information", "Confirmed", "Rejected", "Cancelled"],
  "For Quotation": ["Awaiting Customer Confirmation", "Cancelled"],
  "Awaiting Customer Confirmation": ["Processing", "Confirmed", "Cancelled"],
  Confirmed: ["In Progress", "Completed", "Cancelled"],
  "In Progress": ["Completed", "Cancelled"],
  Completed: [],
  Cancelled: [],
  Rejected: [],
};
const CLOSED_STATUSES = ["Completed", "Cancelled", "Rejected"];

function optionalDate(value, field) {
  if (value === undefined || value === null || value === "") {
    return "";
  }

  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new AppError(400, `Invalid ${field}.`);
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new AppError(400, `Invalid ${field}.`);
  }

  return value;
}

function readDetails(value) {
  if (value === undefined) {
    return {};
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AppError(400, "Invalid service details.");
  }

  const entries = Object.entries(value);

  if (entries.length > 30) {
    throw new AppError(400, "Too many service detail fields.");
  }

  const details = {};

  for (const [key, item] of entries) {
    if (
      !/^[a-zA-Z][a-zA-Z0-9_]{0,49}$/.test(key) ||
      !["string", "number", "boolean"].includes(typeof item)
    ) {
      throw new AppError(400, "Invalid service details.");
    }

    if (typeof item === "string" && item.length > 500) {
      throw new AppError(400, "A service detail is too long.");
    }

    if (typeof item === "number" && !Number.isFinite(item)) {
      throw new AppError(400, "Invalid service details.");
    }

    details[key] = item;
  }

  return details;
}

// A field can depend on another field's answer in two ways:
// - showWhen: { key, values } shows the field only for those answers.
// - dependsOn + optionsByValue: the field's choices come from another answer.
// A field that doesn't apply to the current answers is removed, so a stale
// value from an earlier choice is never saved.
function answerOf(details, key) {
  const value = details[key];
  return value === undefined || value === null ? "" : String(value);
}

function optionsFor(field, details) {
  if (field.optionsByValue) {
    const answer = answerOf(details, field.dependsOn);
    return Object.prototype.hasOwnProperty.call(field.optionsByValue, answer)
      ? field.optionsByValue[answer]
      : null;
  }
  return field.options || null;
}

function fieldApplies(field, details) {
  if (field.showWhen) {
    return field.showWhen.values.includes(answerOf(details, field.showWhen.key));
  }
  if (field.optionsByValue) {
    return Boolean(optionsFor(field, details));
  }
  return true;
}

function validateServiceDetails(service, details) {
  const fields = service.fields || [];
  const allowed = new Set(fields.map((field) => field.key));
  if (Object.keys(details).some((key) => !allowed.has(key))) {
    throw new AppError(400, "A service detail is not valid for this service.");
  }

  for (const field of fields) {
    if (!fieldApplies(field, details)) {
      delete details[field.key];
      continue;
    }

    const value = details[field.key];
    const empty = value === undefined || value === null || String(value).trim() === "";
    if (empty) {
      if (field.required !== false) throw new AppError(400, `Complete the ${field.label} field.`);
      delete details[field.key];
      continue;
    }

    if (["text", "textarea", "select", "date"].includes(field.type) && typeof value !== "string") {
      throw new AppError(400, `Enter a valid ${field.label} value.`);
    }

    if (field.type === "select" && !(optionsFor(field, details) || []).includes(value)) {
      throw new AppError(400, `Choose a valid ${field.label} option.`);
    }
    if (field.type === "number") {
      details[field.key] = v.numeric(value, `details.${field.key}`, {
        min: 1,
        max: 100000,
        label: field.label,
      });
    }
    if (field.type === "date") {
      optionalDate(String(value), "date");
      details[field.key] = String(value);
    }
  }
}

function readStringArray(value, field, maxItems = 20) {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value) || value.length > maxItems) {
    throw new AppError(400, `Invalid ${field}.`);
  }

  return value.map(function (item) {
    if (
      typeof item !== "string" ||
      item.trim().length < 1 ||
      item.trim().length > 200
    ) {
      throw new AppError(400, `Invalid ${field}.`);
    }

    return item.trim();
  });
}

function readChecklist(value, permittedDocuments, allowReceived = false) {
  if (value === undefined) {
    return permittedDocuments.map((label) => ({ label, received: false }));
  }

  if (!Array.isArray(value) || value.length > 30) {
    throw new AppError(400, "Invalid document checklist.");
  }

  return value.map(function (item) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new AppError(400, "Invalid document checklist.");
    }

    const label = v.text(item.label, "checklist", {
      max: 200,
      label: "Document label",
    });

    if (item.received !== undefined && typeof item.received !== "boolean") {
      throw new AppError(400, "Invalid document checklist.");
    }

    if (!permittedDocuments.includes(label)) {
      throw new AppError(400, "Checklist item is not allowed for this service.");
    }

    return {
      label,
      received: allowReceived && item.received === true,
    };
  });
}

function idOf(value) {
  return value && value._id ? String(value._id) : value ? String(value) : null;
}

function formatRequest(request, includePrivate = false) {
  const customer = request.customerId && request.customerId.name
    ? request.customerId
    : null;
  return {
    id: String(request._id),
    ref: request.ref,
    customerId: idOf(request.customerId),
    customerName: customer?.name || "",
    customerEmail: customer?.email || "",
    serviceId: request.serviceId,
    source: request.source,
    assignedTo: idOf(request.assignedTo),
    submitted: request.submitted
      ? new Date(request.submitted).toISOString().slice(0, 10)
      : "",
    status: request.status,
    details: request.details || {},
    dateFrom: request.dateFrom || "",
    dateTo: request.dateTo || "",
    description: request.description,
    confirmationRecord: request.confirmationRecord || "",
    documents: request.documents || [],
    checklist: request.checklist || [],
    messages: request.messages || [],
    notes: includePrivate ? request.notes || [] : [],
    timeline: (request.timeline || []).map((event) => (
      event && event.text === "Request encoded from phone inquiry"
        ? { ...event, text: "Request encoded from phone call inquiry" }
        : event
    )),
    quotation: request.quotation &&
      (includePrivate || request.quotation.state !== "Draft")
      ? request.quotation
      : null,
  };
}

function isRequestId(id) {
  return isValidId(id) && /^[a-fA-F0-9]{24}$/.test(id);
}

function assertOpen(request) {
  if (CLOSED_STATUSES.includes(request.status)) {
    throw new AppError(409, "This request is closed and cannot be changed.");
  }
}

function canAccess(req, request) {
  if (req.user.role === "admin") return true;
  if (req.user.role === "customer") return idOf(request.customerId) === String(req.user._id);
  return idOf(request.assignedTo) === String(req.user._id) || !request.assignedTo;
}

async function loadRequest(req, { privateFields = false, requireAssignment = false, allowReassignment = false } = {}) {
  const id = req.params.id;
  if (!isRequestId(id)) throw new AppError(400, "Invalid request ID.");
  const query = Request.findById(id).populate("customerId", "name email phone").populate("assignedTo", "name email role active");
  if (!privateFields && req.user.role === "customer") query.select("-notes");
  const request = await query.lean();
  if (!request) throw new AppError(404, "Request not found.");
  if (req.user.role === "staff" && requireAssignment && idOf(request.assignedTo) !== String(req.user._id)) {
    await logEvent(req, "request_assignment_denied", {
      userId: req.user._id,
      entityType: "Request",
      entityId: request._id,
      outcome: "denied",
      detail: `${request.ref}: ${req.method} ${req.path}`,
    });
    throw new AppError(403, "You must be assigned to this request to make that change.");
  }
  const canReassign = allowReassignment && req.user.role === "staff" && req.user.canAssign;
  if (!canAccess(req, request) && !canReassign) throw new AppError(404, "Request not found.");
  return request;
}

function requestSnapshotFilter(request) {
  const filter = {
    _id: request._id,
    status: request.status,
    assignedTo: idOf(request.assignedTo) || null,
  };
  if (request.updatedAt) filter.updatedAt = request.updatedAt;
  return filter;
}

// Bind each mutation to the state and access relationship that was checked by
// loadRequest. This prevents a concurrent status/assignment change from making
// a stale authorization decision writable.
function requestMutationFilter(req, request) {
  const filter = requestSnapshotFilter(request);
  if (req.user.role === "customer") filter.customerId = req.user._id;
  else if (req.user.role === "staff") {
    filter.assignedTo = req.user._id;
  }
  return filter;
}

function requireStaff(req) {
  if (!["staff", "admin"].includes(req.user.role)) {
    throw new AppError(403, "You do not have permission to do that.");
  }
}

function readNote(value, field = "note", max = 2000) {
  return v.text(value, field, { max, label: "Text" });
}

function readStaffId(body) {
  if (!Object.prototype.hasOwnProperty.call(body, "staffId")) {
    throw new AppError(400, "Choose a staff account or explicitly remove the assignment.");
  }
  if (body.staffId === null) return null;
  if (typeof body.staffId !== "string" || !isValidId(body.staffId)) {
    throw new AppError(400, "Invalid staff account.");
  }
  return body.staffId;
}

function timelineEntry(req, text, status) {
  return {
    id: crypto.randomUUID(),
    date: new Date().toISOString(),
    actor: req.user.name,
    actorId: String(req.user._id),
    text,
    ...(status ? { status } : {}),
  };
}

function messageEntry(req, text, from) {
  const now = new Date();
  return {
    id: crypto.randomUUID(),
    from,
    author: req.user.name,
    senderId: String(req.user._id),
    text,
    date: now.toISOString().slice(0, 10),
    createdAt: now.toISOString(),
  };
}

async function notifyAdministrators(request, text, session) {
  const admins = await User.find({ role: "admin", active: true }).select("_id").session(session).lean();
  await createNotifications(admins.map((admin) => admin._id), request, text, session);
}

async function createRequest(req, res) {
  const b = v.body(req);

  const serviceId = v.text(b.serviceId, "serviceId", { max: 60, label: "Service" });
  if (!/^[a-z0-9][a-z0-9-]{0,59}$/.test(serviceId)) throw new AppError(400, "Invalid service.");
  const service = await Service.findOne({ id: serviceId, active: true }).lean();
  if (!service) throw new AppError(400, "This service is not available.");

  const description = v.text(b.description, "description", {
    max: 3000,
    label: "Description",
  });

  const dateFrom = optionalDate(b.dateFrom, "start date");
  const dateTo = optionalDate(b.dateTo, "end date");

  if (dateFrom && dateTo && dateTo < dateFrom) {
    throw new AppError(
      400,
      "The end date must be on or after the start date."
    );
  }

  const details = readDetails(b.details);
  validateServiceDetails(service, details);
  const documents = readStringArray(b.documents, "documents");
  const checklist = readChecklist(b.checklist, service.documents || [], req.user.role !== "customer");

  if (req.user.role === "customer") {
    v.fullName(req.user.name, "name", { max: 120, label: "Full name" });
    v.philippineMobile(req.user.phone, "phone");
  }

  if (b.source !== undefined && !["Online", "Walk-in", "Phone"].includes(b.source)) {
    throw new AppError(400, "Invalid request source.");
  }

  let customerId = req.user._id;
  let newCustomer;
  let selectedCustomerId;
  let source = "Online";
  let internalNote;
  if (req.user.role !== "customer") {
    requireStaff(req);
    source = v.oneOf(b.source, "source", ["Walk-in", "Phone"]);
    if (b.customerId) {
      if (!isValidId(b.customerId)) throw new AppError(400, "Invalid customer.");
      selectedCustomerId = b.customerId;
    } else {
      if (!b.customer || typeof b.customer !== "object" || Array.isArray(b.customer)) {
        throw new AppError(400, "Customer information is required.");
      }
      const name = v.fullName(b.customer.name, "customer.name", { max: 120, label: "Customer name" });
      const email = v.email(b.customer.email, "customer.email");
      const phone = b.customer.phone === undefined || b.customer.phone === ""
        ? ""
        : v.philippineMobile(b.customer.phone, "customer.phone");
      newCustomer = { _id: new mongoose.Types.ObjectId(), name, email, phone, role: "customer", passwordHash: null };
      customerId = newCustomer._id;
    }
    if (b.internalNote !== undefined && b.internalNote !== "") internalNote = readNote(b.internalNote, "internalNote");
  }

  const now = new Date();
  const objectId = new mongoose.Types.ObjectId();
  const year = now.getFullYear();

  const ref = `RCM-${year}-${objectId
    .toHexString()
    .slice(-8)
    .toUpperCase()}`;

  const savedRequest = await withMongoTransaction(mongoose, async (session) => {
      if (selectedCustomerId) {
        const selectedCustomer = await User.findOne({
          _id: selectedCustomerId,
          role: "customer",
          active: true,
        }).session(session);
        if (!selectedCustomer) throw new AppError(400, "Select an active customer account.");
        customerId = selectedCustomer._id;
      } else if (newCustomer) {
        if (await User.exists({ email: newCustomer.email }).session(session)) {
          throw new AppError(409, "A customer account already uses that email.");
        }
        try {
          const [createdCustomer] = await User.create([newCustomer], { session });
          customerId = createdCustomer._id;
        } catch (error) {
          if (error && (error.code === 11000 || error.code === 11001)) {
            throw new AppError(409, "A customer account already uses that email.");
          }
          throw error;
        }
      }

      const requestData = {
        _id: objectId,
        ref,
        customerId,
        serviceId,
        source,
        assignedTo: req.user.role === "staff" ? req.user._id : null,
        submitted: now,
        status: "Pending",
        details,
        dateFrom,
        dateTo,
        description,
        documents: documents.map((name) => name.replace(/[\\/]/g, "")),
        checklist,
        messages: [],
        notes: internalNote ? [{ id: crypto.randomUUID(), author: req.user.name, authorId: String(req.user._id), date: now.toISOString(), text: internalNote }] : [],
        timeline: [{
          id: crypto.randomUUID(),
          date: now.toISOString().slice(0, 10),
          actor: req.user.name,
          actorId: String(req.user._id),
          text: source === "Online"
            ? "Request submitted online"
            : `Request encoded from ${source === "Phone" ? "phone call" : source.toLowerCase()} inquiry`,
          status: "Pending",
        }],
      };
      await Request.create([requestData], { session });
      await logEvent(req, "request_created", {
        userId: req.user._id,
        entityType: "Request",
        entityId: objectId,
        outcome: "success",
        newStatus: "Pending",
        context: { source },
        detail: `Created ${ref}`,
      }, session);
      await notifyAdministrators(requestData, "A new request is ready for review.", session);
      if (source !== "Online") {
        await createNotifications([customerId], requestData, "An RCM staff member recorded a request for you.", session);
      }
      return Request.findById(objectId)
        .populate("customerId", "name email phone")
        .populate("assignedTo", "name email role active")
        .session(session)
        .lean();
  });

  res.status(201).json({
    request: formatRequest(savedRequest, req.user.role !== "customer"),
  });
}

async function getMyRequests(req, res) {
  const filter = req.user.role === "customer"
    ? { customerId: req.user._id }
    : req.user.role === "admin"
      ? {}
      : { $or: [{ assignedTo: req.user._id }, { assignedTo: null }] };
  const requests = await Request.find(filter)
    .populate("customerId", "name email phone")
    .populate("assignedTo", "name email role active")
    .sort({ submitted: -1 })
    .lean();

  res.json({
    requests: requests.map(function (request) {
      return formatRequest(request, req.user.role !== "customer");
    }),
  });
}

// GET /api/requests/:id
// The customer ID in the database lookup always comes from the logged-in
// session, never from the client. A request that does not exist and a request
// that belongs to someone else both get the same 404 answer.
async function getRequestById(req, res) {
  const request = await loadRequest(req);

  res.json({
    request: formatRequest(request, req.user.role !== "customer"),
  });
}

async function updateStatus(req, res) {
  requireStaff(req);
  const request = await loadRequest(req, { privateFields: true, requireAssignment: true });
  assertOpen(request);
  const body = v.body(req);
  const status = v.oneOf(body.status, "status", Object.keys(NEXT_STATUSES));
  if (!NEXT_STATUSES[request.status].includes(status)) throw new AppError(409, `Cannot move a request from ${request.status} to ${status}.`);
  const confirmationRecord = ["Confirmed", "Completed"].includes(status)
    ? readNote(body.confirmationRecord, "confirmationRecord", 1000)
    : request.confirmationRecord || "";
  const timeline = timelineEntry(req, body.note ? readNote(body.note) : `Status changed to ${status}`, status);
  const updated = await mutateRequest({
    mongoose, Request, filter: requestMutationFilter(req, request),
    update: { $set: { status, confirmationRecord }, $push: { timeline } },
    afterUpdate: async (saved, session) => {
      await logEvent(req, "request_status_changed", {
        userId: req.user._id,
        entityType: "Request",
        entityId: request._id,
        outcome: "success",
        previousStatus: request.status,
        newStatus: status,
        detail: request.ref,
      }, session);
      await createNotifications([request.customerId?._id || request.customerId], saved, `Request status updated to ${status}.`, session);
    },
  });
  res.json({ request: formatRequest(updated, true) });
}

async function updateAssignment(req, res) {
  requireStaff(req);
  if (req.user.role !== "admin" && !req.user.canAssign) {
    await logEvent(req, "request_assignment_denied", {
      userId: req.user._id,
      entityType: "Request",
      entityId: req.params.id,
      outcome: "denied",
      detail: `${req.params.id}: reassignment permission required`,
    });
    throw new AppError(403, "You are not authorized to reassign requests.");
  }
  const request = await loadRequest(req, { privateFields: true, allowReassignment: true });
  assertOpen(request);
  const body = v.body(req);
  const staffId = readStaffId(body);
  let staff = null;
  if (staffId !== null) {
    const User = require("../models/User");
    staff = await User.findOne({ _id: staffId, role: "staff", active: true });
    if (!staff) throw new AppError(400, "Choose an active staff account.");
  }
  const updated = await mutateRequest({
    mongoose, Request,
    filter: requestSnapshotFilter(request),
    update: { $set: { assignedTo: staff?._id || null }, $push: { timeline: timelineEntry(req, staff ? `Assigned to ${staff.name}` : "Assignment removed") } },
    afterUpdate: async (saved, session) => {
      await logEvent(req, "request_assigned", {
        userId: req.user._id,
        entityType: "Request",
        entityId: request._id,
        outcome: "success",
        context: {
          previousAssigneeId: idOf(request.assignedTo) || "",
          assignedTo: staff?._id ? String(staff._id) : "",
        },
        detail: `${request.ref}: ${staff ? "assigned" : "unassigned"}`,
      }, session);
      if (staff) await createNotifications([staff._id], saved, "A request has been assigned to you.", session);
    },
  });
  res.json({ request: formatRequest(updated, true) });
}

async function addMessage(req, res) {
  const request = await loadRequest(req, { requireAssignment: true });
  assertOpen(request);
  const body = v.body(req);
  const text = readNote(body.text, "text", 3000);
  const from = req.user.role === "customer" ? "customer" : "staff";
  if (req.user.role === "staff" && body.status !== undefined && body.status !== "Awaiting Information") throw new AppError(400, "Invalid message status.");
  let status = request.status;
  const timeline = [];
  if (from === "staff" && body.status === "Awaiting Information") {
    if (!NEXT_STATUSES[status].includes(body.status)) throw new AppError(409, `Cannot move a request from ${status} to ${body.status}.`);
    status = body.status;
    timeline.push(timelineEntry(req, "Asked customer for missing information", status));
  } else if (from === "customer" && status === "Awaiting Information") {
    status = "Under Review";
    timeline.push(timelineEntry(req, "Customer replied with requested information", status));
  } else {
    timeline.push(timelineEntry(req, from === "customer" ? "Customer sent a message" : "Message sent to customer"));
  }
  const documents = body.documents === undefined ? [] : readStringArray(body.documents, "documents");
  const update = {
    $push: { messages: messageEntry(req, text, from), timeline: { $each: timeline } },
  };
  if (status !== request.status) update.$set = { status };
  if (documents.length) update.$push.documents = { $each: documents.map((name) => name.replace(/[\\/]/g, "")) };
  const updated = await mutateRequest({
    mongoose, Request, filter: requestMutationFilter(req, request), update,
    afterUpdate: async (saved, session) => {
      await logEvent(req, from === "staff" ? "staff_message_sent" : "customer_message_sent", {
        userId: req.user._id,
        entityType: "Request",
        entityId: request._id,
        detail: request.ref,
      }, session);
      if (from === "staff") {
        await createNotifications([request.customerId?._id || request.customerId], saved, body.status === "Awaiting Information" ? "Staff requested additional information." : "You have a new message from staff.", session);
      } else {
        await createNotifications([idOf(request.assignedTo)], saved, "The customer replied to a request.", session);
        const admins = await User.find({ role: "admin", active: true }).select("_id").session(session).lean();
        await createNotifications(admins.map((admin) => admin._id), saved, "The customer replied to a request.", session);
      }
    },
  });
  res.status(201).json({ request: formatRequest(updated, req.user.role !== "customer") });
}

async function addNote(req, res) {
  requireStaff(req);
  const request = await loadRequest(req, { privateFields: true, requireAssignment: true });
  assertOpen(request);
  const body = v.body(req);
  const note = { id: crypto.randomUUID(), author: req.user.name, authorId: String(req.user._id), date: new Date().toISOString(), text: readNote(body.text) };
  const updated = await mutateRequest({
    mongoose,
    Request,
    filter: requestMutationFilter(req, request),
    update: { $push: { notes: { $each: [note], $position: 0 } } },
    afterUpdate: async (_saved, session) => {
      await logEvent(req, "request_note_added", { userId: req.user._id, entityType: "Request", entityId: request._id, detail: request.ref }, session);
    },
  });
  res.status(201).json({ request: formatRequest(updated, true) });
}

async function updateChecklist(req, res) {
  requireStaff(req);
  const request = await loadRequest(req, { privateFields: true, requireAssignment: true });
  assertOpen(request);
  const body = v.body(req);
  if (typeof body.label !== "string" || typeof body.received !== "boolean") throw new AppError(400, "Invalid checklist update.");
  const index = (request.checklist || []).findIndex((item) => item.label === body.label);
  const service = await Service.findOne({ id: request.serviceId }).select("documents").lean();
  if (index < 0 || !service?.documents?.includes(body.label)) throw new AppError(400, "Checklist item is not allowed for this service.");
  const updated = await mutateRequest({
    mongoose,
    Request,
    filter: requestMutationFilter(req, request),
    update: { $set: { [`checklist.${index}.received`]: body.received } },
    afterUpdate: async (_saved, session) => {
      await logEvent(req, "request_checklist_updated", { userId: req.user._id, entityType: "Request", entityId: request._id, detail: request.ref }, session);
    },
  });
  res.json({ request: formatRequest(updated, true) });
}

function readQuotation(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || !Array.isArray(value.items) || value.items.length < 1 || value.items.length > 30) throw new AppError(400, "Add at least one valid quotation item.");
  const items = value.items.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new AppError(400, "Invalid quotation item.");
    const label = v.text(item.label, "quotation.items", { max: 200, label: "Item name" });
    const description = item.description === undefined || item.description === ""
      ? ""
      : v.text(item.description, "quotation.items.description", { max: 1000, label: "Item description" });
    const hasQuantityOrUnitPrice = item.quantity !== undefined || item.unitPrice !== undefined;
    const quantity = hasQuantityOrUnitPrice
      ? typeof item.quantity === "string" && item.quantity.trim() ? Number(item.quantity) : item.quantity
      : 1;
    const unitPriceInput = hasQuantityOrUnitPrice ? item.unitPrice : item.amount;
    const unitPrice = typeof unitPriceInput === "string" && unitPriceInput.trim()
      ? Number(unitPriceInput)
      : unitPriceInput;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100000) {
      throw new AppError(400, "Enter a valid positive whole-number quantity.");
    }
    if (typeof unitPrice !== "number" || !Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > 100000000) {
      throw new AppError(400, "Enter a valid non-negative unit price.");
    }
    const amount = Math.round((quantity * unitPrice + Number.EPSILON) * 100) / 100;
    if (!Number.isFinite(amount) || amount > 100000000) {
      throw new AppError(400, "The quotation line total is too large.");
    }
    return { label, description, quantity, unitPrice, amount };
  });
  const validUntil = optionalDate(value.validUntil, "quotation expiry");
  const note = value.note === undefined || value.note === "" ? "" : v.text(value.note, "quotation.note", { max: 2000, label: "Quotation note" });
  const serviceDescription = value.serviceDescription === undefined || value.serviceDescription === ""
    ? ""
    : v.text(value.serviceDescription, "quotation.serviceDescription", { max: 3000, label: "Service description" });
  return { items, validUntil, note, serviceDescription, state: "Draft" };
}

async function saveQuotation(req, res) {
  requireStaff(req);
  const request = await loadRequest(req, { privateFields: true, requireAssignment: true });
  assertOpen(request);
  const service = await Service.findOne({ id: request.serviceId }).select("usesQuotation").lean();
  if (!service?.usesQuotation && !request.quotation) throw new AppError(400, "Quotations are not available for this service.");
  if (request.quotation && request.quotation.state !== "Draft") throw new AppError(409, "A sent quotation cannot be edited.");
  const quotation = readQuotation(v.body(req).quotation);
  if (quotation.validUntil && quotation.validUntil < new Date().toISOString().slice(0, 10)) throw new AppError(400, "The quotation expiry must be today or later.");
  quotation.quotationNumber = request.quotation?.quotationNumber || `QUO-${request.ref.replace(/^RCM-/, "")}`;
  if (!quotation.serviceDescription) quotation.serviceDescription = request.description;
  const quotationState = request.quotation?.state ?? mongoose.trusted({ $exists: false });
  const updated = await mutateRequest({
    mongoose,
    Request,
    filter: {
      ...requestMutationFilter(req, request),
      ...(request.updatedAt ? { updatedAt: request.updatedAt } : {}),
      ...(request.quotation ? { quotation: request.quotation } : {}),
      "quotation.state": quotationState,
    },
    update: { $set: { quotation } },
    afterUpdate: async (_saved, session) => {
      await logEvent(req, "quotation_draft_saved", {
        userId: req.user._id,
        entityType: "Request",
        entityId: request._id,
        context: { quotationNumber: quotation.quotationNumber },
        detail: request.ref,
      }, session);
    },
  });
  res.json({ request: formatRequest(updated, true) });
}

async function sendQuotation(req, res) {
  requireStaff(req);
  const request = await loadRequest(req, { privateFields: true, requireAssignment: true });
  assertOpen(request);
  const quotation = request.quotation;
  if (!quotation || quotation.state !== "Draft" || !quotation.items?.length || !quotation.validUntil) throw new AppError(409, "Save a complete quotation before sending it.");
  if (quotation.validUntil < new Date().toISOString().slice(0, 10)) throw new AppError(400, "The quotation expiry must be today or later.");
  if (!NEXT_STATUSES[request.status].includes("Awaiting Customer Confirmation")) throw new AppError(409, `A quotation cannot be sent while the request is ${request.status}.`);
  const now = new Date();
  const updated = await mutateRequest({
    mongoose, Request, filter: { ...requestMutationFilter(req, request), "quotation.state": "Draft" },
    update: {
      $set: { status: "Awaiting Customer Confirmation", "quotation.state": "Sent", "quotation.sentAt": now },
      $push: { timeline: timelineEntry(req, "Quotation sent to customer", "Awaiting Customer Confirmation") },
    },
    afterUpdate: async (saved, session) => {
      await logEvent(req, "quotation_sent", {
        userId: req.user._id,
        entityType: "Request",
        entityId: request._id,
        previousStatus: request.status,
        newStatus: "Awaiting Customer Confirmation",
        context: { quotationNumber: quotation.quotationNumber },
        detail: request.ref,
      }, session);
      await createNotifications([request.customerId?._id || request.customerId], saved, "A quotation is ready for your response.", session);
    },
  });
  res.json({ request: formatRequest(updated, true) });
}

async function respondQuotation(req, res) {
  const request = await loadRequest(req);
  if (req.user.role !== "customer") throw new AppError(403, "You do not have permission to do that.");
  const accept = v.body(req).accept;
  if (typeof accept !== "boolean") throw new AppError(400, "Choose whether to accept the quotation.");
  const quotation = request.quotation;
  if (request.status !== "Awaiting Customer Confirmation" || !quotation || quotation.state !== "Sent" || !quotation.sentAt || (quotation.validUntil && quotation.validUntil < new Date().toISOString().slice(0, 10))) throw new AppError(409, "This quotation is no longer available for a response.");
  const status = accept ? "Processing" : "Cancelled";
  const now = new Date();
  const updated = await mutateRequest({
    mongoose, Request, filter: { ...requestMutationFilter(req, request), "quotation.state": "Sent" },
    update: {
      $set: { status, "quotation.state": accept ? "Accepted" : "Declined", "quotation.respondedAt": now },
      $push: { timeline: timelineEntry(req, accept ? "Customer accepted the quotation. Staff will verify the arrangements" : "Customer declined the quotation", status) },
    },
    afterUpdate: async (saved, session) => {
      await logEvent(req, accept ? "quotation_accepted" : "quotation_declined", {
        userId: req.user._id,
        entityType: "Request",
        entityId: request._id,
        previousStatus: request.status,
        newStatus: status,
        context: { quotationNumber: quotation.quotationNumber },
        detail: request.ref,
      }, session);
      await createNotifications([idOf(request.assignedTo)], saved, `The customer ${accept ? "accepted" : "declined"} the quotation.`, session);
      const admins = await User.find({ role: "admin", active: true }).select("_id").session(session).lean();
      await createNotifications(admins.map((admin) => admin._id), saved, `The customer ${accept ? "accepted" : "declined"} a quotation.`, session);
    },
  });
  res.json({ request: formatRequest(updated, false) });
}

async function cancelOwn(req, res) {
  const request = await loadRequest(req);
  if (req.user.role !== "customer" || !["Pending", "Under Review", "Awaiting Information"].includes(request.status)) throw new AppError(409, "This request cannot be cancelled from your account.");
  const updated = await mutateRequest({
    mongoose, Request, filter: requestMutationFilter(req, request),
    update: { $set: { status: "Cancelled" }, $push: { timeline: timelineEntry(req, "Customer cancelled the request", "Cancelled") } },
    afterUpdate: async (saved, session) => {
      await logEvent(req, "request_cancelled", {
        userId: req.user._id,
        entityType: "Request",
        entityId: request._id,
        previousStatus: request.status,
        newStatus: "Cancelled",
        detail: request.ref,
      }, session);
      await createNotifications([idOf(request.assignedTo)], saved, "The customer cancelled this request.", session);
      const admins = await User.find({ role: "admin", active: true }).select("_id").session(session).lean();
      await createNotifications(admins.map((admin) => admin._id), saved, "A customer cancelled a request.", session);
    },
  });
  res.json({ request: formatRequest(updated, false) });
}

module.exports = {
  createRequest,
  getMyRequests,
  getRequestById,
  updateStatus,
  updateAssignment,
  addMessage,
  addNote,
  updateChecklist,
  saveQuotation,
  sendQuotation,
  respondQuotation,
  cancelOwn,
  requestMutationFilter,
  validateServiceDetails,
  readStaffId,
};
