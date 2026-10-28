import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { apiRequest, getApiBaseUrl } from "../../services/api"
import { Button, Card, CardHeader, Empty, Field, Input, PageHeader } from "../../components/ui"
import { useStore } from "../../lib/store"
import { centsToMoney, paymentBalance } from "../../utils/paymentMoney"

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
        : `Enter an amount from ₱0.01 to ₱${maximumVerifiable.toFixed(2)}.`)
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

  const cashEnabled = (settings.paymentMethods || []).some((method) => method.method === "Cash" && method.enabled)
  const cashRequests = requests
    .filter((request) => request.quotation?.state === "Accepted" && (user?.role === "admin" || request.assignedTo === user?.id))
    .map((request) => ({
      request,
      balance: paymentBalance(request.quotation, payments.filter((payment) => payment.requestId === request.id)),
    }))
    .filter(({ balance }) => balance.outstandingCents > 0)

  return <>
    <PageHeader title="Payment Management" sub="Review reports, verify real receipts, and track verified balances. A report alone never counts as received funds." />
    {actionError && <div role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{actionError}</div>}
    {loadError && <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-red-50 p-3 text-sm text-red-800"><p className="min-w-0 break-words">{loadError}</p><Button variant="outline" size="sm" onClick={refresh}>Retry</Button></div>}
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
                <span>Outstanding: ₱{centsToMoney(balance.outstandingCents).toLocaleString()}</span>
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
      <CardHeader title="Payment reports" />
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
                  <Link className="font-mono text-sm font-semibold text-blue" to={`${basePath}/${payment.requestId}`}>{payment.requestRef}</Link>
                  <p className="mt-1 text-sm">{payment.customerName} · {payment.quotationNumber} · {payment.method} · reported ₱{payment.amountReported.toLocaleString()}</p>
                  <p className="text-xs text-muted">Payment date: {new Date(payment.paymentDate).toLocaleDateString()}</p>
                  <p className="break-words text-xs text-muted [overflow-wrap:anywhere]">Receipt / Transaction Reference Number: {payment.transactionReference || "Not provided (existing record)"}</p>
                  <p className="text-xs text-muted">Verified ₱{payment.verifiedTotal.toLocaleString()} · due ₱{payment.outstanding.toLocaleString()} · {payment.balanceStatus}</p>
                  <p className="mt-1 text-xs text-muted">Record: {payment.status}{payment.verifiedAt ? ` · reviewed ${new Date(payment.verifiedAt).toLocaleString()}` : ""}{payment.verificationNote ? ` · ${payment.verificationNote}` : ""}</p>
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
      setError(`Enter a cash amount from ₱0.01 to ₱${maxAmount.toFixed(2)}.`)
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
