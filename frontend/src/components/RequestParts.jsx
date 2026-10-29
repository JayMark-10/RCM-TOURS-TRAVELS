import {
  Building2,
  FileText,
  Hotel,
  Map,
  Plane,
} from "lucide-react"

import { Link } from "react-router-dom"

import { useServiceName } from "../hooks/useServiceName"
import { SOURCE_LABELS } from "../lib/constants"
import { fmtDate, fmtDateTime, STATUS_TONE } from "../utils/workflow"

import {
  Badge,
  cx,
  Field,
  Input,
  Select,
  Textarea,
} from "./ui"

export function StatusBadge({ status }) {
  return (
    <Badge className={`max-w-full whitespace-normal break-words text-left ${STATUS_TONE[status] ?? ""}`}>
      {status}
    </Badge>
  )
}

export function ServiceIcon({ icon, size = 20 }) {
  const icons = {
    plane: Plane,
    hotel: Hotel,
    map: Map,
    file: FileText,
  }

  const IconComponent = icons[icon] ?? Building2

  return <IconComponent size={size} />
}

export function Timeline({ events }) {
  const timelineEvents = [...events].reverse()

  return (
    <ol className="relative">
      {timelineEvents.map(function (event, index) {
        return (
          <li
            key={event.id}
            className="relative flex gap-4 pb-5 last:pb-0"
          >
            {index < timelineEvents.length - 1 && (
              <span className="absolute left-[7px] top-4 h-full w-px bg-line" />
            )}

            <span
              className={cx(
                "relative mt-1 h-[15px] w-[15px] shrink-0 rounded-full border-2 bg-white",
                index === 0 ? "border-red" : "border-blue/40"
              )}
            />

            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">
                {event.text}
              </p>

              <p className="mt-0.5 text-xs text-muted">
                {event.actor} | {fmtDateTime(event.date)}
              </p>

              {event.status && (
                <div className="mt-1.5">
                  <StatusBadge status={event.status} />
                </div>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

export function RequestCard({ r, to }) {
  const getServiceName = useServiceName()

  return (
    <Link
      to={to}
      className="group block min-w-0 rounded-xl border border-line bg-white p-3.5 shadow-[0_4px_16px_rgba(11,31,58,.035)] transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-blue/30 hover:shadow-[0_10px_26px_rgba(11,31,58,.075)] sm:p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="min-w-0 break-all font-mono text-xs font-semibold text-blue">
          {r.ref}
        </span>

        <StatusBadge status={r.status} />
      </div>

      <p className="mt-2 break-words text-sm font-semibold text-ink [overflow-wrap:anywhere]">
        {getServiceName(r.serviceId)}
      </p>

      <p className="mt-0.5 text-xs text-muted">
        {r.customerName} | {SOURCE_LABELS[r.source] ?? r.source} | {fmtDate(r.submitted)}
      </p>
    </Link>
  )
}

export function SourceTag({ source }) {
  let tone = "bg-slate-100 text-slate-700 ring-slate-200"

  if (source === "Online") {
    tone = "bg-blue/10 text-blue ring-blue/20"
  } else if (source === "Walk-in") {
    tone = "bg-red/10 text-red ring-red/20"
  }

  return (
    <Badge className={tone}>
      {SOURCE_LABELS[source] ?? source}
    </Badge>
  )
}

// ---------------------------------------------------------------------------
// Conditional service fields.
// A field can show only for certain answers to an earlier field (showWhen),
// or take its choices from an earlier answer (dependsOn + optionsByValue).
// These rules mirror the checks the server makes when a request is saved.
// ---------------------------------------------------------------------------

function answerOf(values, key) {
  const value = values?.[key]
  return value === undefined || value === null ? "" : String(value)
}

export function fieldOptions(field, values) {
  if (field.optionsByValue) {
    const answer = answerOf(values, field.dependsOn)

    return Object.prototype.hasOwnProperty.call(field.optionsByValue, answer)
      ? field.optionsByValue[answer]
      : null
  }

  return field.options ?? []
}

export function fieldApplies(field, values) {
  if (field.showWhen) {
    return (field.showWhen.values ?? []).includes(
      answerOf(values, field.showWhen.key)
    )
  }

  if (field.optionsByValue) {
    return Array.isArray(fieldOptions(field, values))
  }

  return true
}

// Keeps only the answers that still apply, so a choice made for one document
// type is never sent along after the customer switches to another.
export function cleanDetails(service, values) {
  const next = {}

  for (const field of service.fields ?? []) {
    if (!fieldApplies(field, next)) {
      continue
    }

    const value = values[field.key]

    if (value === undefined || value === null || value === "") {
      continue
    }

    if (
      field.type === "select" &&
      !(fieldOptions(field, next) ?? []).includes(String(value))
    ) {
      continue
    }

    next[field.key] = value
  }

  return next
}

function todayLocal() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")

  return `${now.getFullYear()}-${month}-${day}`
}

export function ServiceFields({ service, values, onChange }) {
  const visibleFields = service.fields.filter(function (field) {
    return fieldApplies(field, values)
  })

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {visibleFields.map(function (field) {
        return (
          <Field
            key={field.key}
            label={field.label}
            className={field.type === "textarea" ? "sm:col-span-2" : undefined}
          >
            {field.type === "select" ? (
              <Select
                required={field.required !== false}
                value={values[field.key] ?? ""}
                onChange={(event) =>
                  onChange(field.key, event.target.value)
                }
                options={fieldOptions(field, values) ?? []}
                placeholder="Select..."
              />
            ) : field.type === "textarea" ? (
              <Textarea
                required={field.required !== false}
                maxLength={500}
                value={values[field.key] ?? ""}
                onChange={(event) =>
                  onChange(field.key, event.target.value)
                }
              />
            ) : (
              <Input
                required={field.required !== false}
                type={field.type}
                min={
                  field.type === "number"
                    ? 1
                    : field.type === "date"
                      ? todayLocal()
                      : undefined
                }
                maxLength={field.type === "text" ? 500 : undefined}
                placeholder={field.placeholder}
                value={values[field.key] ?? ""}
                onChange={(event) =>
                  onChange(field.key, event.target.value)
                }
              />
            )}
          </Field>
        )
      })}
    </div>
  )
}

export function FileDrop({ files, onAdd, label }) {
  function handleFileChange(event) {
    const selectedFiles = Array.from(
      event.target.files ?? []
    )

    onAdd(selectedFiles)
  }

  return (
    <div>
      <label className="flex cursor-pointer flex-col items-center rounded-2xl border border-dashed border-blue/25 bg-blue/[.035] px-4 py-6 text-center text-sm text-muted transition-[border-color,background-color,color] duration-200 hover:border-blue/50 hover:bg-blue/[.06]">
        <span className="font-medium text-blue">
          {label}
        </span>

        <span className="text-xs">
          JPEG, PNG, WebP, GIF, MP4, and PDF files up to 20 MB each.
        </span>

        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,application/pdf"
          multiple
          className="sr-only"
          onChange={handleFileChange}
        />
      </label>

      {files.length > 0 && (
        <ul className="mt-2 space-y-1">
          {files.map(function (fileName, index) {
            return (
              <li
                key={fileName + index}
                className="flex items-center gap-2 text-sm text-ink"
              >
                <FileText size={14} className="text-muted" />
                {fileName.name ?? fileName}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export function QuotationView({ q }) {
  const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" })
  const total = (q.items ?? []).reduce((sum, item) => sum + Number(item.amount ?? item.unitPrice ?? 0), 0)
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl bg-surface p-4">
        <div><p className="text-xs font-bold uppercase tracking-wider text-muted">Quotation</p>{q.quotationNumber && <p className="mt-1 font-mono text-sm font-bold text-blue">{q.quotationNumber}</p>}</div>
        {q.validUntil && <p className="text-sm text-muted">Valid until <span className="font-semibold text-ink">{fmtDate(q.validUntil)}</span></p>}
      </div>
      {q.serviceDescription && <p className="text-sm leading-6 text-muted">{q.serviceDescription}</p>}
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
        {(q.items ?? []).map(function (item, index) {
          const amount = Number(item.amount ?? item.unitPrice ?? 0)
          const quantity = Number(item.quantity ?? 1)
          return (
            <li
              key={index}
              className="flex items-start justify-between gap-4 px-4 py-4 text-sm sm:px-5"
            >
              <span>
                <span className="font-medium">{item.label}</span>
                {item.description && <span className="block text-xs text-muted">{item.description}</span>}
                {item.quantity !== undefined && item.unitPrice !== undefined && (
                  <span className="mt-1 block text-xs text-muted">
                    {quantity} &times; {money.format(Number(item.unitPrice))}
                  </span>
                )}
              </span>

              <span className="shrink-0 font-semibold tabular-nums text-navy">
                {Number.isFinite(amount)
                  ? money.format(amount)
                  : "-"}
              </span>
            </li>
          )
        })}
      </ul>

      <div className="flex items-center justify-between rounded-2xl bg-navy px-5 py-4 text-white">
        <span className="text-sm font-semibold text-white/75">Quotation total</span>
        <span className="text-xl font-bold tabular-nums">{money.format(total)}</span>
      </div>
      {q.note && <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm leading-6 text-muted">{q.note}</p>}
    </div>
  )
}
