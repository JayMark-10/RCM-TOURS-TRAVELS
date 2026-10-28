import { CheckCircle2, ClipboardList, Hourglass, Loader, XCircle } from "lucide-react"
import { Link } from "react-router-dom"
import { SourcePie, StatusChart, VolumeChart } from "../../components/charts"
import { RequestTable } from "../../components/RequestTable"
import { Button, Card, CardHeader, PageHeader, StatCard } from "../../components/ui"
import { useStore } from "../../lib/store"

export function counts(requests) {
  return {
    total: requests.length,
    pending: requests.filter((request) => request.status === "Pending").length,
    progress: requests.filter((request) => !["Pending", "Completed", "Cancelled", "Rejected"].includes(request.status)).length,
    done: requests.filter((request) => request.status === "Completed").length,
    cancelled: requests.filter((request) => request.status === "Cancelled").length,
  }
}

export function AdminOverview() {
  const { requests, logs, requestsLoading, requestsError, refreshRequests, logsLoading, logsError } = useStore()
  const requestCounts = counts(requests)

  return (
    <>
      <PageHeader title="Admin Overview" sub="System-wide metrics from saved request records." />
      {requestsLoading ? (
        <p role="status" className="p-8 text-center text-sm text-muted">Loading request metrics...</p>
      ) : requestsError ? (
        <div role="alert" className="space-y-3 text-sm text-red-700">
          <p>Request metrics could not be loaded.</p>
          <Button variant="outline" onClick={refreshRequests}>Retry</Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5">
            <StatCard label="Total requests" value={requestCounts.total} icon={<ClipboardList size={18} />} />
            <StatCard label="Pending" value={requestCounts.pending} icon={<Hourglass size={18} />} tone="text-amber-700 bg-amber-100" />
            <StatCard label="In progress" value={requestCounts.progress} icon={<Loader size={18} />} tone="text-indigo-700 bg-indigo-100" />
            <StatCard label="Completed" value={requestCounts.done} icon={<CheckCircle2 size={18} />} tone="text-emerald-700 bg-emerald-100" />
            <StatCard label="Cancelled" value={requestCounts.cancelled} icon={<XCircle size={18} />} tone="text-zinc-600 bg-zinc-100" />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card><CardHeader title="Requests by status" /><div className="p-4"><StatusChart requests={requests} /></div></Card>
            <Card><CardHeader title="Monthly volume by source" sub="Saved requests over the last six months" /><div className="p-4"><VolumeChart requests={requests} /></div></Card>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.4fr]">
            <Card><CardHeader title="Source mix" /><div className="p-4"><SourcePie requests={requests} /></div></Card>
            <Card>
              <CardHeader title="Recent activity" action={<Link to="/admin/logs" className="text-sm font-semibold text-blue">All logs</Link>} />
              {logsLoading ? <p role="status" className="p-5 text-sm text-muted">Loading activity...</p> : logsError ? <p role="alert" className="p-5 text-sm text-red-700">Activity history could not be loaded.</p> : logs.length === 0 ? <p className="p-5 text-sm text-muted">No recorded activity yet.</p> : (
                <ul className="divide-y divide-line">
                  {logs.slice(0, 5).map((log) => (
                    <li key={log.id} className="px-5 py-3 text-sm">
                      <span className="font-medium">{log.actor}</span> · {log.action} <span className="font-mono text-xs text-blue">{log.target}</span>
                      <div className="text-xs text-muted">{log.date}</div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <div className="mt-6"><RequestTable requests={requests.slice(0, 5)} basePath="/admin/requests" hideFilters /></div>
        </>
      )}
    </>
  )
}

export function AdminRequests() {
  const { requests, requestsLoading, requestsError, refreshRequests } = useStore()
  return (
    <>
      <PageHeader title="All Requests" sub="Filter by status, source, service, or staff." />
      {requestsLoading ? <p role="status" className="p-5 text-sm text-muted">Loading requests...</p> : requestsError ? (
        <div role="alert" className="space-y-3 text-sm text-red-700">
          <p>Requests could not be loaded.</p>
          <Button variant="outline" onClick={refreshRequests}>Retry</Button>
        </div>
      ) : <RequestTable requests={requests} basePath="/admin/requests" />}
    </>
  )
}
