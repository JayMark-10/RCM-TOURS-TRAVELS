import { Pencil, Plus, RefreshCw } from "lucide-react"
import { useEffect, useState } from "react"
import { Link } from "react-router-dom"

import {
  SourcePie,
  StatusChart,
  VolumeChart,
} from "../../components/charts"

import {
  ServiceIcon,
  StatusBadge,
} from "../../components/RequestParts"

import { RequestWorkspace } from "../../components/RequestWorkspace"
import { SOURCE_LABELS } from "../../lib/constants"
import { useServiceName } from "../../hooks/useServiceName"

import {
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  SimNote,
  Textarea,
  Toggle,
} from "../../components/ui"

import { useStore } from "../../lib/store"
import { CLOSED, fmtDate } from "../../utils/workflow"

export function AdminRequestDetail() {
  return <RequestWorkspace backTo="/admin/requests" />
}

export function Assignment() {
  const { requests, users, assign, notify } = useStore()
  const getServiceName = useServiceName()
  const [savingRequestId, setSavingRequestId] = useState("")
  const [assignmentError, setAssignmentError] = useState("")

  const activeStaff = users.filter((user) => {
    return user.role === "staff" && user.active
  })

  const openRequests = requests.filter((request) => {
    return !CLOSED.includes(request.status)
  })

  const [showUnassignedOnly, setShowUnassignedOnly] = useState(true)

  async function handleAssignmentChange(request, staffId) {
    setSavingRequestId(request.id)
    setAssignmentError("")
    try {
      await assign(request.id, staffId)
      notify(`${request.ref} assignment saved.`)
    } catch (error) {
      setAssignmentError(error.message || "Unable to save the assignment.")
    } finally {
      setSavingRequestId("")
    }
  }

  let displayedRequests = openRequests

  if (showUnassignedOnly) {
    displayedRequests = openRequests.filter((request) => {
      return !request.assignedTo
    })
  }

  return (
    <>
      <PageHeader
        title="Request Assignment"
        sub="Assign open requests to active staff members."
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {activeStaff.map((staffMember) => {
          const assignedCount = openRequests.filter((request) => {
            return request.assignedTo === staffMember.id
          }).length

          return (
            <Card
              key={staffMember.id}
              className="flex items-center justify-between p-4"
            >
              <span className="text-sm font-medium">
                {staffMember.name}
              </span>

              <span className="text-2xl font-bold text-navy">
                {assignedCount}
                <span className="ml-1 text-xs font-normal text-muted">open</span>
              </span>
            </Card>
          )
        })}
      </div>

      <Card>
        <CardHeader
          title={showUnassignedOnly ? "Unassigned requests" : "All open requests"}
          action={
            <label className="flex items-center gap-2 text-sm">
              Unassigned only
              <Toggle label="Unassigned only" checked={showUnassignedOnly} onChange={setShowUnassignedOnly} />
            </label>
          }
        />

        {assignmentError && <p role="alert" className="p-4 text-sm text-red-700">{assignmentError}</p>}

        {displayedRequests.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted">All open requests are assigned.</p>
        ) : (
          <ul className="divide-y divide-line">
            {displayedRequests.map((request) => (
              <li key={request.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <Link to={`/admin/requests/${request.id}`} className="font-mono text-xs font-semibold text-blue">
                    {request.ref}
                  </Link>
                  <p className="text-sm font-medium">{getServiceName(request.serviceId)} · {request.customerName}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <StatusBadge status={request.status} />
                    <span className="text-xs text-muted">{SOURCE_LABELS[request.source] ?? request.source} · {fmtDate(request.submitted)}</span>
                  </div>
                </div>
                <Select
                  aria-label={`Assign ${request.ref}`}
                  disabled={savingRequestId === request.id}
                  value={request.assignedTo ?? ""}
                  onChange={(event) => {
                    const staffId = event.target.value || null
                    handleAssignmentChange(request, staffId)
                  }}
                  options={activeStaff.map((staffMember) => ({
                    value: staffMember.id,
                    label: staffMember.name,
                  }))}
                  placeholder="Unassigned"
                  className="sm:w-56"
                />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}

export function ServiceManagement() {
  const { services, servicesLoading, servicesError, saveService, notify } = useStore()

  const [editingService, setEditingService] = useState(null)
  const [isNewService, setIsNewService] = useState(false)
  const [savingService, setSavingService] = useState(false)
  const [serviceError, setServiceError] = useState("")

  const blankService = {
    id: "",
    name: "",
    description: "",
    icon: "map",
    active: true,
    usesQuotation: false,
    documents: [],
    fields: [
      {
        key: "details",
        label: "Details",
        type: "text",
      },
    ],
    datesLabel: "Preferred dates",
  }

  function openNewServiceModal() {
    setEditingService({
      ...blankService,
      documents: [],
      fields: [...blankService.fields],
    })

    setIsNewService(true)
  }

  function openEditServiceModal(service) {
    setEditingService(service)
    setIsNewService(false)
  }

  function closeServiceModal() {
    setEditingService(null)
  }

  function updateServiceField(fieldName, value) {
    setEditingService({
      ...editingService,
      [fieldName]: value,
    })
  }

  function updateFormField(index, key, value) {
    setEditingService((current) => ({
      ...current,
      fields: current.fields.map((field, fieldIndex) => fieldIndex === index
        ? { ...field, [key]: value }
        : field),
    }))
  }

  function addFormField() {
    setEditingService((current) => ({
      ...current,
      fields: [...current.fields, { key: "field", label: "New field", type: "text", required: true, options: [] }],
    }))
  }

  function removeFormField(index) {
    setEditingService((current) => ({
      ...current,
      fields: current.fields.filter((_, fieldIndex) => fieldIndex !== index),
    }))
  }

  async function handleSaveService() {
    if (!editingService || !editingService.name.trim()) {
      return
    }

    const serviceToSave = {
      ...editingService,
      id:
        editingService.id ||
        editingService.name.toLowerCase().replace(/\W+/g, "-"),
    }

    setSavingService(true)
    setServiceError("")
    try {
      await saveService(serviceToSave)
      closeServiceModal()
      notify("Service saved.")
    } catch (error) {
      setServiceError(error.message || "Unable to save the service.")
    } finally {
      setSavingService(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Service Management"
        sub="Edit the services shown on the public site and in request forms."
        action={
          <Button variant="blue" onClick={openNewServiceModal}>
            <Plus size={16} />
            Add service
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        {servicesLoading ? (
          <p role="status" className="text-sm text-muted">Loading services...</p>
        ) : servicesError ? (
          <p role="alert" className="text-sm text-red-700">Service catalog unavailable: {servicesError}</p>
        ) : services.map((service) => (
          <Card key={service.id} className="p-5">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-blue/10 text-blue">
                <ServiceIcon icon={service.icon} />
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-navy">
                    {service.name}
                  </h3>

                  <Badge
                    className={
                      service.active
                        ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
                        : "bg-zinc-100 text-zinc-600 ring-zinc-200"
                    }
                  >
                    {service.active ? "Active" : "Hidden"}
                  </Badge>
                </div>

                <p className="mt-1 text-sm text-muted">
                  {service.description}
                </p>

                <p className="mt-3 text-xs text-muted">
                  {service.fields.length} form fields ·{" "}
                  {service.documents.length} document requirement(s) ·{" "}
                  {service.usesQuotation
                    ? "Uses quotation"
                    : "No quotation"}
                </p>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => openEditServiceModal(service)}
              >
                <Pencil size={13} />
                Edit
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Modal
        open={!!editingService}
        onClose={closeServiceModal}
        title={isNewService ? "Add service" : "Edit service"}
        footer={
          <>
            <Button variant="outline" onClick={closeServiceModal}>
              Cancel
            </Button>

            <Button
              disabled={!editingService?.name.trim() || savingService}
              onClick={handleSaveService}
            >
              {savingService ? "Saving..." : "Save"}
            </Button>
          </>
        }
      >
        {editingService && (
          <div className="space-y-4">
            <Field label="Service name">
              <Input
                value={editingService.name}
                onChange={(event) => {
                  updateServiceField("name", event.target.value)
                }}
              />
            </Field>

            <Field label="Description">
              <Textarea
                rows={3}
                value={editingService.description}
                onChange={(event) => {
                  updateServiceField("description", event.target.value)
                }}
              />
            </Field>

            {serviceError && <p role="alert" className="text-sm text-red-700">{serviceError}</p>}

            <Field label="Dates label">
              <Input
                value={editingService.datesLabel || ""}
                onChange={(event) => updateServiceField("datesLabel", event.target.value)}
              />
            </Field>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-navy">Request fields</h3>
                <Button type="button" variant="outline" size="sm" onClick={addFormField}>Add field</Button>
              </div>
              {editingService.fields.map((field, index) => (
                <div key={`${index}-${field.key}`} className="space-y-2 rounded-lg border border-line p-3">
                  <div className="grid gap-2 sm:grid-cols-3">
                    <Field label="Key">
                      <Input value={field.key} onChange={(event) => updateFormField(index, "key", event.target.value)} />
                    </Field>
                    <Field label="Label">
                      <Input value={field.label} onChange={(event) => updateFormField(index, "label", event.target.value)} />
                    </Field>
                    <Field label="Type">
                      <Select value={field.type} options={["text", "number", "select", "textarea"]} onChange={(event) => updateFormField(index, "type", event.target.value)} />
                    </Field>
                  </div>
                  {field.type === "select" && (
                    <Field label="Options" hint="One option per line.">
                      <Textarea
                        rows={3}
                        value={(field.options || []).join("\n")}
                        onChange={(event) => updateFormField(index, "options", event.target.value.split("\n").map((option) => option.trim()).filter(Boolean))}
                      />
                    </Field>
                  )}
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={field.required !== false} onChange={(event) => updateFormField(index, "required", event.target.checked)} />
                      Required
                    </label>
                    <Button type="button" variant="danger" size="sm" disabled={editingService.fields.length <= 1} onClick={() => removeFormField(index)}>Remove field</Button>
                  </div>
                </div>
              ))}
            </div>

            <Field label="Icon">
              <Select
                value={editingService.icon}
                onChange={(event) => {
                  updateServiceField("icon", event.target.value)
                }}
                options={["plane", "hotel", "map", "file"]}
              />
            </Field>

            <Field
              label="Required documents"
              hint="One per line. Leave empty if none."
            >
              <Textarea
                rows={3}
                value={editingService.documents.join("\n")}
                onChange={(event) => {
                  const documents = event.target.value
                    .split("\n")
                    .filter(Boolean)

                  updateServiceField("documents", documents)
                }}
              />
            </Field>

            <div className="flex items-center justify-between text-sm">
              <span>Active (visible to customers)</span>

              <Toggle
                label="Active"
                checked={editingService.active}
                onChange={(value) => {
                  updateServiceField("active", value)
                }}
              />
            </div>

            <div className="flex items-center justify-between text-sm">
              <span>Uses quotation step</span>

              <Toggle
                label="Uses quotation"
                checked={editingService.usesQuotation}
                onChange={(value) => {
                  updateServiceField("usesQuotation", value)
                }}
              />
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}

export function Reports() {
  const { requests, users, services, requestsLoading, requestsError } = useStore()

  const staffMembers = users.filter((user) => {
    return user.role === "staff"
  })

  function handleExport() {
    const escapeCell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`
    const rows = [
      ["Reference", "Customer", "Service", "Source", "Status", "Submitted"],
      ...requests.map((request) => [
        request.ref,
        request.customerName,
        services.find((service) => service.id === request.serviceId)?.name || request.serviceId,
        SOURCE_LABELS[request.source] ?? request.source,
        request.status,
        request.submitted,
      ]),
    ]
    const csv = rows.map((row) => row.map(escapeCell).join(",")).join("\r\n")
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }))
    const link = document.createElement("a")
    link.href = url
    link.download = `rcm-requests-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <PageHeader
        title="Reports"
        sub="Operational summaries calculated from saved requests."
        action={
          <Button variant="outline" disabled={requestsLoading || !!requestsError || requests.length === 0} onClick={handleExport}>
            Export CSV
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Monthly volume by source" />

          <div className="p-4">
            <VolumeChart requests={requests} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Requests by source" />

          <div className="p-4">
            <SourcePie requests={requests} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Requests by status" />

          <div className="p-4">
            <StatusChart requests={requests} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Service and staff breakdown" />

          <div className="space-y-5 p-5 text-sm">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                By service
              </p>

              {services.map((service) => {
                const serviceRequestCount = requests.filter((request) => {
                  return request.serviceId === service.id
                }).length

                return (
                  <div
                    key={service.id}
                    className="flex justify-between border-b border-line py-2"
                  >
                    <span>{service.name}</span>

                    <span className="font-semibold">
                      {serviceRequestCount}
                    </span>
                  </div>
                )
              })}
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                Completed by staff
              </p>

              {staffMembers.map((staffMember) => {
                const completedRequestCount = requests.filter((request) => {
                  return (
                    request.assignedTo === staffMember.id &&
                    request.status === "Completed"
                  )
                }).length

                return (
                  <div
                    key={staffMember.id}
                    className="flex justify-between border-b border-line py-2"
                  >
                    <span>{staffMember.name}</span>

                    <span className="font-semibold">
                      {completedRequestCount}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </Card>
      </div>
    </>
  )
}

export function ActivityLogs() {
  const { logs, logsLoading, logsError, loadLogs, logsPagination } = useStore()
  const [selectedRole, setSelectedRole] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("")
  const [selectedOutcome, setSelectedOutcome] = useState("")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const limit = 50

  useEffect(() => {
    void loadLogs({ page, limit, search, role: selectedRole, category: selectedCategory, outcome: selectedOutcome })
  }, [loadLogs, page, search, selectedRole, selectedCategory, selectedOutcome])

  function setFilter(setter, value) {
    setter(value)
    setPage(1)
  }

  const tableHeaders = ["When", "Actor", "Type", "Action", "Outcome", "Affected entity"]
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "local time"

  return (
    <>
      <PageHeader
        title="Activity Logs"
        sub={`Persisted server records of business and security events. Times are shown in your local timezone (${timeZone}).`}
      />

      <Card>
        <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-[minmax(12rem,1fr)_auto_auto_auto_auto]">
          <Input
            aria-label="Search activity logs"
            placeholder="Search action, actor, or entity"
            value={search}
            onChange={(event) => setFilter(setSearch, event.target.value)}
          />
          <Select
            aria-label="Role"
            value={selectedRole}
            onChange={(event) => setFilter(setSelectedRole, event.target.value)}
            options={["customer", "staff", "admin", "anonymous", "system", "unknown"]}
            placeholder="All roles"
          />
          <Select
            aria-label="Event type"
            value={selectedCategory}
            onChange={(event) => setFilter(setSelectedCategory, event.target.value)}
            options={["business", "security"]}
            placeholder="All event types"
          />
          <Select
            aria-label="Outcome"
            value={selectedOutcome}
            onChange={(event) => setFilter(setSelectedOutcome, event.target.value)}
            options={["success", "failure", "denied", "rejected"]}
            placeholder="All outcomes"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadLogs({ page, limit, search, role: selectedRole, category: selectedCategory, outcome: selectedOutcome })}
            disabled={logsLoading}
          >
            <RefreshCw size={15} aria-hidden="true" />
            Refresh
          </Button>
        </div>

        {logsLoading ? (
          <p role="status" className="p-6 text-center text-sm text-muted">Loading activity...</p>
        ) : logsError ? (
          <p role="alert" className="p-6 text-sm text-red-700">Activity history could not be loaded: {logsError}</p>
        ) : logs.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted">
            {logsPagination.total === 0 && !search && !selectedRole && !selectedCategory && !selectedOutcome
              ? "No activity has been recorded yet."
              : "No activity matches these filters."}
          </p>
        ) : <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-muted">
              <tr>
                {tableHeaders.map((header) => (
                  <th
                    key={header}
                    className="px-4 py-3 font-medium"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-line">
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-muted">
                    {log.date && !Number.isNaN(new Date(log.date).getTime())
                      ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(log.date))
                      : "Time unavailable"}
                  </td>

                  <td className="px-4 py-3 font-medium">
                    <span className="block">{log.actor}</span>
                    <span className="text-xs capitalize text-muted">{log.role}</span>
                  </td>

                  <td className="px-4 py-3">
                    <Badge className={log.category === "security" ? "bg-orange-50 text-orange-800 ring-orange-200" : "bg-blue-50 text-blue-800 ring-blue-200"}>
                      {log.category === "security" ? "Security" : "Business"}
                    </Badge>
                  </td>

                  <td className="min-w-52 px-4 py-3">
                    <span className="font-medium capitalize">{log.action.replace(/_/g, " ")}</span>
                    {(log.previousStatus || log.newStatus) && (
                      <span className="mt-1 block text-xs text-muted">
                        {log.previousStatus || "—"} → {log.newStatus || "—"}
                      </span>
                    )}
                  </td>

                  <td className="px-4 py-3">
                    <Badge className={
                      log.outcome === "success"
                        ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
                        : log.outcome === "rejected" || log.outcome === "denied"
                          ? "bg-red-50 text-red-800 ring-red-200"
                          : "bg-amber-50 text-amber-900 ring-amber-200"
                    }>{log.outcome}</Badge>
                  </td>

                  <td className="min-w-48 px-4 py-3">
                    <span className="block font-medium">{log.entityType || "—"}</span>
                    {log.entityId && <span className="block break-all font-mono text-xs text-blue">{log.entityId}</span>}
                    {log.target && <span className="mt-1 block break-words text-xs text-muted">{log.target}</span>}
                    {Object.entries(log.context || {}).length > 0 && (
                      <span className="mt-1 block break-words text-xs text-muted">
                        {Object.entries(log.context).map(([key, value]) => `${key.replace(/([A-Z])/g, " $1").toLowerCase()}: ${value ?? "—"}`).join(" · ")}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>}
        {!logsLoading && !logsError && logsPagination.total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line p-4">
            <p className="text-sm text-muted">
              Showing {(logsPagination.page - 1) * logsPagination.limit + 1}–{Math.min(logsPagination.page * logsPagination.limit, logsPagination.total)} of {logsPagination.total}
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" disabled={page <= 1 || logsLoading} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button>
              <Button type="button" variant="outline" size="sm" disabled={page >= logsPagination.totalPages || logsLoading} onClick={() => setPage((value) => value + 1)}>Next</Button>
            </div>
          </div>
        )}
      </Card>
    </>
  )
}

export function SystemSettings() {
  const { settings, settingsLoading, settingsError, refreshSettings, saveSettings, notify } = useStore()

  const [settingsForm, setSettingsForm] = useState(settings)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState("")

  useEffect(() => {
    setSettingsForm(settings)
  }, [settings])

  function updateSetting(fieldName, value) {
    setSettingsForm({
      ...settingsForm,
      [fieldName]: value,
    })
  }

  function updatePaymentMethod(method, field, value) {
    const methods = ["Cash", "Bank Transfer", "GCash"].map((name) => {
      const saved = (settingsForm.paymentMethods || []).find((item) => item.method === name)
      const current = saved || { method: name, enabled: false, instructions: "" }
      return name === method ? { ...current, [field]: value } : current
    })
    updateSetting("paymentMethods", methods)
  }

  async function handleSaveSettings(event) {
    event.preventDefault()
    setSaving(true)
    setSaveError("")
    try {
      await saveSettings(settingsForm)
      notify("Settings saved.")
    } catch (error) {
      setSaveError(error.message || "Unable to save settings.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader
        title="System Settings"
        sub="Configure public company details, payment methods, and customer registration."
      />

      {settingsLoading ? <p role="status" className="text-sm text-muted">Loading settings...</p> : settingsError ? <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><span>Settings could not be loaded: {settingsError}</span><Button variant="outline" size="sm" onClick={refreshSettings}>Retry</Button></div> : (

      <Card className="max-w-3xl p-6">
        <form
          className="space-y-5"
          onSubmit={handleSaveSettings}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Company name">
              <Input
                value={settingsForm.companyName}
                onChange={(event) => {
                  updateSetting("companyName", event.target.value)
                }}
              />
            </Field>

            <Field label="Contact email">
              <Input
                value={settingsForm.contactEmail}
                onChange={(event) => {
                  updateSetting("contactEmail", event.target.value)
                }}
              />
            </Field>

            <Field label="Contact phone">
              <Input
                value={settingsForm.contactPhone}
                onChange={(event) => {
                  updateSetting("contactPhone", event.target.value)
                }}
              />
            </Field>

            <Field label="Office address">
              <Input
                value={settingsForm.address}
                onChange={(event) => {
                  updateSetting("address", event.target.value)
                }}
              />
            </Field>
          </div>

          <Field label="Customer-facing disclaimer">
            <Textarea
              rows={3}
              value={settingsForm.disclaimer}
              onChange={(event) => {
                updateSetting("disclaimer", event.target.value)
              }}
            />
          </Field>

          {saveError && <p role="alert" className="text-sm text-red-700">{saveError}</p>}

          <div className="flex items-center justify-between text-sm">
            <span>Allow new customer registration</span>

            <Toggle
              label="Allow registration"
              checked={settingsForm.allowRegistration}
              onChange={(value) => {
                updateSetting("allowRegistration", value)
              }}
            />
          </div>

          <section className="space-y-4 rounded-xl border border-line p-4">
            <div><h2 className="font-semibold text-navy">Manual payment instructions</h2><p className="mt-1 text-xs text-muted">Enabled methods require verified instructions. Staff must verify reported payments and record cash only after it has been received.</p></div>
            {["Cash", "Bank Transfer", "GCash"].map((method) => {
              const setting = (settingsForm.paymentMethods || []).find((item) => item.method === method) || { enabled: false, instructions: "" }
              return <div key={method} className="grid gap-3 rounded-xl border border-line/75 bg-surface/75 p-3.5 sm:grid-cols-[160px_1fr]">
                <div className="flex items-center justify-between gap-3 text-sm font-medium"><span>{method}</span><Toggle label={`Enable ${method}`} checked={setting.enabled} onChange={(value) => updatePaymentMethod(method, "enabled", value)} /></div>
                <Textarea rows={2} aria-label={`${method} instructions`} placeholder={method === "Cash" ? "Where customers should pay in person" : `Enter the agency's verified ${method} details`} value={setting.instructions} onChange={(event) => updatePaymentMethod(method, "instructions", event.target.value)} />
              </div>
            })}
            <p className="text-xs leading-5 text-muted">For clearer customer display, put the account holder and number on separate labeled lines, such as “Account holder:” and “GCash number:”. The customer payment page uses only the instructions saved here.</p>
          </section>

          <Button type="submit" variant="blue" disabled={saving}>
            {saving ? "Saving..." : "Save settings"}
          </Button>
        </form>
      </Card>
      )}
    </>
  )
}
