
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Button, Field, Input, Select } from "../../components/ui"
import { Logo } from "../../layouts/PublicLayout"
import { apiRequest } from "../../services/api"
import { useStore } from "../../lib/store"
import {
  FULL_NAME_ERROR,
  PHILIPPINE_MOBILE_ERROR,
  isValidFullName,
  isValidPhilippineMobile,
} from "../../lib/validation"
import { HERO_IMAGE } from "../../lib/catalog"

function getDestination(role) {
  if (role === "customer") {
    return "/portal"
  }

  if (role === "staff") {
    return "/staff"
  }

  if (role === "admin") {
    return "/admin"
  }

  return "/signin"
}

function AuthFrame({ title, sub, children }) {
  return (
    <div className="app-canvas grid min-h-[calc(100vh-4rem)] lg:grid-cols-[1.05fr_.95fr]">
      <div className="relative isolate hidden overflow-hidden bg-navy p-12 text-white lg:flex lg:flex-col">
        <img src={HERO_IMAGE} alt="" aria-hidden="true" className="absolute inset-0 -z-10 h-full w-full object-cover opacity-30" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-navy/95 via-navy/80 to-blue/65" />
        <Logo dark />

        <div className="mt-24 max-w-md">
          <h2 className="font-display text-5xl font-normal leading-[1.05] tracking-tight">
            One place for every service request.
          </h2>

          <p className="mt-4 text-slate-300">
            Customers, staff, and administrators work from the same
            centralized record, with clear roles and a full activity trail.
          </p>
        </div>

        <p className="mt-auto pt-12 text-xs text-slate-500">
          Secure account access for RCM Tours and Travels.
        </p>
      </div>

      <div className="flex items-center justify-center px-4 py-8 sm:px-8 sm:py-12">
        <div className="w-full max-w-md rounded-2xl border border-white/90 bg-white/90 p-5 shadow-[0_24px_70px_rgba(11,31,58,.1)] backdrop-blur-xl sm:p-8">
          <h1 className="font-display text-4xl font-normal tracking-tight text-navy">{title}</h1>
          <p className="mb-6 mt-2 text-sm leading-6 text-muted">{sub}</p>

          {children}
        </div>
      </div>
    </div>
  )
}

function getErrorMessage(error) {
  if (error.message === "Failed to fetch") {
    return "Cannot connect to the server. Please try again later."
  }

  if (error.message === "This Staff invitation is not valid.") {
    return "We could not verify this invitation. Check that it is active and unused, and register with the email address it was issued to."
  }

  return error.message || "Something went wrong. Please try again."
}

export function SignIn() {
  const navigate = useNavigate()
  const { signIn } = useStore()

  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError("")
    setLoading(true)

    const formData = new FormData(event.currentTarget)

    try {
      const result = await apiRequest("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: formData.get("email"),
          password: formData.get("password"),
        }),
      })

      if (!result.user || !result.user.role) {
        throw new Error("The server returned an invalid account response.")
      }

      // Store the actual user returned by the backend.
      signIn(result.user)

      // Redirect using the role provided by the backend.
      navigate(getDestination(result.user.role), {
        replace: true,
      })
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthFrame
      title="Sign in"
      sub="Access your requests and notifications."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Email">
          <Input
            name="email"
            type="email"
            autoComplete="email"
            required
          />
        </Field>

        <Field label="Password">
          <Input
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </Field>

        {error && (
          <p role="alert" className="text-sm text-red">
            {error}
          </p>
        )}

        <Button
          type="submit"
          className="w-full"
          disabled={loading}
        >
          {loading ? "Signing in..." : "Sign in"}
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-muted">
        New here?{" "}
        <button
          type="button"
          className="font-semibold text-blue"
          onClick={() => navigate("/register")}
        >
          Create an account
        </button>
      </p>
    </AuthFrame>
  )
}

