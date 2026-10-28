import { useState } from "react"
import { Link } from "react-router-dom"

import {
  RequestCard,
  StatusBadge,
} from "../../components/RequestParts"
import { useServiceName } from "../../hooks/useServiceName"
import {
  ButtonLink,
  Card,
  Empty,
  PageHeader,
  Tabs,
} from "../../components/ui"
import { useStore } from "../../lib/store"
import { CLOSED, fmtDate } from "../../utils/workflow"

export default function MyRequests() {
  const { user, requests } = useStore()
  const getServiceName = useServiceName()

  const [activeTab, setActiveTab] = useState("all")

  const myRequests = requests.filter((request) => {
    return request.customerId === user.id
  })

  const openRequests = myRequests.filter((request) => {
    return !CLOSED.includes(request.status)
  })

  const closedRequests = myRequests.filter((request) => {
    return CLOSED.includes(request.status)
  })

  let filteredRequests = myRequests

  if (activeTab === "open") {
    filteredRequests = openRequests
  } else if (activeTab === "closed") {
    filteredRequests = closedRequests
  }

  const tabs = [
    {
      id: "all",
      label: "All",
      count: myRequests.length,
    },
    {
      id: "open",
      label: "Open",
      count: openRequests.length,
    },
    {
      id: "closed",
      label: "Closed",
      count: closedRequests.length,
    },
  ]

  return (
    <>
      <PageHeader
        title="My Requests"
        sub="Only requests submitted under your account are shown here."
        action={
          <ButtonLink to="/portal/new">
            New request
          </ButtonLink>
        }
      />

      <Tabs
        value={activeTab}
        onChange={setActiveTab}
        tabs={tabs}
      />

      <div className="mt-5">
        {filteredRequests.length === 0 ? (
          <Card>
            <Empty
              title="No requests here"
              sub="Requests will appear once you submit one."
            />
          </Card>
        ) : (
          <>
            <Card className="hidden md:block">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-muted">
                  <tr>
                    {[
                      "Reference",
                      "Service",
                      "Submitted",
                      "Status",
                      "",
                    ].map((heading) => (
                      <th
                        key={heading}
                        className="px-4 py-3 font-medium"
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody className="divide-y divide-line">
                  {filteredRequests.map((request) => (
                    <tr
                      key={request.id}
                      className="hover:bg-slate-50/70"
                    >
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-blue">
                        {request.ref}
                      </td>

                      <td className="px-4 py-3 font-medium">
                        {getServiceName(request.serviceId)}
                      </td>

                      <td className="px-4 py-3 text-muted">
                        {fmtDate(request.submitted)}
                      </td>

                      <td className="px-4 py-3">
                        <StatusBadge status={request.status} />
                      </td>

                      <td className="px-4 py-3 text-right">
                        <Link
                          className="text-[13px] font-semibold text-blue"
                          to={`/portal/requests/${request.id}`}
                        >
                          View details
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            <div className="space-y-3 md:hidden">
              {filteredRequests.map((request) => (
                <RequestCard
                  key={request.id}
                  r={request}
                  to={`/portal/requests/${request.id}`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </>
  )
}