import { useEffect } from "react"
import { createPortal } from "react-dom"
import { Link } from "react-router-dom"
import { X } from "lucide-react"

import { useStore } from "../lib/store"

// Combines CSS class names into one string.
export function cx(...classNames) {
  return classNames.filter(Boolean).join(" ")
}

// Button styles.
const buttonVariants = {
  primary: "bg-red text-white shadow-[0_6px_16px_rgba(217,54,79,.18)] hover:bg-red-dark hover:shadow-[0_9px_22px_rgba(217,54,79,.23)] active:translate-y-px",
  blue: "bg-blue text-white shadow-[0_6px_16px_rgba(31,95,175,.16)] hover:bg-blue-dark hover:shadow-[0_9px_22px_rgba(31,95,175,.22)] active:translate-y-px",
  secondary: "bg-blue text-white shadow-sm hover:bg-blue-dark active:translate-y-px",
  outline:
    "bg-white text-ink border border-line hover:border-slate-300 hover:bg-slate-50",
  ghost: "text-muted hover:bg-slate-100 hover:text-ink",
  danger: "bg-red text-white shadow-sm hover:bg-red-dark active:translate-y-px",
  light: "bg-white text-navy hover:bg-slate-100",
}

const buttonSizes = {
  sm: "min-h-11 px-3.5 py-2.5 text-[13px]",
  md: "min-h-11 px-5 py-2.5 text-sm",
  lg: "min-h-[52px] px-7 py-3 text-[15px]",
}

const baseButtonStyles =
  "inline-flex min-w-0 max-w-full items-center justify-center gap-2 rounded-xl text-center font-semibold leading-5 whitespace-normal break-words transition-all duration-200 ease-[cubic-bezier(.2,.7,.2,1)] hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:pointer-events-none disabled:hover:translate-y-0"

// Regular button.
export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}) {
  return (
    <button
      type="button"
      className={cx(
        baseButtonStyles,
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...props}
    />
  )
}

// Button that navigates to another route.
export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...props
}) {
  return (
    <Link
      className={cx(
        baseButtonStyles,
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...props}
    />
  )
}

// Card container.
export function Card({ className, children }) {
  return (
    <div
      className={cx(
        "rounded-2xl border border-line/80 bg-white shadow-[0_8px_28px_rgba(11,31,58,.045)] transition-[border-color,box-shadow] duration-300 ease-[cubic-bezier(.2,.7,.2,1)]",
        className,
      )}
    >
      {children}
    </div>
  )
}

// Card heading with an optional subtitle and action.
export function CardHeader({ title, action, sub }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line px-4 py-3.5 sm:gap-3 sm:px-5 sm:py-4">
      <div className="min-w-0 flex-1">
        <h3 className="break-words text-[15px] font-semibold text-ink">{title}</h3>

        {sub && (
          <p className="mt-0.5 break-words text-[13px] text-muted [overflow-wrap:anywhere]">
            {sub}
          </p>
        )}
      </div>

      {action}
    </div>
  )
}

// Page heading with an optional subtitle and action.
export function PageHeader({ title, sub, action }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3 sm:mb-7 sm:items-end sm:gap-4">
      <div className="min-w-0 flex-1">
        <h1 className="break-words font-display text-3xl font-normal leading-[1.08] tracking-[-0.025em] text-navy sm:text-4xl">
          {title}
        </h1>

        {sub && (
          <p className="mt-2 max-w-2xl break-words text-sm leading-6 text-muted [overflow-wrap:anywhere]">
            {sub}
          </p>
        )}
      </div>

      {action}
    </div>
  )
}

// Small label used for statuses and categories.
export function Badge({ children, className }) {
  return (
    <span
      className={cx(
        "inline-flex min-w-0 max-w-full items-center whitespace-normal break-words rounded-full px-2.5 py-1 text-[11px] font-semibold leading-4 ring-1 ring-inset [overflow-wrap:anywhere]",
        className,
      )}
    >
      {children}
    </span>
  )
}

// Shared styles for form fields.
const inputStyles =
  "w-full min-w-0 rounded-xl border border-line bg-white px-3.5 text-base text-ink shadow-[0_1px_2px_rgba(11,31,58,.025)] transition-[border-color,box-shadow,background-color] duration-200 placeholder:text-slate-400 hover:border-blue/35 focus:border-blue focus:outline-none focus:ring-4 focus:ring-blue/10 disabled:bg-slate-50 disabled:text-slate-500 sm:text-sm"

// Label, input content, and optional helper text.
export function Field({ label, hint, children, className }) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-2 block break-words text-[13px] font-semibold text-slate-700 [overflow-wrap:anywhere]">
        {label}
      </span>

      {children}

      {hint && (
        <span className="mt-1 block text-xs text-muted">
          {hint}
        </span>
      )}
    </label>
  )
}

// Text input.
export function Input(props) {
  return (
    <input
      {...props}
      className={cx(inputStyles, "h-11", props.className)}
    />
  )
}

