
import { AlertTriangle, Clock, Inbox, UserCheck } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router-dom"

import { RequestForm } from "../../components/RequestForm"
import { RequestCard, StatusBadge } from "../../components/RequestParts"
import { RequestTable } from "../../components/RequestTable"
import { RequestWorkspace } from "../../components/RequestWorkspace"

import { useServiceName } from "../../hooks/useServiceName"

import {
  ButtonLink,
  Button,
  Card,
  CardHeader,
  Empty,
  Input,
  PageHeader,
  Select,
  StatCard,
} from "../../components/ui"

import { useStore } from "../../lib/store"
import { CLOSED, fmtDate } from "../../utils/workflow"

export function StaffDashboard() {
  const { requests, user } = useStore()

  const myOpenRequests = requests.filter((request) => {
    return (
      request.assignedTo === user.id &&
      !CLOSED.includes(request.status)
    )
  })

  const unassignedRequests = requests.filter((request) => {
    return (
      !request.assignedTo &&
      !CLOSED.includes(request.status)
    )
  })

  const pendingCount = requests.filter((request) => {
    return request.status === "Pending"
  }).length

  const awaitingCustomerCount = requests.filter((request) => {
    return [
      "Awaiting Information",
      "Awaiting Customer Confirmation",
    ].includes(request.status)
  }).length

  return (
    <>
      <PageHeader
        title="Staff Dashboard"
        sub="Today's queue across online, walk-in, and phone requests."
        action={
          <ButtonLink to="/staff/new">
            Create Offline Request
          </ButtonLink>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label="Assigned to me"
          value={myOpenRequests.length}
          icon={<UserCheck size={18} />}
        />

        <StatCard
          label="Awaiting review"
          value={pendingCount}
          icon={<Inbox size={18} />}
          tone="text-amber-700 bg-amber-100"
        />

        <StatCard
          label="Awaiting customer"
          value={awaitingCustomerCount}
          icon={<Clock size={18} />}
          tone="text-orange-700 bg-orange-100"
        />

        <StatCard
          label="Unassigned"
          value={unassignedRequests.length}
          icon={<AlertTriangle size={18} />}
          tone="text-red bg-red/10"
        />
      </div>

      <div className="mt-6 grid gap-4 lg:mt-8 lg:grid-cols-2 lg:gap-6">
        <Card>
          <CardHeader
            title="My open requests"
            action={
              <Link
                to="/staff/assigned"
                className="text-sm font-semibold text-blue"
              >
                View all
              </Link>
            }
          />

          <div className="space-y-3 p-4">
            {myOpenRequests.length > 0 ? (
              myOpenRequests.slice(0, 5).map((request) => (
                <RequestCard
                  key={request.id}
                  r={request}
                  to={`/staff/requests/${request.id}`}
                />
              ))
            ) : (
              <Empty title="Nothing assigned" />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Unassigned requests"
            sub="Authorized staff and admins can assign these."
          />

          <div className="space-y-3 p-4">
            {unassignedRequests.length > 0 ? (
              unassignedRequests.map((request) => (
                <RequestCard
                  key={request.id}
                  r={request}
                  to={`/staff/requests/${request.id}`}
                />
              ))
            ) : (
              <Empty title="Everything is assigned" />
            )}
          </div>
        </Card>
      </div>
    </>
  )
}

export function StaffRequests() {
  const { requests } = useStore()

  return (
    <>
      <PageHeader
        title="All Requests"
        sub="One centralized table for online, walk-in, and phone requests."
        action={
          <ButtonLink to="/staff/new" variant="blue">
            Create Offline Request
          </ButtonLink>
        }
      />

      <RequestTable
        requests={requests}
        basePath="/staff/requests"
      />
    </>
  )
}

export function Assigned() {
  const { requests, user } = useStore()

  const assignedRequests = requests.filter((request) => {
    return request.assignedTo === user.id
  })

  return (
    <>
      <PageHeader title="Assigned to Me" />

      <RequestTable
        requests={assignedRequests}
        basePath="/staff/requests"
        emptyText="Nothing is assigned to you."
      />
    </>
  )
}

export function Awaiting() {
  const { requests } = useStore()

  const awaitingRequests = requests.filter((request) => {
    return request.status === "Awaiting Information"
  })

  return (
    <>
      <PageHeader
        title="Awaiting Information"
        sub="Requests where staff are waiting for the customer to respond."
      />

      <RequestTable
        requests={awaitingRequests}
        basePath="/staff/requests"
        hideFilters
        emptyText="No requests are waiting on customers."
      />
    </>
  )
}

export function Quotations({ basePath = "/staff/requests" }) {
  const { requests, requestsLoading, requestsError, refreshRequests, services } = useStore()
  const getServiceName = useServiceName()
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("")

  const awaitingQuotation = requests.filter((request) => {
    const service = services.find((item) => item.id === request.serviceId)
    return request.status === "For Quotation" && !request.quotation && service?.usesQuotation
  })
  const quotationRequests = requests.filter((request) => {
    const hasQuotation = Boolean(request.quotation)

    return hasQuotation
  })

  const filteredQuotations = quotationRequests.filter((request) => {
    const quotationState = request.quotation?.state || "Not started"
    const matchesStatus = !statusFilter || quotationState === statusFilter
    const searchText = [
      request.ref,
      request.customerName,
      getServiceName(request.serviceId),
      quotationState,
    ].join(" ").toLowerCase()
    return matchesStatus && searchText.includes(search.trim().toLowerCase())
  })

  return (
    <>
      <PageHeader
        title="Quotation Management"
        sub="Saved drafts and issued quotations are kept separate from requests that still need a quotation."
      />

      <Card>
        {requestsLoading ? (
          <p role="status" className="p-6 text-center text-sm text-muted">
            Loading quotations...
          </p>
        ) : requestsError ? (
          <Empty
            title="Unable to load quotations"
            sub="The request records could not be loaded, so quotation data is unavailable."
            action={<Button variant="outline" onClick={refreshRequests}>Retry</Button>}
          />
        ) : quotationRequests.length === 0 ? (
          <Empty
            title="No quotations yet"
            sub={awaitingQuotation.length ? `${awaitingQuotation.length} eligible request${awaitingQuotation.length === 1 ? " is" : "s are"} waiting below. Prepare a draft to add it to saved quotations.` : "Open an eligible request and save a draft to create the first quotation."}
            action={<ButtonLink to={basePath} variant="outline">Browse requests</ButtonLink>}
          />
        ) : (
          <>
            <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-[1fr_200px]">
              <Input
                aria-label="Search quotations"
                placeholder="Search reference, customer, or service"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <Select
                aria-label="Quotation status"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                options={["Draft", "Sent", "Accepted", "Declined"]}
                placeholder="All statuses"
              />
            </div>
            {filteredQuotations.length === 0 ? (
              <Empty title="No matching quotations" sub="Try a different search or status filter." />
            ) : (
          <ul className="divide-y divide-line">
            {filteredQuotations.map((request) => (
              <li key={request.id}>
                <Link
                  to={`${basePath}/${request.id}?tab=quotation`}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-slate-50"
                >
                  <div>
                    <p className="font-mono text-xs font-semibold text-blue">
                      {request.ref}
                    </p>

                    <p className="text-sm font-medium">
                      {getServiceName(request.serviceId)} ·{" "}
                      {request.customerName}
                    </p>

                    <p className="text-xs text-muted">
                      {request.quotation ? (
                        <>
                          Quotation: {request.quotation.state}
                          {request.quotation.items?.length > 0
                            ? ` · total ${request.quotation.items.reduce((sum, item) => sum + Number(item.amount || 0), 0).toLocaleString()}`
                            : ""}
                          {request.quotation.validUntil
                            ? ` · valid until ${fmtDate(
                                request.quotation.validUntil,
                              )}`
                            : ""}
                        </>
                      ) : (
                        "Quotation not started"
                      )}
                    </p>
                  </div>

                  <StatusBadge status={request.status} />
                </Link>
              </li>
            ))}
          </ul>
            )}
          </>
        )}
      </Card>
      <Card className="mt-6">
        <CardHeader title="Requests Awaiting Quotation" sub="These requests need a quote; no quotation has been saved yet." />
        {awaitingQuotation.length === 0 ? (
          <Empty title="No requests awaiting a quotation" />
        ) : (
          <ul className="divide-y divide-line">
            {awaitingQuotation.map((request) => (
              <li key={request.id}>
                <Link to={`${basePath}/${request.id}?tab=quotation`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-slate-50">
                  <span><span className="font-mono text-xs text-blue">{request.ref}</span><span className="ml-3 text-sm">{request.customerName} · {getServiceName(request.serviceId)}</span></span>
                  <span className="text-sm font-semibold text-blue">Prepare quotation →</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}

export function CreateOffline() {
  return (
    <>
      <PageHeader
        title="Create Offline Request"
        sub="Encode a walk-in or phone call inquiry into the same centralized system as online submissions."
      />

      <RequestForm mode="offline" />
    </>
  )
}

export function StaffRequestDetail() {
  return <RequestWorkspace backTo="/staff/requests" />
}
