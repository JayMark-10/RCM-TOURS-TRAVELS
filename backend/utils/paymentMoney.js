"use strict";

function moneyToCents(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  return Math.round((amount + Number.EPSILON) * 100);
}

function centsToMoney(cents) {
  return Number((cents / 100).toFixed(2));
}

function quotationTotalCents(request) {
  return (request?.quotation?.items ?? []).reduce(
    (sum, item) => sum + moneyToCents(item.amount ?? 0),
    0,
  );
}

function verifiedPaymentCents(payments) {
  const seen = new Set();
  return payments.reduce((sum, payment) => {
    if (payment.status !== "Verified") return sum;
    const id = payment._id ?? payment.id;
    if (id !== undefined && id !== null) {
      const key = String(id);
      if (seen.has(key)) return sum;
      seen.add(key);
    }
    return sum + moneyToCents(payment.amountVerified ?? 0);
  }, 0);
}

function remainingBalanceCents(totalCents, verifiedCents) {
  return Math.max(totalCents - verifiedCents, 0);
}

module.exports = {
  centsToMoney,
  moneyToCents,
  quotationTotalCents,
  remainingBalanceCents,
  verifiedPaymentCents,
};