export function Register() {
  const navigate = useNavigate()
  const { signIn } = useStore()

  const [accountType, setAccountType] = useState("customer")
  const [error, setError] = useState("")
  const [phoneInvalid, setPhoneInvalid] = useState(false)
  const [loading, setLoading] = useState(false)
  const [activationRequested, setActivationRequested] = useState(false)

  async function handleRegister(event) {
    event.preventDefault()
    setError("")
    setPhoneInvalid(false)

    const formData = new FormData(event.currentTarget)
    const password = formData.get("password")
    const confirmPassword = formData.get("confirm")
    const invitationCode = String(formData.get("key") ?? "").trim()
    const activationCode = String(formData.get("activationToken") ?? "").trim()
    const name = String(formData.get("name") ?? "")
    const phone = String(formData.get("phone") ?? "")

    if (accountType !== "claim" && !isValidFullName(name)) {
      setError(FULL_NAME_ERROR)
      return
    }

    if (accountType === "customer" && !isValidPhilippineMobile(phone)) {
      setError(PHILIPPINE_MOBILE_ERROR)
      setPhoneInvalid(true)
      return
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.")
      return
    }

    if (password.length < 10) {
      setError("Password must be at least 10 characters.")
      return
    }

    if (formData.get("consent") !== "accepted") {
      setError("Please accept the privacy notice to continue.")
      return
    }

    if (accountType === "staff" && !invitationCode) {
      setError("Enter the invitation code provided by your administrator.")
      return
    }

    if (accountType === "claim" && !activationCode) {
      setError("Enter the activation code provided by RCM staff.")
      return
    }

    setLoading(true)

    try {
      const result = await apiRequest("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: formData.get("email"),
          password,
          consent: true,
          ...(accountType !== "claim"
            ? {
                name: name.trim(),
                phone,
              }
            : { activationToken: activationCode }),
          ...(accountType === "staff" ? { key: invitationCode } : {}),
        }),
      })

      if (!result.user || !result.user.role) {
        throw new Error("The server returned an invalid account response.")
      }

      // Use the user returned by the backend, never a client-selected role.
      signIn(result.user)

      navigate(getDestination(result.user.role), {
        replace: true,
      })
    } catch (requestError) {
      const message = getErrorMessage(requestError)
      setError(message)
      setPhoneInvalid(message === PHILIPPINE_MOBILE_ERROR)
    } finally {
      setLoading(false)
    }
  }

  async function requestActivationCode() {
    setError("")
    const email = new FormData(document.querySelector("form")).get("email")
    if (!email) {
      setError("Enter the email address recorded on your walk-in request.")
      return
    }
    setLoading(true)
    try {
      const result = await apiRequest("/api/auth/activation-code", {
        method: "POST",
        body: JSON.stringify({ email }),
      })
      setActivationRequested(true)
      setError(result.message || "If eligible, a code will arrive shortly.")
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthFrame
      title="Create your account"
      sub="Register to submit and track service requests."
    >
      <form className="space-y-4" onSubmit={handleRegister}>
        <Field label="Account type">
          <Select
            value={accountType}
            onChange={(event) => {
              setAccountType(event.target.value)
              setError("")
            }}
            options={[
              { value: "customer", label: "Customer" },
              { value: "claim", label: "Activate a walk-in account" },
              { value: "staff", label: "Staff (invitation required)" },
            ]}
          />
        </Field>

        {accountType === "claim" && activationRequested && (
          <Field label="Activation code" hint="The code expires after 10 minutes.">
            <Input
              name="activationToken"
              type="text"
              autoComplete="off"
              maxLength={100}
              required
            />
          </Field>
        )}

        {accountType === "staff" && (
          <Field
            label="Invitation Code"
            hint="Enter the single-use code issued by your RCM administrator and use the exact email address the invitation was issued to."
          >
            <Input
              name="key"
              type="text"
              autoComplete="off"
              maxLength={100}
              required
            />
          </Field>
        )}

        {accountType !== "claim" && (
          <Field label="Full name">
            <Input
              name="name"
              autoComplete="name"
              maxLength={120}
              title={FULL_NAME_ERROR}
              required
            />
          </Field>
        )}

        <div className={`grid gap-4 ${accountType === "claim" ? "" : "sm:grid-cols-2"}`}>
          <Field label="Email">
            <Input
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </Field>

          {accountType !== "claim" && (
            <Field label="Mobile number">
              <Input
                name="phone"
                type="tel"
                autoComplete="tel"
                inputMode={accountType === "customer" ? "numeric" : undefined}
                aria-invalid={accountType === "customer" && phoneInvalid}
                title={accountType === "customer" ? PHILIPPINE_MOBILE_ERROR : undefined}
                onChange={(event) => {
                  if (phoneInvalid) {
                    setPhoneInvalid(
                      accountType === "customer" &&
                        !isValidPhilippineMobile(event.target.value)
                    )
                  }
                }}
              />
            </Field>
          )}
        </div>

        <Field label="Password">
          <Input
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={10}
            maxLength={72}
            required
          />
        </Field>

        <Field label="Confirm password">
          <Input
            name="confirm"
            type="password"
            autoComplete="new-password"
            minLength={10}
            maxLength={72}
            required
          />
        </Field>

        <label className="flex items-start gap-2 text-sm text-muted">
          <input
            name="consent"
            type="checkbox"
            value="accepted"
            required
            className="mt-1"
          />

          <span>
            I have read and agree to the privacy notice and consent to the
            processing of my personal information for service requests.
          </span>
        </label>

        {error && (
          <p role="alert" className="text-sm text-red">
            {error}
          </p>
        )}

        {accountType === "claim" && !activationRequested ? (
          <Button type="button" className="w-full" disabled={loading} onClick={requestActivationCode}>
            {loading ? "Requesting code..." : "Email me an activation code"}
          </Button>
        ) : <Button
          type="submit"
          className="w-full"
          disabled={loading}
        >
          {loading
            ? accountType === "claim"
              ? "Activating account..."
              : "Creating account..."
            : accountType === "claim"
              ? "Activate account"
              : "Create account"}
        </Button>}

        <p className="text-center text-sm text-muted">
          Already registered?{" "}
          <button
            type="button"
            className="font-semibold text-blue"
            onClick={() => navigate("/signin")}
          >
            Sign in
          </button>
        </p>
      </form>
    </AuthFrame>
  )
}
