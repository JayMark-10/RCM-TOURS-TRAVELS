export function moneyToCents(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return 0
  return Math.round((amount + Number.EPSILON) * 100)
}

export function centsToMoney(cents) {
  return Number((cents / 100).toFixed(2))
}

export function quotationTotalCents(quotation) {
  return (quotation?.items ?? []).reduce(
    (sum, item) => sum + moneyToCents(item.amount ?? 0),
    0,
  )
}

export function verifiedPaymentCents(payments) {
  const seen = new Set()
  return payments.reduce((sum, payment) => {
    if (payment.status !== "Verified") return sum
    if (payment.id != null) {
      const id = String(payment.id)
      if (seen.has(id)) return sum
      seen.add(id)
    }
    return sum + moneyToCents(payment.amountVerified ?? 0)
  }, 0)
}

export function paymentBalance(quotation, payments) {
  const totalCents = quotationTotalCents(quotation)
  const verifiedCents = verifiedPaymentCents(payments)
  const outstandingCents = Math.max(totalCents - verifiedCents, 0)
  const status = totalCents > 0 && outstandingCents === 0
    ? "Paid"
    : totalCents > 0 && verifiedCents > 0
      ? "Partially Paid"
      : "Unpaid"
  return { totalCents, verifiedCents, outstandingCents, status }
}

export function quotationPaymentSummaries(requests, payments) {
  const paymentsByRequest = new Map()
  for (const payment of payments) {
    const key = String(payment.requestId || "")
    if (!key) continue
    const records = paymentsByRequest.get(key) || []
    records.push(payment)
    paymentsByRequest.set(key, records)
  }

  const seenRequests = new Set()
  return requests.flatMap((request) => {
    const requestId = String(request.id || "")
    if (!requestId || seenRequests.has(requestId) || request.quotation?.state !== "Accepted") return []
    seenRequests.add(requestId)
    return [{
      request,
      balance: paymentBalance(request.quotation, paymentsByRequest.get(requestId) || []),
    }]
  })
}

export function combinedPaymentBalance(summaries) {
  const totalCents = summaries.reduce((sum, item) => sum + item.balance.totalCents, 0)
  const verifiedCents = summaries.reduce((sum, item) => sum + item.balance.verifiedCents, 0)
  const outstandingCents = summaries.reduce((sum, item) => sum + item.balance.outstandingCents, 0)
  const status = totalCents > 0 && outstandingCents === 0
    ? "Paid"
    : totalCents > 0 && verifiedCents > 0
      ? "Partially Paid"
      : "Unpaid"
  return { totalCents, verifiedCents, outstandingCents, status }
}

export function formatPaymentDate(value) {
  const date = validDate(value)
  if (!date) return "Not available"
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  const day = String(date.getUTCDate()).padStart(2, "0")
  return `${month}/${day}/${date.getUTCFullYear()}`
}

export function formatReviewedAt(value) {
  const date = validDate(value)
  if (!date) return "Not available"
  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date)
}

function validDate(value) {
  if (value === undefined || value === null || value === "") return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}
