"use strict";

const Service = require("../models/Service");

const DOCUMENT_TYPES = [
  "Philippine Passport",
  "Visa Assistance",
  "PSA Certificates",
  "NBI Clearance",
  "Police Clearance",
  "DFA Apostille / Document Authentication",
  "DSWD Travel Clearance for Minors",
  "Other Document",
];

const DESTINATION_DOCUMENT_TYPES = [
  "Visa Assistance",
  "DFA Apostille / Document Authentication",
];

const REQUESTED_ACTIONS = {
  "Philippine Passport": [
    "New application",
    "Renewal",
    "Lost or damaged passport",
    "Correction of personal details/change of name",
    "Minor's passport application",
    "Other passport concern",
  ],
  "Visa Assistance": [
    "New application",
    "Renewal or extension",
    "Requirements inquiry",
    "Document review",
    "Other visa concern",
  ],
  "PSA Certificates": [
    "Birth Certificate",
    "Marriage Certificate",
    "Death Certificate",
    "CENOMAR",
    "Certificate of No Death Record",
    "Other PSA document",
  ],
  "NBI Clearance": [
    "New application",
    "Renewal or reapplication",
    "Record or personal details concern",
    "Other NBI concern",
  ],
  "Police Clearance": [
    "New application",
    "Renewal",
    "Other concern",
  ],
  "DFA Apostille / Document Authentication": [
    "PSA certificate",
    "NBI clearance",
    "School records, diploma, or transcript",
    "Affidavit or legal document",
    "Other document",
  ],
  "DSWD Travel Clearance for Minors": [
    "New application",
    "Renewal or update, if applicable",
    "Requirements inquiry",
    "Other concern",
  ],
};

const DEFAULT_SERVICES = [
  {
    id: "flight",
    name: "Flight Booking Assistance",
    description: "Staff help you compare itineraries and prepare a flight request based on your travel plans.",
    icon: "plane",
    active: true,
    usesQuotation: true,
    datesLabel: "Preferred travel dates",
    documents: ["Passport bio page"],
    fields: [
      { key: "trip", label: "Trip type", type: "select", options: ["One-way", "Round trip", "Multi-city"] },
      { key: "origin", label: "Departure city", type: "text", placeholder: "e.g. Manila" },
      { key: "destination", label: "Destination", type: "text", placeholder: "e.g. Tokyo" },
      { key: "passengers", label: "Number of passengers", type: "number" },
      { key: "cabin", label: "Cabin preference", type: "select", options: ["Economy", "Premium Economy", "Business", "No preference"] },
    ],
  },
  {
    id: "hotel",
    name: "Hotel Reservation Assistance",
    description: "Tell us where and when you want to stay, and staff will look into suitable accommodation options.",
    icon: "hotel",
    active: true,
    usesQuotation: true,
    datesLabel: "Check-in / check-out",
    documents: [],
    fields: [
      { key: "destination", label: "City / area", type: "text", placeholder: "e.g. Taipei" },
      { key: "guests", label: "Number of guests", type: "number" },
      { key: "rooms", label: "Rooms needed", type: "number" },
      { key: "stay", label: "Accommodation type", type: "select", options: ["Hotel", "Serviced apartment", "Hostel", "No preference"] },
    ],
  },
  {
    id: "tour",
    name: "Tour Arrangements",
    description: "Request help arranging a guided or custom tour for individuals, families, or groups.",
    icon: "map",
    active: true,
    usesQuotation: true,
    datesLabel: "Preferred tour dates",
    documents: ["Passport bio page (if travelling abroad)"],
    fields: [
      { key: "destination", label: "Destination", type: "text", placeholder: "e.g. Dubai" },
      { key: "group", label: "Group size", type: "number" },
      { key: "style", label: "Tour style", type: "select", options: ["Guided group tour", "Private / custom tour", "Day tour", "Not sure yet"] },
      { key: "interests", label: "Interests", type: "text", placeholder: "Culture, food, shopping..." },
    ],
  },
  {
    id: "documents",
    name: "Document Assistance",
    description: "Get guidance on preparing travel documents and requirements. Approval decisions rest with the issuing authority.",
    icon: "file",
    active: true,
    usesQuotation: true,
    datesLabel: "",
    documents: [],
    fields: [
      { key: "docType", label: "Document type", type: "select", options: DOCUMENT_TYPES },
      { key: "requestedAction", label: "Requested action", type: "select", dependsOn: "docType", optionsByValue: REQUESTED_ACTIONS },
      { key: "destination", label: "Destination country", type: "text", placeholder: "e.g. Japan", showWhen: { key: "docType", values: DESTINATION_DOCUMENT_TYPES } },
      { key: "otherDocument", label: "Document and assistance needed", type: "text", showWhen: { key: "docType", values: ["Other Document"] } },
      { key: "neededBy", label: "Needed by (optional)", type: "date", required: false },
      { key: "additionalDetails", label: "Additional details (optional)", type: "text", required: false },
    ],
  },
];

async function ensureDefaultServices() {
  await Promise.all(DEFAULT_SERVICES.map((service) => Service.updateOne(
    { id: service.id },
    { $setOnInsert: service },
    { upsert: true },
  )));
}

module.exports = { DEFAULT_SERVICES, ensureDefaultServices };
