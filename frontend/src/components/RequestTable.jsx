import { Search } from "lucide-react"
import { useMemo, useState } from "react"
import { Link } from "react-router-dom"

import { useStore } from "../lib/store"
import { SOURCES, STATUSES } from "../lib/constants"
import { fmtDate } from "../utils/workflow"
import { RequestCard, SourceTag, StatusBadge } from "./RequestParts"
import { useServiceName } from "../hooks/useServiceName"

import {
  Card,
  Empty,
  Input,
  Select,
} from "./ui"

export function RequestTable({
  requests,
  basePath,
  hideFilters,
  emptyText = "No requests match your filters.",
}) {
  const { users, services } = useStore()

  const getServiceName = useServiceName()

  const [searchText, setSearchText] = useState("")
  const [status, setStatus] = useState("")
  const [source, setSource] = useState("")
  const [service, setService] = useState("")
  const [staff, setStaff] = useState("")

  function getStaffName(staffId) {
    const staffMember = users.find(function (user) {
      return user.id === staffId
    })

    return staffMember?.name ?? null
  }

  const rows = useMemo(function () {
    return requests.filter(function (request) {
      const matchesStatus =
        !status || request.status === status

      const matchesSource =
        !source || request.source === source

      const matchesService =
        !service || request.serviceId === service

      let matchesStaff = true

      if (staff === "none") {
        matchesStaff = !request.assignedTo
      } else if (staff) {
        matchesStaff = request.assignedTo === staff
      }

      const searchValue = (
        request.ref + request.customerName
      ).toLowerCase()

      const matchesSearch =
        !searchText ||
        searchValue.includes(searchText.toLowerCase())

      return (
        matchesStatus &&
        matchesSource &&
        matchesService &&
        matchesStaff &&
        matchesSearch
      )
    })
  }, [requests, searchText, status, source, service, staff])

  return (
    <Card>
      {!hideFilters && (
        <div className="grid gap-3 border-b border-line bg-surface/65 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search
              size={15}
              className="absolute left-3 top-3 text-muted"
            />

            <Input
              aria-label="Search"
              className="pl-9"
              placeholder="Search ref or customer"
              value={searchText}
              onChange={(event) =>
                setSearchText(event.target.value)
              }
            />
          </div>

          <Select
            aria-label="Status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            options={[...STATUSES]}
            placeholder="All statuses"
          />

          <Select
            aria-label="Source"
            value={source}
            onChange={(event) => setSource(event.target.value)}
            options={[...SOURCES]}
            placeholder="All sources"
          />

          <Select
            aria-label="Service"
            value={service}
            onChange={(event) => setService(event.target.value)}
            options={services.map(function (item) {
              return {
                value: item.id,
                label: item.name,
              }
            })}
            placeholder="All services"
          />

          <Select
            aria-label="Assigned staff"
            value={staff}
            onChange={(event) => setStaff(event.target.value)}
            options={[
              { value: "none", label: "Unassigned" },
              ...users
                .filter((user) => user.role === "staff")
                .map((user) => ({
                  value: user.id,
                  label: user.name,
                })),
            ]}
            placeholder="All staff"
          />
        </div>
      )}

      {rows.length === 0 ? (
        <Empty
          title="Nothing to show"
          sub={emptyText}
        />
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-muted">
                <tr>
                  {[
                    "Reference",
                    "Customer",
                    "Service",
                    "Source",
                    "Assigned",
                    "Submitted",
                    "Status",
                    "",
                  ].map(function (heading) {
                    return (
                      <th
                        key={heading}
                        className="whitespace-nowrap px-4 py-3 font-medium"
                      >
                        {heading}
                      </th>
                    )
                  })}
                </tr>
              </thead>

              <tbody className="divide-y divide-line">
                {rows.map(function (request) {
                  const assignedStaff = getStaffName(
                    request.assignedTo
                  )

                  return (
                    <tr
                      key={request.id}
                      className="hover:bg-slate-50/70"
                    >
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-semibold text-blue">
                        {request.ref}
                      </td>

                      <td className="px-4 py-3 font-medium">
                        {request.customerName}
                      </td>

                      <td className="px-4 py-3 text-muted">
                        {getServiceName(request.serviceId)}
                      </td>

                      <td className="px-4 py-3">
                        <SourceTag source={request.source} />
                      </td>

                      <td className="whitespace-nowrap px-4 py-3">
                        {assignedStaff ?? (
                          <span className="text-muted">
                            Unassigned
                          </span>
                        )}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3 text-muted">
                        {fmtDate(request.submitted)}
                      </td>

                      <td className="px-4 py-3">
                        <StatusBadge status={request.status} />
                      </td>

                      <td className="px-4 py-3 text-right">
                        <Link
                          to={`${basePath}/${request.id}`}
                          className="rounded-md px-2 py-1 text-[13px] font-semibold text-blue hover:bg-blue/10"
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 p-4 md:hidden">
            {rows.map(function (request) {
              return (
                <RequestCard
                  key={request.id}
                  r={request}
                  to={`${basePath}/${request.id}`}
                />
              )
            })}
          </div>
        </>
      )}
    </Card>
  )
}
