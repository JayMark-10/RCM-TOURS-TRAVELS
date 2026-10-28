import { CheckCircle2 } from "lucide-react"
import { useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"

import { useStore } from "../lib/store"

import {
  cleanDetails,
  FileDrop,
  ServiceFields,
  ServiceIcon,
} from "./RequestParts"

import {
  Button,
  ButtonLink,
  Card,
  cx,
  Field,
  Input,
  Select,
  SimNote,
  Textarea,
} from "./ui"

export function RequestForm({ mode }) {
  const {
    services,
    servicesLoading,
    servicesError,
    refreshServices,
    users,
    usersLoading,
    usersError,
    refreshUserDirectory,
    user,
    submitRequest,
    updateProfile,
    notify,
  } = useStore()

  const [params] = useSearchParams()
  const navigate = useNavigate()

  const activeServices = services.filter(function (service) {
    return service.active
  })

  const [serviceId, setServiceId] = useState(
    params.get("service") ?? ""
  )

  const service = activeServices.find(function (item) {
    return item.id === serviceId
  })

  // Services with their own "Additional details" field do not also show the
  // general description box. The description is filled from those details.
  const hasOwnNotes = Boolean(
    service && service.fields.some((field) => field.key === "additionalDetails")
  )

  const [details, setDetails] = useState({})
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [description, setDescription] = useState("")
  const [files, setFiles] = useState([])
  const [checks, setChecks] = useState({})
  const [note, setNote] = useState("")

  const [source, setSource] = useState(
    mode === "offline" ? "Walk-in" : "Online"
  )

  const [done, setDone] = useState(null)

  // Submission state.
  // The ref blocks a second click immediately, because state updates
  // are not instant and a fast double-click could slip through.
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState("")
  const submittingRef = useRef(false)

  // Find existing customers for offline requests.
  const customers = users.filter(function (customer) {
    return customer.role === "customer" && customer.active
  })

  const [lookup, setLookup] = useState("")
  const [picked, setPicked] = useState("")

  const [newCust, setNewCust] = useState({
    name: "",
    email: "",
    phone: "",
  })

  const [creating, setCreating] = useState(false)

  const searchTerm = lookup.trim().toLowerCase()
  const matches = searchTerm.length >= 2
    ? customers.filter(function (customer) {
        return [customer.name, customer.email, customer.phone].some((value) =>
          String(value ?? "").toLowerCase().includes(searchTerm),
        )
      })
    : []

  const [cName, setCName] = useState(user?.name ?? "")
  const [cEmail, setCEmail] = useState(user?.email ?? "")
  const [cPhone, setCPhone] = useState(user?.phone ?? "")

  if (done) {
    return (
      <Card className="mx-auto max-w-xl p-8 text-center">
        <CheckCircle2
          className="mx-auto text-emerald-600"
          size={44}
        />

        <h2 className="mt-4 text-2xl font-bold text-navy">
          {mode === "customer"
            ? "Request submitted"
            : "Offline request recorded"}
        </h2>

        <p className="mt-3 text-sm text-muted">
          Reference number
        </p>

        <p className="mt-1 font-mono text-3xl font-bold tracking-wide text-blue">
          {done.ref}
        </p>

        <div className="mx-auto mt-5 max-w-md rounded-lg bg-amber-50 p-4 text-left text-sm text-amber-900 ring-1 ring-amber-200">
          Submitting a request does <strong>not</strong> guarantee booking
          confirmation. Staff will review your details and may contact you
          for more information. Payments are handled outside this system.
        </div>
        {!!done.uploadErrors?.length && <div role="alert" className="mx-auto mt-3 max-w-md rounded-lg bg-red-50 p-4 text-left text-sm text-red-800">Your request was saved, but some files did not upload: {done.uploadErrors.join("; ")} Open the request and attach those files again.</div>}

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {mode === "customer" ? (
            <>
              <ButtonLink to={`/portal/requests/${done.id}`}>
                View request status
              </ButtonLink>

              <ButtonLink to="/portal" variant="outline">
                Back to dashboard
              </ButtonLink>
            </>
          ) : (
            <>
              <ButtonLink to="/staff/requests" variant="blue">
                Find it in request table
              </ButtonLink>

              <ButtonLink
                to={`/staff/requests/${done.id}`}
                variant="outline"
              >
                Open workspace
              </ButtonLink>
            </>
          )}
        </div>
      </Card>
    )
  }

  async function handleSubmit(event) {
    event.preventDefault()

    // Ignore the click if a submission is already in progress.
    if (submittingRef.current) {
      return
    }

    setSubmitError("")

    if (!service) {
      notify("Please choose a service first.")
      return
    }

    let customerId = user.id

    if (mode === "offline") {
      if (creating) {
        if (!newCust.name.trim() || !newCust.email.trim()) {
          setSubmitError("Enter the customer's name and email address.")
          return
        }
      } else if (picked) {
        customerId = picked
      } else {
        setSubmitError("Look up an active customer or add a new customer first.")
        return
      }
    }

    const checklist = service.documents.map(function (document) {
      if (mode === "offline") {
        return {
          label: document,
          received: !!checks[document],
        }
      }

      return {
        label: document,
        received: false,
      }
    })

    // Send only the answers that apply to the current choices.
    const cleanedDetails = cleanDetails(service, details)

    const finalDescription = hasOwnNotes
      ? String(cleanedDetails.additionalDetails ?? "").trim() ||
        [
          service.name,
          cleanedDetails.docType,
          cleanedDetails.requestedAction,
          cleanedDetails.otherDocument,
        ]
          .filter(Boolean)
          .join(" - ")
      : description

    submittingRef.current = true
    setSubmitting(true)

    try {
      if (mode === "customer") {
        await updateProfile({ name: cName, email: cEmail, phone: cPhone })
      }

      // Wait for the saved request before showing the completion screen.
      const request = await submitRequest({
        customerId: mode === "offline" && !creating ? customerId : undefined,
        customer: mode === "offline" && creating ? newCust : undefined,
        serviceId: service.id,
        source: source,
        details: cleanedDetails,
        dateFrom: dateFrom,
        dateTo: dateTo,
        description: finalDescription,
        documents: files,
        checklist: checklist,
        internalNote: note || undefined,
      })

      // Only show success if we really received a saved request.
      if (!request || !request.id || !request.ref) {
        throw new Error("The server did not return the saved request.")
      }

      setDone(request)
    } catch (error) {
      setSubmitError(
        error.message || "Something went wrong. Please try again."
      )
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  function handleCustomerLookup(value) {
    setLookup(value)
    setPicked("")
  }

  function handleNewCustomerChange(field, value) {
    setNewCust({
      ...newCust,
      [field]: value,
    })
  }

  function handleServiceSelect(selectedServiceId) {
    setServiceId(selectedServiceId)
    setDetails({})
  }

  function handleDetailsChange(field, value) {
    setDetails(function (currentDetails) {
      return cleanDetails(service, {
        ...currentDetails,
        [field]: value,
      })
    })
  }

  function handleDocumentCheck(document, checked) {
    setChecks({
      ...checks,
      [document]: checked,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {mode === "offline" && (
        <Card className="p-3.5 sm:p-5">
          <h3 className="font-semibold text-navy">
            1. Request source &amp; customer
          </h3>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Source">
              <Select
                value={source}
                onChange={(event) => setSource(event.target.value)}
                options={[
                  { value: "Walk-in", label: "Walk-in" },
                  { value: "Phone", label: "Phone Call" },
                ]}
              />
            </Field>

            <Field
              label="Customer lookup"
              hint="Search by name, email, or phone (enter at least 2 characters)."
            >
              <Input
                disabled={creating}
                value={lookup}
                onChange={(event) =>
                  handleCustomerLookup(event.target.value)
                }
                placeholder="e.g. Jonathan"
              />
            </Field>
          </div>

          {!creating && usersLoading && (
            <p role="status" className="mt-3 text-sm text-muted">
              Loading customer accounts...
            </p>
          )}

          {!creating && usersError && (
            <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">
              <span>Customer accounts could not be loaded.</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={refreshUserDirectory}
              >
                Retry
              </Button>
            </div>
          )}

          {!creating && !usersLoading && !usersError && matches.length > 0 && !picked && (
            <ul className="mt-3 divide-y divide-line rounded-lg border border-line">
              {matches.map(function (customer) {
                return (
                  <li key={customer.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setPicked(customer.id)
                        setLookup(customer.name)
                      }}
                      className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
                    >
                      <span className="font-medium">
                        {customer.name}
                      </span>

                      <span className="text-muted">
                        {customer.email}{customer.phone ? ` · ${customer.phone}` : ""}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          {!creating && !usersLoading && !usersError && searchTerm.length >= 2 && matches.length === 0 && !picked && (
            <p className="mt-3 text-sm text-muted">
              No active customer accounts match that search. Check the spelling or search by email.
            </p>
          )}

          {picked && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              <span>
                Selected: {customers.find((customer) => customer.id === picked)?.name}
                {customers.find((customer) => customer.id === picked)?.email
                  ? ` · ${customers.find((customer) => customer.id === picked).email}`
                  : ""}
              </span>
              <button
                type="button"
                className="font-semibold underline"
                onClick={() => {
                  setPicked("")
                  setLookup("")
                }}
              >
                Change
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              setCreating((current) => !current)
              setPicked("")
              setLookup("")
              setSubmitError("")
            }}
            className="mt-3 text-sm font-semibold text-blue"
          >
            {creating
              ? "Cancel new customer"
              : "Customer not found? Add new customer"}
          </button>

          {creating && (
            <div className="mt-3 grid gap-4 sm:grid-cols-3">
              <Field label="Full name">
                <Input
                  value={newCust.name}
                  onChange={(event) =>
                    handleNewCustomerChange("name", event.target.value)
                  }
                />
              </Field>

              <Field label="Email">
                <Input
                  type="email"
                  value={newCust.email}
                  onChange={(event) =>
                    handleNewCustomerChange("email", event.target.value)
                  }
                />
              </Field>

              <Field label="Phone">
                <Input
                  value={newCust.phone}
                  onChange={(event) =>
                    handleNewCustomerChange("phone", event.target.value)
                  }
                />
              </Field>
            </div>
          )}
        </Card>
      )}

      <Card className="p-3.5 sm:p-5">
        <h3 className="font-semibold text-navy">
          {mode === "offline" ? "2. Service" : "1. Choose a service"}
        </h3>

        {servicesLoading ? (
          <p role="status" className="mt-4 text-sm text-muted">Loading services...</p>
        ) : servicesError ? (
          <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-red-700">
            <span>Services could not be loaded: {servicesError}</span>
            <Button type="button" variant="outline" size="sm" onClick={refreshServices}>Retry</Button>
          </div>
        ) : activeServices.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No services are currently available.</p>
        ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {activeServices.map(function (item) {
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={serviceId === item.id}
                onClick={() => handleServiceSelect(item.id)}
                className={cx(
                  "flex items-center gap-3 rounded-lg border p-3 text-left text-sm font-medium transition-colors",
                  serviceId === item.id
                    ? "border-blue bg-blue/5 text-navy ring-1 ring-blue"
                    : "border-line hover:border-slate-300"
                )}
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-blue/10 text-blue">
                  <ServiceIcon icon={item.icon} size={18} />
                </span>

                {item.name}
              </button>
            )
          })}
        </div>
        )}
      </Card>

      {mode === "customer" && (
        <Card className="p-3.5 sm:p-5">
          <h3 className="font-semibold text-navy">
            2. Your details
          </h3>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field label="Full name">
              <Input
                required
                value={cName}
                onChange={(event) => setCName(event.target.value)}
              />
            </Field>

            <Field label="Email">
              <Input
                required
                type="email"
                value={cEmail}
                onChange={(event) => setCEmail(event.target.value)}
              />
            </Field>

            <Field label="Mobile number">
              <Input
                required
                value={cPhone}
                onChange={(event) => setCPhone(event.target.value)}
              />
            </Field>
          </div>
        </Card>
      )}

      {service ? (
        <>
          <Card className="p-3.5 sm:p-5">
            <h3 className="font-semibold text-navy">
              3. {service.name} details
            </h3>

            <div className="mt-4 space-y-4">
              <ServiceFields
                service={service}
                values={details}
                onChange={handleDetailsChange}
              />

              {service.datesLabel && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={`${service.datesLabel} (from)`}>
                    <Input
                      type="date"
                      value={dateFrom}
                      onChange={(event) =>
                        setDateFrom(event.target.value)
                      }
                    />
                  </Field>

                  <Field label={`${service.datesLabel} (to)`}>
                    <Input
                      type="date"
                      min={dateFrom}
                      value={dateTo}
                      onChange={(event) =>
                        setDateTo(event.target.value)
                      }
                    />
                  </Field>
                </div>
              )}

              {!hasOwnNotes && (
                <Field label="Description / special requests">
                  <Textarea
                    required
                    value={description}
                    onChange={(event) =>
                      setDescription(event.target.value)
                    }
                    placeholder="Share anything that helps staff understand your request."
                  />
                </Field>
              )}
            </div>
          </Card>

          {(service.documents.length > 0 || mode === "customer") && (
            <Card className="p-3.5 sm:p-5">
              <h3 className="font-semibold text-navy">
                {mode === "customer"
                  ? "Supporting documents"
                  : "Received-document checklist"}
              </h3>

              <p className="mt-1 text-sm text-muted">
                {service.documents.length > 0
                  ? <>Documents typically needed for this service: {service.documents.join(", ")}.</>
                  : "This service has no required document checklist. You may attach supporting files if they help with your request."}
              </p>

              <div className="mt-4">
                {mode === "customer" ? (
                  <FileDrop
                    files={files}
                    onAdd={(newFiles) =>
                      setFiles(function (currentFiles) {
                        return [...currentFiles, ...newFiles]
                      })
                    }
                    label="Choose files to attach"
                  />
                ) : (
                  <ul className="space-y-2">
                    {service.documents.map(function (document) {
                      return (
                        <li key={document}>
                          <label className="flex items-center gap-3 text-sm">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-blue"
                              checked={!!checks[document]}
                              onChange={(event) =>
                                handleDocumentCheck(
                                  document,
                                  event.target.checked
                                )
                              }
                            />

                            {document}
                          </label>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </Card>
          )}

          {mode === "offline" && (
            <Card className="p-3.5 sm:p-5">
              <h3 className="font-semibold text-navy">
                Internal notes
              </h3>

              <Field label="Visible to staff only" className="mt-3">
                <Textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="e.g. Customer prefers afternoon calls."
                />
              </Field>
            </Card>
          )}
        </>
      ) : (
        <SimNote>
          Select a service to see the fields that apply to it.
        </SimNote>
      )}

      {submitError && (
        <div
          role="alert"
          className="rounded-lg bg-red-50 p-4 text-sm text-red-800 ring-1 ring-red-200"
        >
          {submitError}
        </div>
      )}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button
          variant="outline"
          disabled={submitting}
          onClick={() => navigate(-1)}
        >
          Cancel
        </Button>

        <Button type="submit" size="lg" disabled={submitting}>
          {submitting
            ? "Submitting..."
            : mode === "customer"
              ? "Submit request"
              : "Record request"}
        </Button>
      </div>
    </form>
  )
}
