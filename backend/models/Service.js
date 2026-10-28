"use strict";

const { mongoose } = require("../config/db");

// Shows a field only when another field has one of the listed answers.
// Left undefined on fields that always show, so they are never hidden by accident.
const showWhenSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true, maxlength: 50 },
    values: { type: [String], default: [] },
  },
  { _id: false, strict: true },
);

const fieldSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true, maxlength: 50 },
    label: { type: String, required: true, trim: true, maxlength: 120 },
    type: { type: String, enum: ["text", "number", "select", "textarea", "date"], required: true },
    placeholder: { type: String, default: "", maxlength: 200 },
    options: { type: [String], default: [] },
    required: { type: Boolean, default: true },
    // The field's choices depend on the answer to another field.
    dependsOn: { type: String, trim: true, maxlength: 50 },
    optionsByValue: { type: mongoose.Schema.Types.Mixed },
    showWhen: { type: showWhenSchema, default: undefined },
  },
  { _id: false, strict: true },
);

const serviceSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, trim: true, lowercase: true, maxlength: 60 },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: "", maxlength: 1000 },
    icon: { type: String, enum: ["plane", "hotel", "map", "file"], default: "map" },
    active: { type: Boolean, default: true },
    usesQuotation: { type: Boolean, default: false },
    datesLabel: { type: String, default: "Preferred dates", maxlength: 120 },
    documents: { type: [String], default: [] },
    fields: { type: [fieldSchema], default: [] },
  },
  { timestamps: true, strict: true },
);

module.exports = mongoose.models.Service || mongoose.model("Service", serviceSchema);