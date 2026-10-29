import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { apiRequest, getApiBaseUrl } from "../../services/api"
import { Badge, Button, Card, CardHeader, Empty, Field, Input, PageHeader } from "../../components/ui"
import { useStore } from "../../lib/store"
import {
  centsToMoney,
  combinedPaymentBalance,
  formatPaymentDate,
  formatReviewedAt,
  quotationPaymentSummaries,
} from "../../utils/paymentMoney"

const formatMoney = (value) => Number.isFinite(Number(value))
  ? new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(value))
  : "Not available"

const financialStatusTone = {
  Unpaid: "bg-red-50 text-red-800 ring-red-200",
  "Partially Paid": "bg-yellow-50 text-yellow-900 ring-yellow-300",
  Paid: "bg-green-50 text-green-800 ring-green-200",
}

const reviewStatusTone = {
  "Pending Verification": "bg-yellow-50 text-yellow-900 ring-yellow-300",
  Verified: "bg-blue-50 text-blue-800 ring-blue-200",
  Rejected: "bg-red-50 text-red-800 ring-red-200",
}

function FinancialBadge({ status }) {
  return <Badge className={financialStatusTone[status] || "bg-slate-50 text-slate-700 ring-slate-200"}>{status || "Unknown"}</Badge>
}

function ReviewBadge({ status }) {
  return <Badge className={reviewStatusTone[status] || "bg-slate-50 text-slate-700 ring-slate-200"}>{status || "Unknown"}</Badge>
}

