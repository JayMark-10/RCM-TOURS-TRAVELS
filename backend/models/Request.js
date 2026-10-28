
"use strict";

const { mongoose } = require("../config/db");

const checklistItemSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    received: {
      type: Boolean,
      default: false,
    },
  },
  {
    _id: false,
    strict: true,
  }
);

const quotationItemSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: "", maxlength: 1000 },
    quantity: { type: Number, default: 1, min: 1, max: 100000 },
    unitPrice: { type: Number, min: 0, max: 100000000 },
    amount: { type: Number, required: true, min: 0, max: 100000000 },
  },
  { _id: false, strict: true }
);

const quotationSchema = new mongoose.Schema(
  {
    quotationNumber: { type: String, default: "", maxlength: 40 },
    serviceDescription: { type: String, default: "", maxlength: 3000 },
    items: { type: [quotationItemSchema], required: true, default: [] },
    validUntil: { type: String, default: "" },
    note: { type: String, default: "", maxlength: 2000 },
    state: {
      type: String,
      enum: ["Draft", "Sent", "Accepted", "Declined"],
      default: "Draft",
    },
    sentAt: { type: Date, default: null },
    respondedAt: { type: Date, default: null },
  },
  { _id: false, strict: true }
);

const requestSchema = new mongoose.Schema(
  {
    ref: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    paymentRevision: { type: Number, default: 0, select: false },
    documentUploadLockToken: { type: String, default: "", select: false },
    documentUploadLockUntil: { type: Date, default: null, select: false },
    serviceId: {
      type: String,
      required: true,
      match: /^[a-z0-9][a-z0-9-]{0,59}$/,
    },
    source: {
      type: String,
      required: true,
      enum: ["Online", "Walk-in", "Phone"],
      default: "Online",
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    submitted: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: [
        "Pending",
        "Under Review",
        "Awaiting Information",
        "For Quotation",
        "Awaiting Customer Confirmation",
        "Processing",
        "In Progress",
        "Confirmed",
        "Completed",
        "Cancelled",
        "Rejected",
      ],
      default: "Pending",
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    dateFrom: {
      type: String,
      default: "",
    },
    dateTo: {
      type: String,
      default: "",
    },
    description: {
      type: String,
      required: true,
      maxlength: 3000,
    },
    confirmationRecord: { type: String, default: "", maxlength: 1000 },
    quotation: { type: quotationSchema, default: undefined },
    documents: {
      type: [String],
      default: [],
    },
    checklist: {
      type: [checklistItemSchema],
      default: [],
    },
    messages: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    notes: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    timeline: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
  },
  {
    timestamps: true,
    strict: true,
  }
);

module.exports =
  mongoose.models.Request || mongoose.model("Request", requestSchema);
