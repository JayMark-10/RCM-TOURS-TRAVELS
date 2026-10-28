import { ArrowLeft, Lock, Plus, Trash2 } from "lucide-react"
import { useState } from "react"
import { Link, useParams, useSearchParams } from "react-router-dom"

import { useStore } from "../lib/store"
import { fmtDate, fmtDateTime, NEXT_STATUSES } from "../utils/workflow"
import { useServiceName } from "../hooks/useServiceName"
import RequestDocuments from "./RequestDocuments"

import {
  QuotationView,
  SourceTag,
  StatusBadge,
  Timeline,
} from "./RequestParts"

import {
  Button,
  Card,
  CardHeader,
  Empty,
  Field,
  Input,
  Modal,
  Select,
  SimNote,
  Tabs,
  Textarea,
} from "./ui"

export function RequestWorkspace({ backTo }) {
  const { id } = useParams()
  const [searchParams] = useSearchParams()

  const {
    requests,
    services,
    users,
    user,
    updateStatus,
    assign,
    staffMessage,
    addNote,
    toggleChecklist,
    saveQuotation,
    sendQuotation,
    notify,
  } = useStore()

  const getServiceName = useServiceName()

  const request = requests.find(function (item) {
    return item.id === id
  })

  const [tab, setTab] = useState(searchParams.get("tab") === "quotation" ? "quotation" : "overview")
  const [nextStatus, setNextStatus] = useState("")
  const [modal, setModal] = useState(null)
  const [statusNote, setStatusNote] = useState("")
  const [confirmationRecord, setConfirmationRecord] = useState("")
  const [infoText, setInfoText] = useState("")
  const [message, setMessage] = useState("")
  const [note, setNote] = useState("")
  const [actionError, setActionError] = useState("")
  const [savingAction, setSavingAction] = useState(false)

  if (!request) {
    return (
      <Card>
        <Empty
          title="Request not found"
          action={
            <Link
              to={backTo}
              className="font-semibold text-blue"
            >
              Back to requests
            </Link>
          }
        />
      </Card>
    )
  }

  const service = services.find(function (item) {
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
              to={backTo}
              className="font-semibold text-blue"
            >
              Back to requests
            </Link>
          }
        />
      </Card>
    )
  }

  const activeStaff = users.filter(function (staffMember) {
    return (
      staffMember.role === "staff" &&
      staffMember.active
    )
  })

  const canAssign =
    user?.role === "admin" || !!user?.canAssign

  const availableStatuses =
    NEXT_STATUSES[request.status] ?? []

  const needsConfirmationRecord =
    nextStatus === "Confirmed" ||
    nextStatus === "Completed"

  const isClosed = availableStatuses.length === 0

  const tabs = [
    {
      id: "overview",
      label: "Overview",
    },
    {
      id: "messages",
      label: "Customer messages",
      count: request.messages.length,
    },
    {
      id: "notes",
      label: "Internal notes",
      count: request.notes.length,
    },
    ...(service.usesQuotation || request.quotation
      ? [
          {
            id: "quotation",
            label: "Quotation",
          },
        ]
      : []),
    {
      id: "activity",
      label: "Activity",
    },
  ]

  async function runAction(action, successText, onSuccess) {
    setActionError("")
    setSavingAction(true)
    try {
      const result = await action()
      onSuccess?.(result)
      if (successText) notify(successText)
      return result
    } catch (error) {
      setActionError(error.message || "Unable to save this change.")
      return null
    } finally {
      setSavingAction(false)
    }
  }

  function handleMessageSubmit(event) {
    event.preventDefault()
    return runAction(() => staffMessage(request.id, message), "Message saved.", () => setMessage(""))
  }

  function handleNoteSubmit(event) {
    event.preventDefault()
    return runAction(() => addNote(request.id, note), "Internal note saved.", () => setNote(""))
  }

  function handleAssignmentChange(staffId) {
    return runAction(() => assign(request.id, staffId || null), "Assignment updated.")
  }

  function handleQuotationSave(quotation) {
    return runAction(() => saveQuotation(request.id, quotation), "Quotation draft saved.")
  }

  function handleQuotationSend() {
    return runAction(() => sendQuotation(request.id), "Quotation sent.")
  }

  function handleStatusUpdate() {
    return runAction(
      () => updateStatus(
        request.id,
        nextStatus,
        statusNote || undefined,
        needsConfirmationRecord ? confirmationRecord : undefined,
      ),
      `Status updated to ${nextStatus}.`,
      () => {
        setModal(null)
        setNextStatus("")
        setStatusNote("")
        setConfirmationRecord("")
      },
    )
  }

  function handleInformationRequest() {
    return runAction(
      () => staffMessage(request.id, infoText, "Awaiting Information"),
      "Information request saved.",
      () => {
        setModal(null)
        setInfoText("")
      },
    )
  }

  function handleChecklistToggle(index) {
    return runAction(() => toggleChecklist(request.id, index))
  }

  return (
    <>
      <Link
        to={backTo}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
      >
        <ArrowLeft size={15} />
        Requests
      </Link>

      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 sm:mb-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold text-blue">
              {request.ref}
            </span>

            <SourceTag source={request.source} />
          </div>

          <h1 className="mt-1 break-words font-display text-3xl font-normal leading-tight text-navy sm:text-4xl">
            {getServiceName(request.serviceId)}
          </h1>

          <p className="break-words text-sm text-muted">
            {request.customerName} | submitted {fmtDate(request.submitted)}
          </p>
        </div>

        <StatusBadge status={request.status} />
      </div>

      {actionError && (
        <div role="alert" className="mb-5 rounded-lg bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">
          {actionError}
        </div>
      )}

      <div className="grid w-full min-w-0 grid-cols-1 gap-4 xl:grid-cols-[1.6fr_1fr] xl:gap-6">
        <Card className="w-full min-w-0">
          <Tabs
            tabs={tabs}
            value={tab}
            onChange={setTab}
          />

          <div className="p-3.5 sm:p-5">
            {tab === "overview" && (
              <div className="space-y-6">
                <dl className="grid gap-4 text-sm sm:grid-cols-2">
                  {(service.fields ?? []).filter((field) => {
                    const value = request.details?.[field.key]
                    return value !== undefined && value !== null && value !== ""
                  }).map(function (field) {
                    return (
                      <Row
                        key={field.key}
                        k={field.label}
                        v={request.details[field.key]}
                      />
                    )
                  })}

                  {request.dateFrom && (
                    <Row
                      k={service.datesLabel ?? "Dates"}
                      v={`${fmtDate(request.dateFrom)} - ${fmtDate(request.dateTo)}`}
                    />
                  )}

                  {request.description && <div className="sm:col-span-2">
                    <Row
                      k="Customer description"
                      v={request.description}
                    />
                  </div>}

                  {request.confirmationRecord && (
                    <div className="sm:col-span-2">
                      <Row
                        k="Verified confirmation record"
                        v={request.confirmationRecord}
                      />
                    </div>
                  )}
                </dl>

                <div>
                  <RequestDocuments key={(request.documents ?? []).length} requestId={request.id} allowUpload />

                  {(request.checklist ?? []).length === 0 ? (
                    <p className="text-sm text-muted">
                      No document checklist for this service.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {(request.checklist ?? []).map(
                        function (document, index) {
                          return (
                            <li key={document.label}>
                              <label className="flex items-center gap-3 text-sm">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 accent-blue"
                                  checked={document.received}
                                  disabled={savingAction}
                                  onChange={() => handleChecklistToggle(index)}
                                />

                                {document.label}
                              </label>
                            </li>
                          )
                        }
                      )}
                    </ul>
                  )}

                </div>
              </div>
            )}

            {tab === "messages" && (
              <div className="space-y-3">
                <SimNote>
                  Messages here are visible to the customer. Use Internal notes
                  for staff-only comments.
                </SimNote>

                {request.messages.map(function (item) {
                  return (
                    <div
                      key={item.id}
                      className={`max-w-[85%] rounded-xl px-4 py-3 text-sm ${
                        item.from === "staff"
                          ? "ml-auto bg-blue/10"
                          : "bg-slate-100"
                      }`}
                    >
                      <p className="text-xs font-semibold text-muted">
                        {item.author} | {fmtDateTime(item.createdAt ?? item.date)}
                      </p>

                      <p className="mt-1">
                        {item.text}
                      </p>
                    </div>
                  )
                })}

                <form
                  className="space-y-2 border-t border-line pt-4"
                  onSubmit={handleMessageSubmit}
                >
                  <Textarea
                    rows={3}
                    required
                    value={message}
                    onChange={(event) =>
                      setMessage(event.target.value)
                    }
                    placeholder="Write a message the customer will see..."
                  />

                  <Button type="submit" variant="blue" disabled={savingAction || !message.trim()}>
                    {savingAction ? "Sending..." : "Send to customer"}
                  </Button>
                </form>
              </div>
            )}

            {tab === "notes" && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 ring-1 ring-amber-200">
                  <Lock size={14} />
                  Internal only. Never shown to the customer.
                </div>

                <form
                  className="space-y-2"
                  onSubmit={handleNoteSubmit}
                >
                  <Textarea
                    rows={3}
                    required
                    value={note}
                    onChange={(event) =>
                      setNote(event.target.value)
                    }
                    placeholder="Add an internal note..."
                  />

                  <Button type="submit" variant="outline" disabled={savingAction || !note.trim()}>
                    {savingAction ? "Saving..." : "Add note"}
                  </Button>
                </form>

                {request.notes.map(function (item) {
                  return (
                    <div
                      key={item.id}
                      className="rounded-xl border border-amber-200/80 bg-amber-50/70 p-3.5 text-sm shadow-[0_3px_12px_rgba(120,53,15,.04)]"
                    >
                      <p className="text-xs font-semibold text-muted">
                        {item.author} | {fmtDateTime(item.createdAt ?? item.date)}
                      </p>

                      <p className="mt-1">
                        {item.text}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}

            {tab === "quotation" && (
              <div className="space-y-6">
                <QuotationEditor
                  key={`${request.id}-${request.quotation?.state ?? "Draft"}`}
                  request={request}
                  onSave={handleQuotationSave}
                  onSend={handleQuotationSend}
                />
                {request.quotation?.state === "Accepted" && (
                  <Card className="p-4">
                    <h3 className="font-semibold text-navy">Payment actions</h3>
                    <p className="mt-1 text-sm text-muted">Review submitted payments or record cash received in Payment Management. Quotation actions never verify or record payments.</p>
                    <Link className="mt-3 inline-flex min-h-11 items-center font-semibold text-blue hover:underline" to={user?.role === "admin" ? "/admin/payments" : "/staff/payments"}>
                      Open Payment Management →
                    </Link>
                  </Card>
                )}
              </div>
            )}

            {tab === "activity" && (
              <Timeline events={request.timeline} />
            )}
          </div>
        </Card>

        <div className="w-full min-w-0 space-y-4 xl:space-y-6">
          <Card>
            <CardHeader title="Actions" />

            <div className="space-y-4 p-5">
              {isClosed ? (
                <p className="text-sm text-muted">
                  This request is closed. No further status changes are
                  available.
                </p>
              ) : (
                <>
                  <Field label="Update status">
                    <Select
                      disabled={savingAction}
                      value={nextStatus}
                      onChange={(event) =>
                        setNextStatus(event.target.value)
                      }
                      options={availableStatuses}
                      placeholder="Choose next status..."
                    />
                  </Field>

                  <Button
                    className="w-full"
                    variant="blue"
                    disabled={!nextStatus || savingAction}
                    onClick={() => setModal("status")}
                  >
                    Update status
                  </Button>

                  {["Under Review", "Processing"].includes(
                    request.status
                  ) && (
                    <Button
                      className="w-full"
                      variant="outline"
                      onClick={() => setModal("info")}
                    >
                      Request missing information
                    </Button>
                  )}
                </>
              )}

              <p className="text-xs text-muted">
                Confirmed and Completed require a verified record. A submission
                alone is never treated as a confirmed booking.
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader title="Assignment" />

            <div className="space-y-2 p-5">
              {canAssign ? (
                <Select
                  disabled={savingAction}
                  aria-label="Assign to"
                  value={request.assignedTo ?? ""}
                  onChange={(event) =>
                    handleAssignmentChange(event.target.value)
                  }
                  options={activeStaff.map(function (staffMember) {
                    return {
                      value: staffMember.id,
                      label: staffMember.name,
                    }
                  })}
                  placeholder="Unassigned"
                />
              ) : (
                <p className="text-sm">
                  {users.find(function (item) {
                    return item.id === request.assignedTo
                  })?.name ?? "Unassigned"}
                </p>
              )}

              {!canAssign && (
                <p className="text-xs text-muted">
                  You are not authorized to reassign requests.
                </p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Customer" />

            <div className="p-5 text-sm">
              <p className="font-medium">
                {request.customerName}
              </p>

              <p className="text-muted">
                {request.customerEmail}
              </p>

            </div>
          </Card>
        </div>
      </div>

      <Modal
        open={modal === "status"}
        onClose={() => setModal(null)}
        title={`Move to "${nextStatus}"`}
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setModal(null)}
            >
              Cancel
            </Button>

            <Button
              disabled={savingAction || (needsConfirmationRecord && !confirmationRecord.trim())}
              onClick={handleStatusUpdate}
            >
              {savingAction ? "Saving..." : "Confirm"}
            </Button>
          </>
        }
      >
        <div className="w-full min-w-0 space-y-4">
          {needsConfirmationRecord && (
            <Field
              label="Verified confirmation record"
              hint="Record what was verified, e.g. supplier confirmation reference. Required."
            >
              <Textarea
                rows={3}
                value={confirmationRecord}
                onChange={(event) =>
                  setConfirmationRecord(event.target.value)
                }
              />
            </Field>
          )}

          <Field label="Timeline note (optional)">
            <Input
              value={statusNote}
              onChange={(event) =>
                setStatusNote(event.target.value)
              }
              placeholder="Shown in the activity timeline"
            />
          </Field>

          <p className="text-xs text-muted">
            The status will appear in the customer portal. Email notifications are not configured.
          </p>
        </div>
      </Modal>

      <Modal
        open={modal === "info"}
        onClose={() => setModal(null)}
        title="Request missing information"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setModal(null)}
            >
              Cancel
            </Button>

            <Button
              disabled={!infoText.trim() || savingAction}
              onClick={handleInformationRequest}
            >
              {savingAction ? "Sending..." : "Send request"}
            </Button>
          </>
        }
      >
        <Field label="What do you need from the customer?">
          <Textarea
            rows={4}
            value={infoText}
            onChange={(event) =>
              setInfoText(event.target.value)
            }
          />
        </Field>

        <p className="mt-3 text-xs text-muted">
          Sets the status to Awaiting Information and sends this as a
          customer-visible message.
        </p>
      </Modal>
    </>
  )
}

function Row({ k, v }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted">
        {k}
      </dt>

      <dd className="mt-1 break-words [overflow-wrap:anywhere]">
        {v === undefined || v === null || v === "" ? "-" : v}
      </dd>
    </div>
  )
}

