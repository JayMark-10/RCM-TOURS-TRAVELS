import { ArrowLeft, CheckCircle2, Clock3, Upload, XCircle } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Link, useParams } from "react-router-dom"

import {
  FileDrop,
  QuotationView,
  StatusBadge,
  Timeline,
} from "../../components/RequestParts"
import { useServiceName } from "../../hooks/useServiceName"
import {
  Button,
  Card,
  CardHeader,
  Empty,
  Field,
  Modal,
  Input,
  Select,
  Textarea,
} from "../../components/ui"
import { useStore } from "../../lib/store"
import { apiRequest, getApiBaseUrl } from "../../services/api"
import RequestDocuments from "../../components/RequestDocuments"
import {
  CUSTOMER_CAN_CANCEL,
  fmtDate,
  fmtDateTime,
} from "../../utils/workflow"
import {
  centsToMoney,
  moneyToCents,
  paymentBalance,
} from "../../utils/paymentMoney"

const paymentCurrency = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
})

// Real request IDs from the backend are 24-character MongoDB IDs.
// Anything else (for example old prototype IDs like "req-1") is "not found"
// without asking the server.
const SERVER_ID_PATTERN = /^[a-f0-9]{24}$/

export default function CustomerRequestDetail() {
  const { id } = useParams()

  const {
    user,
    requests,
    services,
    fetchRequestById,
    customerMessage,
    respondQuotation,
    cancelOwn,
    notify,
    settings,
  } = useStore()

  const getServiceName = useServiceName()

  const [reply, setReply] = useState("")
  const [files, setFiles] = useState([])
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [actionError, setActionError] = useState("")
  const [savingAction, setSavingAction] = useState(false)
  const [payments, setPayments] = useState([])
  const [paymentsLoadStatus, setPaymentsLoadStatus] = useState("loading")
  const [paymentsLoadError, setPaymentsLoadError] = useState("")
  const [paymentAmount, setPaymentAmount] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("")
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10))
  const [transactionReference, setTransactionReference] = useState("")
  const [referenceError, setReferenceError] = useState("")
  const [receiptFile, setReceiptFile] = useState(null)
  const [receiptError, setReceiptError] = useState("")
  const [paymentSuccess, setPaymentSuccess] = useState("")
  const receiptInputRef = useRef(null)

  // Result of the last server fetch, stored together with the ID it belongs to.
  const [load, setLoad] = useState({
    id: null,
    status: "loading",
    message: "",
  })
  const [attempt, setAttempt] = useState(0)

  // Only customers use this page's server fetch. The endpoint is customer-only.
  const isCustomer = user?.role === "customer"
  const hasServerId = SERVER_ID_PATTERN.test(id ?? "")

  useEffect(() => {
    if (!isCustomer || !hasServerId) {
      return
    }

    // Set to true when the route ID changes or the page unmounts, so an old
    // response can never update state.
    let ignore = false

    fetchRequestById(id)
      .then(() => {
        if (!ignore) {
          setLoad({ id, status: "ready", message: "" })
        }
      })
      .catch((error) => {
        if (ignore) {
          return
        }

        if (error?.status === 404 || error?.status === 400) {
          setLoad({ id, status: "notfound", message: "" })
        } else {
          setLoad({
            id,
            status: "error",
            message:
              error?.message ||
              "Something went wrong while loading this request.",
          })
        }
      })

    return () => {
      ignore = true
    }
  }, [id, isCustomer, hasServerId, attempt, fetchRequestById])

  // Work out what to show. A result for a different ID counts as "loading".
  let loadStatus = "ready"
  let loadMessage = ""

  if (isCustomer) {
    if (!hasServerId) {
      loadStatus = "notfound"
    } else if (load.id === id) {
      loadStatus = load.status
      loadMessage = load.message
    } else {
      loadStatus = "loading"
    }
  }

  function retryLoad() {
    setLoad({ id: null, status: "loading", message: "" })
    setAttempt((current) => current + 1)
  }

  const request =
    loadStatus === "ready"
      ? requests.find((item) => {
          return item.id === id && item.customerId === user.id
        })
      : undefined

  useEffect(() => {
    if (!request || request.quotation?.state !== "Accepted") {
      setPaymentsLoadStatus("idle")
      return
    }
    let ignore = false
    setPaymentsLoadStatus("loading")
    setPaymentsLoadError("")
    apiRequest("/api/payments")
      .then((result) => {
        if (ignore) return
        setPayments(result.payments.filter((payment) => payment.requestId === request.id))
        setPaymentsLoadStatus("ready")
      })
      .catch((error) => {
        if (ignore) return
        setPaymentsLoadError(error.message || "Unable to load payment records.")
        setPaymentsLoadStatus("error")
      })
    return () => { ignore = true }
  }, [request?.id, request?.quotation?.state])

  if (loadStatus === "loading") {
    return (
      <Card>
        <div
          role="status"
          className="p-8 text-center text-sm text-muted"
        >
          Loading request...
        </div>
      </Card>
    )
  }

  if (loadStatus === "error") {
    return (
      <Card>
        <Empty
          title="Unable to load this request"
          sub={loadMessage}
          action={
            <div className="flex flex-wrap items-center justify-center gap-4">
              <Button variant="outline" onClick={retryLoad}>
                Try again
              </Button>

              <Link
                to="/portal/requests"
                className="font-semibold text-blue"
              >
                Back to my requests
              </Link>
            </div>
          }
        />
      </Card>
    )
  }

  if (!request) {
    return (
      <Card>
        <Empty
          title="Request not found"
          sub="This request doesn't exist or isn't on your account."
          action={
            <Link
              to="/portal/requests"
              className="font-semibold text-blue"
            >
              Back to my requests
            </Link>
          }
        />
      </Card>
    )
  }

  const service = services.find((item) => {
    return item.id === request.serviceId
  })

  if (!service) {
    return (
      <Card>
        <Empty
          title="Service configuration missing"
          sub="This request refers to a service that is no longer in the catalog."
          action={
            <Link
              to="/portal/requests"
              className="font-semibold text-blue"
            >
              Back to my requests
            </Link>
          }
        />
      </Card>
    )
  }

  async function handleQuotationResponse(accepted) {
    setActionError("")
    setSavingAction(true)
    try {
      await respondQuotation(request.id, accepted)
      notify(accepted ? "Quotation accepted." : "Quotation declined.")
    } catch (error) {
      setActionError(error.message || "Unable to save your response.")
    } finally {
      setSavingAction(false)
    }
  }

  async function handlePaymentReport(event) {
    event.preventDefault()
    setActionError("")
    setPaymentSuccess("")
    if (pendingPayment) {
      setActionError("A payment report is already pending staff verification. Wait for the review before submitting another report.")
      return
    }
    const normalizedReference = paymentMethod === "Cash" ? "" : transactionReference.trim()
    if (paymentMethod !== "Cash" && !normalizedReference) {
      setReferenceError("Receipt / Transaction Reference Number is required.")
      return
    }
    if (paymentMethod !== "Cash" && normalizedReference.length > 120) {
      setReferenceError("Reference number must be 120 characters or fewer.")
      return
    }
    setReferenceError("")
    const balance = paymentBalance(request.quotation, payments)
    const amountCents = moneyToCents(paymentAmount)
    if (amountCents <= 0 || amountCents > balance.outstandingCents) {
      setActionError("Enter an amount greater than zero and no more than the remaining balance.")
      return
    }
    setSavingAction(true)
    try {
      let receiptData
      if (receiptFile) receiptData = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(new Error("Unable to read the receipt file."))
        reader.readAsDataURL(receiptFile)
      })
      const result = await apiRequest("/api/payments", {
        method: "POST",
        body: JSON.stringify({ requestId: request.id, method: paymentMethod, amount: paymentAmount, paymentDate, transactionReference: normalizedReference, receiptData }),
      })
      setPayments((current) => [result.payment, ...current.filter((payment) => payment.id !== result.payment.id)])
      setPaymentsLoadStatus("ready")
      setPaymentAmount("")
      setTransactionReference("")
      setReceiptFile(null)
      setReceiptError("")
      if (receiptInputRef.current) receiptInputRef.current.value = ""
      setPaymentSuccess(`Your payment report was submitted successfully. Status: ${result.payment.status}. Staff will review it before it counts toward your balance.`)
      notify("Payment report submitted. It is pending staff verification.")
    } catch (error) {
      setActionError(error.message || "Unable to submit payment report.")
    } finally {
      setSavingAction(false)
    }
  }

  function handleReceiptChange(event) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!["image/jpeg", "image/png", "application/pdf"].includes(file.type)) {
      setReceiptFile(null)
      setReceiptError("Choose a JPEG, PNG, or PDF receipt.")
      event.target.value = ""
      return
    }
    if (!file.size || file.size > 3 * 1024 * 1024) {
      setReceiptFile(null)
      setReceiptError("Choose a valid receipt smaller than 3 MB.")
      event.target.value = ""
      return
    }
    setReceiptError("")
    setReceiptFile(file)
  }

  function clearReceipt() {
    setReceiptFile(null)
    setReceiptError("")
    if (receiptInputRef.current) receiptInputRef.current.value = ""
  }

  async function handleReplySubmit(event) {
    event.preventDefault()
    setActionError("")
    setSavingAction(true)
    try {
      const result = await customerMessage(request.id, reply, files)
      setReply("")
      setFiles([])
      notify(result.uploadErrors?.length ? `Reply saved. Some files did not upload: ${result.uploadErrors.join("; ")}` : "Reply saved.")
    } catch (error) {
      setActionError(error.message || "Unable to save your reply.")
    } finally {
      setSavingAction(false)
    }
  }

  async function handleCancelRequest() {
    setActionError("")
    setSavingAction(true)
    try {
      await cancelOwn(request.id)
      setConfirmCancel(false)
      notify("Request cancelled.")
    } catch (error) {
      setActionError(error.message || "Unable to cancel this request.")
    } finally {
      setSavingAction(false)
    }
  }

  function addFiles(newFiles) {
    setFiles((currentFiles) => [...currentFiles, ...newFiles])
  }

  const canReply = ![
    "Completed",
    "Cancelled",
    "Rejected",
  ].includes(request.status)

  const canRespondToQuotation =
    request.status === "Awaiting Customer Confirmation" &&
    request.quotation
  const balance = paymentBalance(request.quotation, payments)
  const pendingPayment = payments.find((payment) => payment.status === "Pending Verification")
  const paymentInputCents = paymentAmount === "" ? null : moneyToCents(paymentAmount)
  const paymentInputError = paymentInputCents === null
    ? ""
    : paymentInputCents <= 0
      ? "Enter an amount greater than zero."
      : paymentInputCents > balance.outstandingCents
        ? "The amount cannot exceed the remaining balance."
        : ""

  async function refreshPaymentStatus() {
    setPaymentsLoadStatus("loading")
    setPaymentsLoadError("")
    try {
      const result = await apiRequest("/api/payments")
      setPayments(result.payments.filter((payment) => payment.requestId === request.id))
      setPaymentsLoadStatus("ready")
    } catch (error) {
      setPaymentsLoadError(error.message || "Unable to refresh payment status.")
      setPaymentsLoadStatus("error")
    }
  }

  return (
    <>
      <Link
        to="/portal/requests"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
      >
        <ArrowLeft size={15} />
        My requests
      </Link>

      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 sm:mb-6">
        <div className="min-w-0">
          <p className="font-mono text-sm font-semibold text-blue">
            {request.ref}
          </p>

          <h1 className="break-words font-display text-3xl font-normal leading-tight text-navy sm:text-4xl">
            {getServiceName(request.serviceId)}
          </h1>
        </div>

        <StatusBadge status={request.status} />
      </div>

      {actionError && (
        <div role="alert" className="mb-5 rounded-lg bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">
          {actionError}
        </div>
      )}

      <div className="grid min-w-0 gap-4 lg:grid-cols-[1.5fr_1fr] lg:gap-6">
        <div className="min-w-0 space-y-4 sm:space-y-6">
          {canRespondToQuotation && (
            <Card className="border-orange-200">
              <CardHeader
                title="Quotation awaiting your response"
                sub="Review the details and let us know how to proceed."
              />

              <div className="space-y-4 p-3.5 sm:p-5">
                <QuotationView q={request.quotation} />

                <p className="text-xs text-muted">
                  Accepting lets staff proceed to verify arrangements. It is
                  not a booking confirmation, and payment is handled outside
                  this system.
                </p>

                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={savingAction || Boolean(pendingPayment)}
                    onClick={() => handleQuotationResponse(true)}
                  >
                    Accept quotation
                  </Button>

                  <Button
                    disabled={savingAction}
                    variant="danger"
                    onClick={() => handleQuotationResponse(false)}
                  >
                    Decline
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {request.quotation?.state === "Accepted" && (
            <Card>
              <CardHeader title="Accepted quotation and payments" sub="Payment reports remain pending until staff verify them." />
              <div className="space-y-4 p-3.5 sm:p-5">
                <QuotationView q={request.quotation} />

                {paymentsLoadStatus === "ready" && <dl className="grid grid-cols-2 gap-3 rounded-xl border border-line bg-surface p-3 sm:grid-cols-4 sm:p-4">
                  <div><dt className="text-xs font-medium text-muted">Quotation total</dt><dd className="mt-1 font-semibold text-navy">{paymentCurrency.format(centsToMoney(balance.totalCents))}</dd></div>
                  <div><dt className="text-xs font-medium text-muted">Amount due</dt><dd className="mt-1 font-semibold text-navy">{paymentCurrency.format(centsToMoney(balance.outstandingCents))}</dd></div>
                  <div><dt className="text-xs font-medium text-muted">Verified</dt><dd className="mt-1 font-semibold text-navy">{paymentCurrency.format(centsToMoney(balance.verifiedCents))}</dd></div>
                  <div><dt className="text-xs font-medium text-muted">Status</dt><dd className="mt-1 font-semibold text-navy">{balance.status}</dd></div>
                </dl>}

                {paymentsLoadStatus === "loading" && <p role="status" className="text-sm text-muted">Loading payment balance...</p>}
                {paymentsLoadStatus === "error" && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-red-50 p-3 text-sm text-red-800"><span>{paymentsLoadError}</span><Button type="button" variant="outline" size="sm" onClick={refreshPaymentStatus}>Retry</Button></div>}
                {paymentSuccess && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-900">{paymentSuccess}</p>}
                {paymentsLoadStatus === "ready" && balance.totalCents === 0 && <p className="rounded-xl border border-line bg-surface p-3.5 text-sm text-muted">No payable balance is configured for this quotation.</p>}
                {paymentsLoadStatus === "ready" && balance.totalCents > 0 && balance.outstandingCents === 0 && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-900">This quotation is fully paid. No additional payment is due.</p>}

                {pendingPayment && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Payment report for {paymentCurrency.format(pendingPayment.amountReported)} is pending staff verification. You cannot submit another report for this request until it is reviewed.</p>}
                {paymentsLoadStatus === "ready" && balance.outstandingCents > 0 && (settings.paymentMethods || []).filter((item) => item.enabled).length === 0 && <p className="text-sm text-muted">The agency has not configured payment instructions yet. Contact the agency before paying.</p>}

                {paymentsLoadStatus === "ready" && balance.outstandingCents > 0 && (settings.paymentMethods || []).filter((item) => item.enabled).length > 0 && (
                  <form className="space-y-3 border-t border-line pt-4" onSubmit={handlePaymentReport}>
                    <p className="text-sm font-semibold">Report a payment</p>
                    <p className="text-sm text-muted">Reported payments are not treated as received until staff verify them.</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Select aria-label="Payment method" value={paymentMethod} onChange={(event) => { setPaymentMethod(event.target.value); setTransactionReference(""); setReferenceError(""); clearReceipt() }} options={(settings.paymentMethods || []).filter((item) => item.enabled).map((item) => ({ value: item.method, label: item.method }))} placeholder="Choose a method" required disabled={savingAction || Boolean(pendingPayment)} />
                      <Input aria-label="Amount paid" type="number" min="0.01" max={centsToMoney(balance.outstandingCents)} step="0.01" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} placeholder="Amount paid" aria-invalid={Boolean(paymentInputError)} aria-describedby={paymentInputError ? "payment-amount-error" : undefined} required disabled={savingAction || Boolean(pendingPayment)} />
                      <Input type="date" aria-label="Date paid" max={new Date().toISOString().slice(0, 10)} value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} required disabled={savingAction || Boolean(pendingPayment)} />
                    </div>
                    {paymentInputError && <p id="payment-amount-error" role="alert" className="text-sm text-red-700">{paymentInputError} Remaining balance: {paymentCurrency.format(centsToMoney(balance.outstandingCents))}.</p>}
                    {paymentMethod !== "Cash" && paymentMethod && (
                      <Field label="Receipt / Transaction Reference Number" hint="Enter the reference shown on your payment receipt (120 characters maximum).">
                        <Input
                          value={transactionReference}
                          onChange={(event) => {
                            setTransactionReference(event.target.value)
                            if (referenceError) setReferenceError("")
                          }}
                          maxLength={120}
                          autoComplete="off"
                          aria-invalid={Boolean(referenceError)}
                          aria-describedby={referenceError ? "payment-reference-error" : undefined}
                          required
                          disabled={savingAction || Boolean(pendingPayment)}
                        />
                        {referenceError && <span id="payment-reference-error" role="alert" className="mt-1 block text-sm text-red-700">{referenceError}</span>}
                      </Field>
                    )}
                    {paymentMethod && <PaymentInstructions method={paymentMethod} instructions={settings.paymentMethods.find((item) => item.method === paymentMethod && item.enabled)?.instructions} />}
                    {paymentMethod !== "Cash" && paymentMethod && <>
                      <div className="space-y-2">
                        <input
                          ref={receiptInputRef}
                          id="payment-receipt"
                          type="file"
                          accept="image/jpeg,image/png,application/pdf"
                          onChange={handleReceiptChange}
                          aria-label="Upload Payment Receipt"
                          aria-describedby="payment-receipt-help"
                          className="peer sr-only"
                          required
                          disabled={savingAction}
                        />
                        <label
                          htmlFor="payment-receipt"
                          className={`inline-flex min-h-12 max-w-full items-center justify-center gap-2 rounded-xl border border-white/35 bg-[#C6283D]/95 px-4 py-3 text-center text-sm font-semibold leading-5 text-white shadow-[0_8px_22px_rgba(198,40,61,.24)] backdrop-blur-md transition-all duration-200 hover:-translate-y-px hover:bg-[#ad2035] hover:shadow-[0_11px_26px_rgba(198,40,61,.3)] active:translate-y-px focus-within:ring-2 focus-within:ring-[#C6283D] focus-within:ring-offset-2 peer-focus-visible:ring-2 peer-focus-visible:ring-[#C6283D] peer-focus-visible:ring-offset-2 ${savingAction ? "pointer-events-none opacity-60" : "cursor-pointer"}`}
                        >
                          <Upload size={18} aria-hidden="true" />
                          <span className="break-words">Upload Payment Receipt</span>
                        </label>
                        {receiptFile && (
                          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface/75 p-3 text-sm">
                            <span className="min-w-0 break-all text-ink" aria-live="polite">
                              {receiptFile.name}
                              <span className="ml-1 text-xs text-muted">({Math.max(1, Math.ceil(receiptFile.size / 1024))} KB)</span>
                            </span>
                            <button type="button" className="min-h-11 rounded-lg px-3 text-sm font-semibold text-red hover:bg-red/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red" onClick={clearReceipt} disabled={savingAction}>
                              Remove
                            </button>
                          </div>
                        )}
                        {receiptError && <p role="alert" className="text-sm text-red-700">{receiptError}</p>}
                        <p id="payment-receipt-help" className="text-xs leading-5 text-muted">JPEG, PNG, or PDF, up to 3 MB. Staff must verify the transfer.</p>
                      </div>
                      <p className="text-xs text-muted">Receipt file: JPEG, PNG, or PDF, up to 3 MB. Staff must verify the transfer.</p>
                    </>}
                    <Button type="submit" disabled={savingAction || Boolean(pendingPayment) || !paymentMethod || Boolean(paymentInputError)}>{savingAction ? "Submitting..." : "Submit payment report"}</Button>
                  </form>
                )}

                <section className="space-y-2 border-t border-line pt-3" aria-label="Payment history">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">Payment history</h3>
                    <Button type="button" variant="outline" size="sm" disabled={paymentsLoadStatus === "loading"} onClick={refreshPaymentStatus}>Refresh payment status</Button>
                  </div>
                  {payments.length === 0 && paymentsLoadStatus === "ready" && <p className="text-sm text-muted">No payment reports yet.</p>}
                  {payments.map((payment) => {
                    const verified = payment.status === "Verified" || payment.status === "Accepted"
                    const rejected = payment.status === "Rejected"
                    const pending = payment.status === "Pending Verification"
                    const statusStyle = verified
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : rejected
                        ? "border-red-200 bg-red-50 text-red-800"
                        : pending
                          ? "border-amber-200 bg-amber-50 text-amber-900"
                          : "border-line bg-slate-50 text-muted"
                    const StatusIcon = verified ? CheckCircle2 : rejected ? XCircle : pending ? Clock3 : null
                    return (
                      <article key={payment.id} className="rounded-xl border border-line bg-white p-4 shadow-sm sm:p-5">
                        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                              <h4 className="break-words text-sm font-semibold text-ink">{payment.method}</h4>
                              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusStyle}`}>
                                {StatusIcon && <StatusIcon size={15} aria-hidden="true" />}
                                <span>{payment.status}</span>
                              </span>
                            </div>
                            <p className="mt-2 text-lg font-semibold tabular-nums text-navy">
                              Reported {paymentCurrency.format(payment.amountReported)}
                            </p>
                            {payment.verifiedAt && (
                              <p className="mt-1 text-xs text-muted">Reviewed {fmtDateTime(payment.verifiedAt)}</p>
                            )}
                          </div>
                          {payment.hasReceipt && (
                            <a
                              className="inline-flex min-h-11 shrink-0 items-center rounded-lg border border-blue/20 px-3 py-2 text-sm font-semibold text-blue hover:bg-blue/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue focus-visible:ring-offset-2"
                              href={getApiBaseUrl() + payment.receiptUrl}
                            >
                              View receipt
                            </a>
                          )}
                        </div>
                        <p className={`mt-3 text-sm leading-5 ${verified ? "text-emerald-800" : rejected ? "text-red-800" : pending ? "text-amber-900" : "text-muted"}`}>
                          {verified
                            ? `This payment has been verified and ${paymentCurrency.format(payment.amountVerified ?? payment.amountReported)} counts toward your balance.`
                            : rejected
                              ? "This payment was rejected and does not count toward your balance."
                              : pending
                                ? "Staff must verify this payment before it counts toward your balance."
                                : `Payment status: ${payment.status}.`}
                        </p>
                        {rejected && payment.verificationNote && (
                          <p className="mt-2 break-words rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900 [overflow-wrap:anywhere]">
                            <span className="font-semibold">Reason from staff: </span>{payment.verificationNote}
                          </p>
                        )}
                        {!rejected && payment.verificationNote && (
                          <p className="mt-2 break-words text-sm text-muted [overflow-wrap:anywhere]">{payment.verificationNote}</p>
                        )}
                      </article>
                    )
                  })}
                </section>
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title="Request details" />

            <dl className="grid gap-x-6 gap-y-4 p-3.5 text-sm sm:grid-cols-2 sm:p-5">
              {(service.fields ?? []).filter((field) => {
                const value = request.details?.[field.key]
                return value !== undefined && value !== null && value !== ""
              }).map((field) => (
                <Item
                  key={field.key}
                  k={field.label}
                  v={request.details[field.key]}
                />
              ))}

              {request.dateFrom && (
                <Item
                  k="Preferred dates"
                  v={`${fmtDate(request.dateFrom)} – ${fmtDate(request.dateTo)}`}
                />
              )}

              <Item
                k="Submitted"
                v={fmtDate(request.submitted)}
              />

              {request.description && <div className="sm:col-span-2">
                <Item
                  k="Description"
                  v={request.description}
                />
              </div>}

              <div className="sm:col-span-2"><RequestDocuments key={(request.documents ?? []).length} requestId={request.id} /></div>
            </dl>
          </Card>

          <Card>
            <CardHeader
              title="Messages with staff"
              sub="Only messages meant for you appear here."
            />

            <div className="space-y-3 p-3.5 sm:p-5">
              {request.messages.length === 0 && (
                <p className="text-sm text-muted">
                  No messages yet.
                </p>
              )}

              {request.messages.map((message) => (
                <div
                  key={message.id}
                  className={`max-w-[85%] rounded-xl px-4 py-3 text-sm ${
                    message.from === "staff"
                      ? "bg-blue/10"
                      : "ml-auto bg-slate-100"
                  }`}
                >
                  <p className="text-xs font-semibold text-muted">
                    {message.author} · {fmtDateTime(message.createdAt ?? message.date)}
                  </p>

                  <p className="mt-1">{message.text}</p>
                </div>
              ))}

              {canReply && (
                <form
                  className="space-y-3 border-t border-line pt-4"
                  onSubmit={handleReplySubmit}
                >
                  <Textarea
                    rows={3}
                    required
                    value={reply}
                    onChange={(event) => setReply(event.target.value)}
                    placeholder={
                      request.status === "Awaiting Information"
                        ? "Provide the information staff asked for..."
                        : "Write a message to staff..."
                    }
                  />

                  <FileDrop
                    files={files}
                    onAdd={addFiles}
                    label="Attach more documents"
                  />

                  <Button type="submit" variant="blue" disabled={savingAction || !reply.trim()}>
                    {savingAction ? "Sending..." : "Send reply"}
                  </Button>
                </form>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Status timeline" />

            <div className="p-3.5 sm:p-5">
              <Timeline events={request.timeline} />
            </div>
          </Card>

          {CUSTOMER_CAN_CANCEL.includes(request.status) && (
            <Button
              variant="danger"
              className="w-full"
              onClick={() => setConfirmCancel(true)}
            >
              Cancel this request
            </Button>
          )}
        </div>
      </div>

      <Modal
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title="Cancel this request?"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setConfirmCancel(false)}
            >
              Keep request
            </Button>

            <Button onClick={handleCancelRequest}>
              {savingAction ? "Cancelling..." : "Yes, cancel"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">
          This will close {request.ref}. It cannot be undone from your account.
        </p>
      </Modal>
    </>
  )
}

function PaymentInstructions({ method, instructions }) {
  const text = String(instructions ?? "").trim()
  if (!text) return null

  const lines = text.split(/\r?\n/)
  const numberLine = /^\s*((?:GCash(?:\s+mobile)?|mobile|contact|bank\s+account|account)\s+(?:number|no\.?))\s*[:#-]\s*(.+?)\s*$/i
  const nameLine = /^\s*(account\s+holder|account\s+name|registered\s+name|name\s+on\s+account)\s*[:#-]\s*(.+?)\s*$/i

  return (
    <section className="min-w-0 rounded-xl border border-blue/20 bg-blue/5 p-4 sm:p-5" aria-label={`${method} payment details`}>
      <p className="text-xs font-bold uppercase tracking-wider text-blue">{method} payment details</p>
      <div className="mt-3 min-w-0 space-y-3">
        {lines.map((line, index) => {
          const number = line.match(numberLine)
          const name = line.match(nameLine)
          if (!line.trim()) return <div key={index} aria-hidden="true" className="h-1" />
          if (number) {
            return (
              <div key={index} className="min-w-0 rounded-lg border border-blue/15 bg-white px-3 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">{number[1]}</p>
                <p className="mt-1 break-all font-mono text-xl font-bold tracking-wider text-navy sm:text-2xl">{number[2]}</p>
              </div>
            )
          }
          if (name) {
            return (
              <p key={index} className="break-words text-sm leading-6 text-ink [overflow-wrap:anywhere]">
                <span className="font-semibold">{name[1]}: </span>{name[2]}
              </p>
            )
          }
          return <p key={index} className="whitespace-pre-wrap break-words text-base leading-7 text-ink [overflow-wrap:anywhere]">{line}</p>
        })}
      </div>
    </section>
  )
}

function Item({ k, v }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted">
        {k}
      </dt>

      <dd className="mt-1 break-words text-ink [overflow-wrap:anywhere]">
        {v === undefined || v === null || v === "" ? "—" : v}
      </dd>
    </div>
  )
}
