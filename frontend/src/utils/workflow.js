export const NEXT_STATUSES = {
  Pending: ["Under Review", "Cancelled", "Rejected"],
  "Under Review": [
    "Awaiting Information",
    "Processing",
    "For Quotation",
    "Rejected",
    "Cancelled",
  ],
  "Awaiting Information": ["Under Review", "Processing", "Cancelled"],
  Processing: [
    "For Quotation",
    "Awaiting Information",
    "Confirmed",
    "Rejected",
    "Cancelled",
  ],
  "For Quotation": ["Awaiting Customer Confirmation", "Cancelled"],
  "Awaiting Customer Confirmation": ["Processing", "Confirmed", "Cancelled"],
  Confirmed: ["In Progress", "Completed", "Cancelled"],
  "In Progress": ["Completed", "Cancelled"],
  Completed: [],
  Cancelled: [],
  Rejected: [],
}
export const STATUS_TONE = {
  Pending: "bg-slate-100 text-slate-700 ring-slate-200",
  "Under Review": "bg-blue/10 text-blue-800 ring-blue/20",
  "Awaiting Information": "bg-amber-50 text-amber-800 ring-amber-200",
  Processing: "bg-sky-50 text-sky-800 ring-sky-200",
  "For Quotation": "bg-blue/10 text-blue-800 ring-blue/20",
  "Awaiting Customer Confirmation":
    "bg-orange-50 text-orange-800 ring-orange-200",
  Confirmed: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  "In Progress": "bg-sky-50 text-sky-800 ring-sky-200",
  Completed: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  Cancelled: "bg-zinc-100 text-zinc-600 ring-zinc-200",
  Rejected: "bg-red-50 text-red-800 ring-red-200",
}
export const CLOSED = ["Completed", "Cancelled", "Rejected"]
export const NEEDS_CUSTOMER = [
  "Awaiting Information",
  "Awaiting Customer Confirmation",
]
export const CUSTOMER_CAN_CANCEL = [
  "Pending",
  "Under Review",
  "Awaiting Information",
]
function parseDate(value) {
  if (!value) return null
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value)
  return Number.isNaN(date.getTime()) ? null : date
}

export const fmtDate = (value) => {
  const date = parseDate(value)
  return date
    ? date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "—"
}

export const fmtDateTime = (value) => {
  const date = parseDate(value)
  return date
    ? date.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
    : "—"
}
