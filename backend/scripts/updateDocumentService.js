"use strict";

// One-time update: replaces the Document Assistance form definition in MongoDB
// with the current one from config/defaultServices.js.
// Run from the backend folder:  node scripts\updateDocumentService.js

const { loadEnv } = require("../config/env");
const { connectDb, mongoose } = require("../config/db");
const Service = require("../models/Service");
const { DEFAULT_SERVICES } = require("../config/defaultServices");

async function main() {
  const cfg = loadEnv();
  await connectDb(cfg.mongoUri);

  const definition = DEFAULT_SERVICES.find((service) => service.id === "documents");
  if (!definition) throw new Error("Document Assistance definition not found.");

  const result = await Service.updateOne(
    { id: "documents" },
    { $set: { fields: definition.fields, documents: definition.documents, datesLabel: definition.datesLabel, usesQuotation: true } },
  );

  if (result.matchedCount === 0) {
    console.log("No existing Document Assistance service found. It will be created with the new form the next time the server starts.");
  } else {
    console.log(`Updated Document Assistance (${result.modifiedCount} record changed).`);
  }
}

main()
  .catch((error) => {
    console.error("Update failed:", error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