// Dropdown selection.
export function Select({ options = [], placeholder, ...props }) {
  return (
    <select
      {...props}
      className={cx(inputStyles, "h-11", props.className)}
    >
      {placeholder && (
        <option value="">
          {placeholder}
        </option>
      )}

      {options.map((option) => {
        const value =
          typeof option === "object" ? option.value : option

        const label =
          typeof option === "object" ? option.label : option

        return (
          <option key={value} value={value}>
            {label}
          </option>
        )
      })}
    </select>
  )
}

// Multi-line text input.
export function Textarea(props) {
  return (
    <textarea
      rows={4}
      {...props}
      className={cx(inputStyles, "min-h-28 py-3 leading-6", props.className)}
    />
  )
}

// Modal dialog.
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}) {
  useEffect(() => {
    if (!open) {
      return
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        onClose()
      }
    }

    window.addEventListener("keydown", handleKeyDown)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [open, onClose])

  if (!open) {
    return null
  }

  return createPortal(
    <div
      className="app-dialog-backdrop fixed inset-0 z-[1000] flex items-end justify-center bg-navy/55 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
        className="app-dialog flex max-h-[90dvh] min-h-0 w-full max-w-lg flex-col rounded-t-3xl border border-white/80 bg-white shadow-[0_28px_90px_rgba(11,31,58,.24)] sm:rounded-3xl"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="min-w-0 flex-1 break-words pr-2 text-base font-semibold text-navy">
            {title}
          </h2>

          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-muted hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto px-4 py-4 sm:px-5">
          {children}
        </div>

        {footer && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-line px-4 py-3 sm:px-5">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

// Tabs for switching between views.
export function Tabs({ tabs, value, onChange }) {
  return (
    <div
      role="tablist"
      className="flex gap-1 overflow-x-auto rounded-t-2xl border-b border-line bg-surface/75 p-2"
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={value === tab.id}
          onClick={() => onChange(tab.id)}
          className={cx(
            "flex items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2.5 text-sm font-medium transition-[background-color,color,box-shadow] duration-200",
            value === tab.id
              ? "bg-white text-blue shadow-[0_2px_8px_rgba(11,31,58,.08)]"
              : "text-muted hover:bg-white/70 hover:text-ink",
          )}
        >
          {tab.label}

          {tab.count !== undefined && (
            <span className="rounded-full bg-slate-100 px-1.5 text-xs text-muted">
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

// Dashboard card showing a statistic.
export function StatCard({
  label,
  value,
  icon,
  tone = "text-blue bg-blue/10",
  sub,
}) {
  return (
    <Card className="p-3.5 sm:p-5">
      <div className="flex items-center justify-between">
        <span className="min-w-0 break-words text-[13px] font-medium text-muted [overflow-wrap:anywhere]">
          {label}
        </span>

        <span
          className={cx(
            "grid h-9 w-9 shrink-0 place-items-center rounded-xl",
            tone,
          )}
        >
          {icon}
        </span>
      </div>

      <div className="mt-2 text-2xl font-bold tracking-tight text-navy sm:mt-3 sm:text-3xl">
        {value}
      </div>

      {sub && (
        <div className="mt-1 text-xs text-muted">
          {sub}
        </div>
      )}
    </Card>
  )
}

// Message displayed when a list has no items.
export function Empty({ title, sub, action }) {
  return (
    <div className="flex flex-col items-center px-4 py-8 text-center sm:px-6 sm:py-12">
      <p className="font-semibold text-ink">
        {title}
      </p>

      {sub && (
        <p className="mt-1 max-w-sm text-sm text-muted">
          {sub}
        </p>
      )}

      {action && (
        <div className="mt-4">
          {action}
        </div>
      )}
    </div>
  )
}

// Notification message from the application store.
export function Toast() {
  const { toast, user } = useStore()

  if (!toast) {
    return null
  }

  return (
    <div
      role="status"
      className={`fixed ${user?.role === "customer" ? "bottom-[calc(env(safe-area-inset-bottom)+5rem)]" : "bottom-5"} left-1/2 z-[60] max-w-[calc(100vw-2rem)] -translate-x-1/2 break-words rounded-lg bg-navy px-4 py-2.5 text-center text-sm font-medium text-white shadow-lg [overflow-wrap:anywhere]`}
    >
      {toast}
    </div>
  )
}

// Toggle switch.
export function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx(
        "relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue/20",
        checked ? "bg-blue" : "bg-slate-300",
      )}
    >
      <span
        className={cx(
          "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all",
          checked ? "left-[22px]" : "left-0.5",
        )}
      />
    </button>
  )
}

// Informational note used in demo workflows.
export function SimNote({ children }) {
  return (
    <p className="rounded-xl border border-blue/15 bg-blue/[.045] px-3.5 py-3 text-xs leading-5 text-muted">
      {children}
    </p>
  )
}