export default function PaymentManagement({ basePath = "/staff/requests" }) {
  const { notify, requests, user, settings, settingsLoading, settingsError, refreshSettings } = useStore()
  const [payments, setPayments] = useState([])
  const [loadError, setLoadError] = useState("")
  const [actionError, setActionError] = useState("")
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState("")
  const [notes, setNotes] = useState({})
  const [amounts, setAmounts] = useState({})

  async function refresh() {
    setLoadError("")
    setLoading(true)
    try {
      const result = await apiRequest("/api/payments")
      setPayments(result.payments)
    } catch (requestError) {
      setLoadError(requestError.message || "Unable to load payments.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  async function decide(payment, decision) {
    const maximumVerifiable = Math.min(payment.amountReported, payment.outstanding)
    const amountVerified = Number(amounts[payment.id] ?? maximumVerifiable)
    if (decision === "verify" && (maximumVerifiable < 0.01 || !Number.isFinite(amountVerified) || amountVerified <= 0 || amountVerified > maximumVerifiable)) {
      setActionError(maximumVerifiable < 0.01
        ? "There is no remaining quotation balance to verify for this payment."
        : `Enter an amount from ${formatMoney(0.01)} to ${formatMoney(maximumVerifiable)}.`)
      return
    }
    setBusyId(payment.id)
    setActionError("")
    try {
      await apiRequest(`/api/payments/${payment.id}/verification`, {
        method: "PATCH",
        body: JSON.stringify({ decision, note: notes[payment.id] || "", amountVerified }),
      })
      await refresh()
      notify(decision === "verify" ? "Payment verified and balance updated." : "Payment report rejected.")
    } catch (requestError) {
      setActionError(requestError.message || "Unable to update this payment.")
    } finally {
      setBusyId("")
    }
  }

  const visibleRequests = useMemo(
    () => user?.role === "admin"
      ? requests
      : requests.filter((request) => request.assignedTo === user?.id),
    [requests, user?.id, user?.role],
  )
  const quotationSummaries = useMemo(
    () => quotationPaymentSummaries(visibleRequests, payments),
    [visibleRequests, payments],
  )
  const combinedBalance = useMemo(
    () => combinedPaymentBalance(quotationSummaries),
    [quotationSummaries],
  )
  const cashEnabled = (settings.paymentMethods || []).some((method) => method.method === "Cash" && method.enabled)
  const cashRequests = quotationSummaries.filter(({ balance }) => balance.outstandingCents > 0)

  return <>
    <PageHeader title="Payment Management" sub="Compare each accepted quotation with verified payments. Pending or rejected reports never reduce the outstanding balance." />
    {actionError && <div role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{actionError}</div>}
    {loadError && <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-red-50 p-3 text-sm text-red-800"><p className="min-w-0 break-words">{loadError}</p><Button variant="outline" size="sm" onClick={refresh}>Retry</Button></div>}

    <Card className="mb-5">
      <CardHeader title="Accepted quotation balances" sub="Each request is counted once. Only verified payments reduce the balance." />
      {loading ? <p role="status" className="p-4 text-sm text-muted">Loading quotation balances...</p> : quotationSummaries.length === 0 ? (
        <p className="p-4 text-sm text-muted">No accepted quotations are available for your account.</p>
      ) : (
        <>
          <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-3 sm:p-5">
            <SummaryAmount label="Combined quotation total" value={formatMoney(centsToMoney(combinedBalance.totalCents))} />
            <SummaryAmount label="Verified amount paid" value={formatMoney(centsToMoney(combinedBalance.verifiedCents))} />
            <SummaryAmount label="Combined outstanding balance" value={formatMoney(centsToMoney(combinedBalance.outstandingCents))} emphasis />
          </div>
          <ul className="divide-y divide-line">
            {quotationSummaries.map(({ request, balance }) => (
              <li key={request.id} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,1fr))_auto] sm:items-center sm:p-5">
                <div className="min-w-0">
                  <Link className="font-mono text-sm font-semibold text-blue" to={`${basePath}/${request.id}`}>{request.ref}</Link>
                  <p className="break-words text-xs text-muted">{request.customerName || "Customer"} · {request.quotation?.quotationNumber || "Quotation"}</p>
                </div>
                <SummaryAmount label="Quotation / total" value={formatMoney(centsToMoney(balance.totalCents))} />
                <SummaryAmount label="Verified paid" value={formatMoney(centsToMoney(balance.verifiedCents))} />
                <SummaryAmount label="Outstanding" value={formatMoney(centsToMoney(balance.outstandingCents))} />
                <FinancialBadge status={balance.status} />
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>

    <Card className="mb-5">
      <CardHeader title="Record cash received" sub="Cash is recorded as verified only after staff physically receive it. Use this payment workflow, not the quotation editor." />
      {settingsLoading ? (
        <p role="status" className="p-4 text-sm text-muted">Checking payment settings...</p>
      ) : settingsError ? (
        <div className="flex flex-wrap items-center justify-between gap-3 p-4"><p className="text-sm text-red-700">Payment settings could not be checked: {settingsError}</p><Button variant="outline" size="sm" onClick={refreshSettings}>Retry</Button></div>
      ) : !cashEnabled ? (
        <p className="p-4 text-sm text-muted">Cash recording is disabled until an administrator enables Cash in System Settings.</p>
      ) : cashRequests.length === 0 ? (
        <p className="p-4 text-sm text-muted">No accepted quotations have an outstanding balance for cash recording.</p>
      ) : (
        <ul className="divide-y divide-line">
          {cashRequests.map(({ request, balance }) => (
            <li key={request.id} className="p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                <Link className="font-mono font-semibold text-blue" to={`${basePath}/${request.id}`}>{request.ref}</Link>
                <span className="font-medium">Outstanding: {formatMoney(centsToMoney(balance.outstandingCents))}</span>
              </div>
              <CashPaymentRecorder request={request} maxAmount={centsToMoney(balance.outstandingCents)} onSaved={async () => {
                await refresh()
                notify("Cash payment recorded as verified. Balance updated.")
              }} />
            </li>
          ))}
        </ul>
      )}
    </Card>

    <Card>
      <CardHeader title="Payment reports" sub="Financial status describes the quotation balance. Record status describes this individual payment report." />
      {loading ? (
        <p role="status" className="p-4 text-sm text-muted sm:p-6">Loading payments...</p>
      ) : loadError ? (
        <p className="p-4 text-sm text-muted sm:p-6">Payment records could not be loaded. Use Retry to check again.</p>
      ) : payments.length === 0 ? (
        <Empty title="No payment records" sub="Customer reports and cash received by staff will appear here." />
      ) : (
        <ul className="divide-y divide-line">
          {payments.map((payment) => (
            <li key={payment.id} className="space-y-3 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link className="font-mono text-sm font-semibold text-blue" to={`${basePath}/${payment.requestId}`}>{payment.requestRef}</Link>
                    <FinancialBadge status={payment.balanceStatus} />
                    <ReviewBadge status={payment.status} />
                  </div>
                  <p className="mt-2 text-sm">{payment.customerName || "Customer"} · {payment.quotationNumber || "Quotation"}</p>
                  <dl className="mt-3 grid gap-x-5 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                    <Detail label="Quotation / total amount" value={formatMoney(payment.quotationTotal)} />
                    <Detail label="Verified amount paid to date" value={formatMoney(payment.verifiedTotal)} />
                    <Detail label="Outstanding balance" value={formatMoney(payment.outstanding)} />
                    <Detail label="Submitted payment amount" value={formatMoney(payment.amountReported)} />
                    <Detail label="Verified payment amount" value={payment.status === "Verified" ? formatMoney(payment.amountVerified) : "Not verified"} />
                    <Detail label="Payment method" value={payment.method || "Not available"} />
                    <Detail label="Payment date" value={formatPaymentDate(payment.paymentDate)} />
                    <Detail label="Receipt / transaction reference" value={payment.transactionReference || "Not provided (existing record)"} />
                    <Detail label="Record status" value={payment.status || "Not available"} />
                    <Detail label="Reviewed" value={payment.verifiedAt ? formatReviewedAt(payment.verifiedAt) : "Not reviewed"} />
                  </dl>
                  {payment.verificationNote && <p className="mt-2 text-xs text-muted">Review note: {payment.verificationNote}</p>}
                </div>
                {payment.hasReceipt && <a className="font-medium text-blue" href={`${getApiBaseUrl()}${payment.receiptUrl}`}>Open receipt</a>}
              </div>
              {payment.status === "Pending Verification" && (
                <div className="grid gap-3 rounded-xl border border-line/75 bg-surface/75 p-3.5 sm:grid-cols-[1fr_1fr_auto_auto]">
                  <p className="text-sm text-muted sm:col-span-4">Review the receipt and payment reference above before verifying this report.</p>
                  {payment.outstanding >= 0.01 ? (
                    <Field label="Amount to verify"><Input type="number" min="0.01" max={Math.min(payment.amountReported, payment.outstanding)} step="0.01" value={amounts[payment.id] ?? Math.min(payment.amountReported, payment.outstanding)} onChange={(event) => setAmounts({ ...amounts, [payment.id]: event.target.value })} /></Field>
                  ) : (
                    <p className="self-center text-sm text-muted">No remaining quotation balance is available to verify.</p>
                  )}
                  <Field label="Verification note"><Input maxLength={1000} value={notes[payment.id] || ""} onChange={(event) => setNotes({ ...notes, [payment.id]: event.target.value })} /></Field>
                  {payment.outstanding >= 0.01 && <Button disabled={busyId === payment.id} onClick={() => decide(payment, "verify")}>{busyId === payment.id ? "Saving..." : "Verify"}</Button>}
                  <Button variant="danger" disabled={busyId === payment.id} onClick={() => decide(payment, "reject")}>Reject</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  </>
}

function SummaryAmount({ label, value, emphasis = false }) {
  return <div className="min-w-0">
    <p className="text-xs text-muted">{label}</p>
    <p className={`mt-0.5 break-words text-sm ${emphasis ? "font-bold text-ink" : "font-semibold text-ink"}`}>{value}</p>
  </div>
}

function Detail({ label, value }) {
  return <div className="min-w-0">
    <dt className="text-xs text-muted">{label}</dt>
    <dd className="break-words font-medium text-ink">{value}</dd>
  </div>
}

function CashPaymentRecorder({ request, maxAmount, onSaved }) {
  const [amount, setAmount] = useState("")
  const [note, setNote] = useState("")
  const [paymentDate, setPaymentDate] = useState(() => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  async function submit(event) {
    event.preventDefault()
    const numericAmount = Number(amount)
    if (!Number.isFinite(numericAmount) || numericAmount <= 0 || numericAmount > maxAmount) {
      setError(`Enter a cash amount from ${formatMoney(0.01)} to ${formatMoney(maxAmount)}.`)
      return
    }
    setSaving(true)
    setError("")
    try {
      await apiRequest("/api/payments/cash", {
        method: "POST",
        body: JSON.stringify({ requestId: request.id, amount, note, paymentDate }),
      })
      setAmount("")
      setNote("")
      await onSaved()
    } catch (requestError) {
      setError(requestError.message || "Unable to record cash received.")
    } finally {
      setSaving(false)
    }
  }

  return <form className="grid gap-3 sm:grid-cols-[1fr_1fr_2fr_auto]" onSubmit={submit}>
    <Input aria-label={`Cash amount received for ${request.ref}`} type="number" min="0.01" max={maxAmount} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Amount received" required disabled={saving} />
    <Input aria-label={`Date cash received for ${request.ref}`} type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} required disabled={saving} />
    <Input aria-label={`Cash payment note for ${request.ref}`} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Receipt note (optional)" disabled={saving} />
    <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Record cash"}</Button>
    {error && <p role="alert" className="text-sm text-red sm:col-span-4">{error}</p>}
  </form>
}
