export const STATUSES = [
  "Pending",
  "Under Review",
  "Awaiting Information",
  "Processing",
  "For Quotation",
  "Awaiting Customer Confirmation",
  "Confirmed",
  "In Progress",
  "Completed",
  "Cancelled",
  "Rejected",
]
export const SOURCE_LABELS = {
  Online: "Online",
  "Walk-in": "Walk-in",
  Phone: "Phone Call",
}

export const SOURCES = Object.entries(SOURCE_LABELS).map(([value, label]) => ({
  value,
  label,
}))