function QuotationEditor({ request, onSave, onSend }) {
  const [saving, setSaving] = useState(false)
  const [quotation, setQuotation] = useState(
    () => {
      const saved = request.quotation
      if (!saved) {
        return {
          items: [{ label: "", description: "", quantity: 1, unitPrice: "" }],
          validUntil: "",
          note: "",
          state: "Draft",
        }
      }

      return {
        ...saved,
        items: (saved.items ?? []).map((item) => ({
          ...item,
          description: item.description ?? "",
          quantity: item.quantity ?? 1,
          unitPrice: item.unitPrice ?? item.amount ?? "",
        })),
      }
    },
  )

  const isLocked = quotation.state !== "Draft"

  if (isLocked) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-semibold">
            Quotation status:
          </span>

          {quotation.state}
        </div>

        <QuotationView q={quotation} />
      </div>
    )
  }

  function handleItemChange(index, field, value) {
    const updatedItems = quotation.items.map(
      function (item, itemIndex) {
        if (itemIndex === index) {
          return {
            ...item,
            [field]: value,
          }
        }

        return item
      }
    )

    setQuotation({
      ...quotation,
      items: updatedItems,
    })
  }

  function handleAddItem() {
    setQuotation({
      ...quotation,
      items: [
        ...quotation.items,
        {
          label: "",
          description: "",
          quantity: 1,
          unitPrice: "",
        },
      ],
    })
  }

  function handleRemoveItem(index) {
    const updatedItems = quotation.items.filter(
      function (item, itemIndex) {
        return itemIndex !== index
      }
    )

    setQuotation({
      ...quotation,
      items: updatedItems,
    })
  }

  async function handleSave() {
    setSaving(true)
    try {
      return await onSave(quotation)
    } finally {
      setSaving(false)
    }
  }

  async function handleSend() {
    setSaving(true)
    try {
      const saved = await onSave(quotation)
      if (!saved) return
      await onSend()
    } finally {
      setSaving(false)
    }
  }

  const isReady = quotation.items.length > 0 && quotation.items.every(function (item) {
    const quantity = Number(item.quantity)
    const unitPrice = Number(item.unitPrice)
    return item.label.trim() && Number.isInteger(quantity) && quantity > 0 && item.unitPrice !== "" && Number.isFinite(unitPrice) && unitPrice >= 0
  }) && quotation.validUntil && !saving
  const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" })
  const grandTotal = quotation.items.reduce((sum, item) => {
    const amount = Number(item.quantity) * Number(item.unitPrice)
    return sum + (Number.isFinite(amount) ? Math.round((amount + Number.EPSILON) * 100) / 100 : 0)
  }, 0)

  return (
    <div className="space-y-6">
      <SimNote>
        Enter amounts supplied or verified by suppliers. The system does not set
        prices. Payment is handled outside the system.
      </SimNote>

      <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
          <div><h3 className="font-semibold text-navy">Quotation items</h3><p className="mt-1 text-xs text-muted">Set a service name, quantity, and verified unit price for each line.</p></div>
          <span className="rounded-full bg-blue/10 px-3 py-1 text-xs font-bold text-blue">{quotation.items.length} line{quotation.items.length === 1 ? "" : "s"}</span>
        </div>
        <div className="max-h-[min(58vh,620px)] space-y-3 overflow-y-auto p-4 sm:p-5">
      {quotation.items.map(function (item, index) {
        const quantity = Number(item.quantity)
        const unitPrice = Number(item.unitPrice)
        const lineTotal = Number.isFinite(quantity * unitPrice)
          ? Math.round((quantity * unitPrice + Number.EPSILON) * 100) / 100
          : 0
        return (
          <div key={index} className="grid grid-cols-2 items-end gap-3 rounded-xl border border-line/80 bg-white p-3 sm:p-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.5fr)_5rem_8.5rem_minmax(8rem,auto)] md:gap-3">
            <Field label="Item / service" className="col-span-2 md:col-span-1"><Input
              aria-label={`Item ${index + 1}`}
              placeholder="e.g. Round-trip airfare"
              value={item.label}
              onChange={(event) => handleItemChange(index, "label", event.target.value)}
            /></Field>
            <Field label="Description" className="col-span-2 md:col-span-1"><Input
              aria-label={`Description ${index + 1}`}
              placeholder="Details for the customer (optional)"
              value={item.description}
              onChange={(event) => handleItemChange(index, "description", event.target.value)}
            /></Field>
            <Field label="Qty"><Input
              aria-label={`Quantity ${index + 1}`}
              type="number"
              min={1}
              step={1}
              value={item.quantity}
              onChange={(event) => handleItemChange(index, "quantity", event.target.value)}
            /></Field>
            <Field label="Unit price (PHP)"><Input
              aria-label={`Unit price ${index + 1}`}
              type="number"
              min={0}
              step="0.01"
              value={item.unitPrice}
              onChange={(event) => handleItemChange(index, "unitPrice", event.target.value)}
            /></Field>
            <div className="flex min-h-11 items-center justify-between gap-2 rounded-xl bg-surface px-3 md:justify-end">
              <span className="text-xs text-muted md:hidden">Line total</span>
              <span className="text-sm font-bold tabular-nums text-navy" aria-label={`Line total ${index + 1}`}>
                {money.format(lineTotal)}
              </span>
              <button
                type="button"
                aria-label={`Remove item ${index + 1}`}
                className="grid h-10 w-10 place-items-center rounded-xl text-muted transition hover:bg-red/10 hover:text-red focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red"
                onClick={() => handleRemoveItem(index)}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        )
      })}

        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line bg-surface/70 px-5 py-4 sm:px-6">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleAddItem}
      >
        <Plus size={14} />
        Add line item
      </Button>
          <div className="text-right"><p className="text-xs font-semibold uppercase tracking-wider text-muted">Quotation total</p><p className="mt-1 text-2xl font-bold tabular-nums text-navy">{money.format(grandTotal)}</p></div>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-white p-5 shadow-sm sm:p-6">
      <h3 className="mb-4 font-semibold text-navy">Customer details</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Valid until">
          <Input
            type="date"
            min={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)}
            value={quotation.validUntil}
            onChange={(event) =>
              setQuotation({
                ...quotation,
                validUntil: event.target.value,
              })
            }
          />
        </Field>

        <Field label="Note to customer">
          <Input
            value={quotation.note}
            onChange={(event) =>
              setQuotation({
                ...quotation,
                note: event.target.value,
              })
            }
          />
        </Field>
      </div>

      <div className="mt-5 flex flex-wrap justify-end gap-3 border-t border-line pt-5">
        <Button
          type="button"
          variant="outline"
          disabled={saving}
          onClick={handleSave}
        >
          {saving ? "Saving..." : "Save draft"}
        </Button>

        <Button
          type="button"
          disabled={!isReady}
          onClick={handleSend}
        >
          Send to customer
        </Button>
      </div>
      </section>
    </div>
  )
}
