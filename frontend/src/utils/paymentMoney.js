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
    : verifiedCents > 0
      ? "Partially Paid"
      : "Unpaid"
  return { totalCents, verifiedCents, outstandingCents, status }
}
