"use strict";

const AppError = require("../utils/AppError");
const v = require("../utils/validate");
const Service = require("../models/Service");
const { isValidId } = require("../middleware/auth");
const { logEvent } = require("../services/securityLog");

const FIELD_TYPES = ["text", "number", "select", "textarea", "date"];

function dto(service) {
  return {
    id: service.id,
    name: service.name,
    description: service.description,
    icon: service.icon,
    active: service.active,
    usesQuotation: service.usesQuotation,
    datesLabel: service.datesLabel,
    documents: service.documents,
    fields: service.fields,
  };
}

async function listPublic(_req, res) {
  const services = await Service.find({ active: true }).sort({ name: 1 }).lean();
  res.json({ services: services.map(dto) });
}

async function listAdmin(_req, res) {
  const services = await Service.find().sort({ name: 1 }).lean();
  res.json({ services: services.map(dto) });
}

async function listWorkspace(_req, res) {
  const services = await Service.find().sort({ name: 1 }).lean();
  res.json({ services: services.map(dto) });
}

function readOptionList(list) {
  if (!Array.isArray(list) || list.length < 1 || list.length > 50) {
    throw new AppError(400, "Select fields require at least one option.");
  }
  return list.map((option) => v.text(option, "fields.options", { max: 120, label: "Option" }));
}

function readService(body, id) {
  const name = v.text(body.name, "name", { max: 120, label: "Service name" });
  const description = body.description === undefined || body.description === ""
    ? ""
    : v.text(body.description, "description", { max: 1000, label: "Description" });
  const icon = body.icon === undefined ? "map" : v.oneOf(body.icon, "icon", ["plane", "hotel", "map", "file"]);
  if (typeof body.active !== "boolean" || typeof body.usesQuotation !== "boolean") {
    throw new AppError(400, "Invalid service configuration.");
  }
    // An empty label means the service has no date range (for example, documents).
  const datesLabel = body.datesLabel === undefined
    ? "Preferred dates"
    : body.datesLabel === ""
      ? ""
      : v.text(body.datesLabel, "datesLabel", { max: 120, label: "Date label" });

  if (!Array.isArray(body.documents) || body.documents.length > 30) throw new AppError(400, "Invalid required documents.");
  const documents = body.documents.map((item) => v.text(item, "documents", { max: 200, label: "Document name" }));
  if (!Array.isArray(body.fields) || body.fields.length < 1 || body.fields.length > 30) throw new AppError(400, "Add at least one valid service field.");

  const keys = new Set();
  const types = new Map();
  const fields = body.fields.map((field) => {
    if (!field || typeof field !== "object" || Array.isArray(field)) throw new AppError(400, "Invalid service field.");
    const key = v.text(field.key, "fields.key", { max: 50, label: "Field key" });
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(key) || keys.has(key)) throw new AppError(400, "Service field keys must be unique letters, numbers, and underscores.");
    keys.add(key);
    const fieldLabel = v.text(field.label, "fields.label", { max: 120, label: "Field label" });
    const type = v.oneOf(field.type, "fields.type", FIELD_TYPES);
    const placeholder = field.placeholder === undefined || field.placeholder === "" ? "" : v.text(field.placeholder, "fields.placeholder", { max: 200, label: "Placeholder" });

    let options = [];
    let dependsOn;
    let optionsByValue;
    const hasConditionalOptions = field.optionsByValue !== undefined;

    if (hasConditionalOptions) {
      // The choices depend on the answer to an earlier select field.
      if (type !== "select") throw new AppError(400, "Only select fields can have conditional options.");
      dependsOn = v.text(field.dependsOn, "fields.dependsOn", { max: 50, label: "Depends on" });
      if (types.get(dependsOn) !== "select") {
        throw new AppError(400, "A dependent field must follow the select field it depends on.");
      }
      const source = field.optionsByValue;
      if (!source || typeof source !== "object" || Array.isArray(source)) throw new AppError(400, "Invalid conditional options.");
      const entries = Object.entries(source);
      if (entries.length < 1 || entries.length > 50) throw new AppError(400, "Invalid conditional options.");
      optionsByValue = {};
      for (const [answer, list] of entries) {
        const cleanAnswer = v.text(answer, "fields.optionsByValue", { max: 120, label: "Option group" });
        optionsByValue[cleanAnswer] = readOptionList(list);
      }
    } else if (type === "select") {
      options = readOptionList(field.options);
    } else if (field.options !== undefined && (!Array.isArray(field.options) || field.options.length)) {
      throw new AppError(400, "Only select fields can have options.");
    }

    let showWhen;
    if (field.showWhen !== undefined) {
      const condition = field.showWhen;
      if (
        !condition || typeof condition !== "object" || Array.isArray(condition) ||
        !Array.isArray(condition.values) || condition.values.length < 1 || condition.values.length > 30
      ) {
        throw new AppError(400, "Invalid conditional field setting.");
      }
      const conditionKey = v.text(condition.key, "fields.showWhen.key", { max: 50, label: "Condition field" });
      if (!types.has(conditionKey)) throw new AppError(400, "A conditional field must follow the field it depends on.");
      showWhen = {
        key: conditionKey,
        values: condition.values.map((value) => v.text(value, "fields.showWhen.values", { max: 120, label: "Condition value" })),
      };
    }

    const required = field.required === undefined ? true : field.required;
    if (typeof required !== "boolean") throw new AppError(400, "Invalid required field setting.");

    types.set(key, type);
    return {
      key,
      label: fieldLabel,
      type,
      placeholder,
      options,
      required,
      ...(dependsOn ? { dependsOn, optionsByValue } : {}),
      ...(showWhen ? { showWhen } : {}),
    };
  });

  return { id, name, description, icon, active: body.active, usesQuotation: body.usesQuotation, datesLabel, documents, fields };
}

async function save(req, res) {
  if (!/^[a-z0-9][a-z0-9-]{0,59}$/.test(req.params.id)) throw new AppError(400, "Invalid service ID.");
  const serviceData = readService(v.body(req), req.params.id);
  const service = await Service.findOneAndUpdate(
    { id: req.params.id },
    { $set: serviceData },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  ).lean();
  await logEvent(req, "service_saved", {
    userId: req.user._id,
    entityType: "Service",
    entityId: service.id,
    outcome: "success",
    detail: service.name || service.id,
  });
  res.json({ service: dto(service) });
}

async function deleteService(req, res) {
  if (!/^[a-z0-9][a-z0-9-]{0,59}$/.test(req.params.id)) throw new AppError(400, "Invalid service ID.");
  const service = await Service.findOneAndUpdate({ id: req.params.id }, { $set: { active: false } }, { new: true }).lean();
  if (!service) throw new AppError(404, "Service not found.");
  await logEvent(req, "service_deactivated", {
    userId: req.user._id,
    entityType: "Service",
    entityId: service.id,
    outcome: "success",
    detail: service.name || service.id,
  });
  res.json({ service: dto(service) });
}

module.exports = { listPublic, listWorkspace, listAdmin, save, deleteService };
