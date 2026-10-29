import { Bell } from "lucide-react"
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { RequestForm } from "../../components/RequestForm"
import {
  Button,
  Card,
  Empty,
  Field,
  Input,
  PageHeader,
} from "../../components/ui"
import { useStore } from "../../lib/store"
import { REQUEST_IMAGE } from "../../lib/catalog"
import { fmtDateTime } from "../../utils/workflow"
import {
  FULL_NAME_ERROR,
  PHILIPPINE_MOBILE_ERROR,
  isValidFullName,
  isValidPhilippineMobile,
} from "../../lib/validation"
export function NewRequest() {
  return (
    <>
      <section className="relative isolate -mx-4 -mt-8 mb-6 overflow-hidden rounded-b-3xl bg-navy bg-cover bg-center px-4 py-10 text-white shadow-[0_18px_42px_rgba(11,31,58,.15)] sm:-mx-6 sm:mb-8 sm:px-8 sm:py-16" style={{ backgroundImage: `linear-gradient(105deg, rgba(11,31,58,.94), rgba(11,31,58,.76) 58%, rgba(31,95,175,.45)), url('${REQUEST_IMAGE}')` }}>
        <div className="mx-auto max-w-6xl">
          <p className="text-[11px] font-bold uppercase tracking-[.18em] text-[#ffb1ba]">Start a request</p>
          <h1 className="mt-2 font-display text-4xl font-normal tracking-tight sm:text-5xl">Request a Service</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200 sm:text-base">Choose a service and tell us what you need. The form adapts to your plans; submitting a request is not a booking.</p>
        </div>
      </section>
      <div className="mx-auto max-w-4xl"><RequestForm mode="customer" /></div>
    </>
  )
}
export function Notifications() {
  const { user, notifications, markRead } = useStore()
  const nav = useNavigate()
  const mine = notifications.filter((n) => n.userId === user.id)

  async function openNotification(notification) {
    await markRead(notification.id)
    nav(`/portal/requests/${notification.requestId}`)
  }

  return (
    <>
      <PageHeader
        title="Notifications"
        action={
          <Button variant="outline" onClick={() => markRead()}>
            Mark all as read
          </Button>
        }
      />
      <Card>
        {mine.length === 0 ? (
          <Empty title="No notifications" />
        ) : (
          <ul className="divide-y divide-line">
            {mine.map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => {
                    openNotification(n)
                  }}
                  className="flex w-full items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-blue/[.035]"
                >
                  <span
                    className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ${
                      n.read ? "bg-slate-100 text-muted" : "bg-red/10 text-red"
                    }`}
                  >
                    <Bell size={15} />
                  </span>
                  <span className="flex-1">
                    <span
                      className={`block text-sm ${
                        n.read ? "text-muted" : "font-semibold text-ink"
                      }`}
                    >
                      {n.text}
                    </span>
                    <span className="text-xs text-muted">
                      {fmtDateTime(n.date)}
                    </span>
                  </span>
                  {!n.read && (
                    <span
                      className="mt-2 h-2 w-2 rounded-full bg-red"
                      aria-label="Unread"
                    />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}
export function Profile() {
  const { user, updateProfile, notify } = useStore()
  const [name, setName] = useState(user.name ?? "")
  const [email, setEmail] = useState(user.email ?? "")
  const [phone, setPhone] = useState(user.phone ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit(event) {
    event.preventDefault()
    setError("")
    if (!isValidFullName(name)) {
      setError(FULL_NAME_ERROR)
      return
    }
    if (!isValidPhilippineMobile(phone)) {
      setError(PHILIPPINE_MOBILE_ERROR)
      return
    }
    setSaving(true)
    try {
      await updateProfile({ name: name.trim(), email, phone })
      notify("Profile saved.")
    } catch (saveError) {
      setError(saveError.message || "Unable to save profile changes.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Profile"
        sub="Keep your contact details current so staff can reach you."
      />
      <Card className="max-w-2xl p-4 sm:p-6">
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={handleSubmit}
        >
          <Field label="Full name">
            <Input required maxLength={120} title={FULL_NAME_ERROR} value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label="Email">
            <Input required type="email" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} />
          </Field>
          <Field label="Mobile number">
            <Input type="tel" inputMode="numeric" title={PHILIPPINE_MOBILE_ERROR} value={phone} onChange={(event) => setPhone(event.target.value)} />
          </Field>
          {error && <p className="sm:col-span-2 text-sm text-red-700" role="alert">{error}</p>}
          <div className="sm:col-span-2">
            <Button type="submit" variant="blue" disabled={saving}>
              {saving ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </form>
      </Card>
    </>
  )
}
