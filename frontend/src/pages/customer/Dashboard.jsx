import { AlertCircle, CheckCircle2, Clock, FileStack, Plus } from "lucide-react"
import { Link } from "react-router-dom"
import { RequestCard } from "../../components/RequestParts"
import {
  ButtonLink,
  Card,
  CardHeader,
  Empty,
  PageHeader,
  StatCard,
} from "../../components/ui"
import { useStore } from "../../lib/store"
import { CLOSED, NEEDS_CUSTOMER } from "../../utils/workflow"
export default function CustomerDashboard() {
  const { user, requests } = useStore()
  const mine = requests.filter((r) => r.customerId === user.id)
  const action = mine.filter((r) => NEEDS_CUSTOMER.includes(r.status))
  return (
    <>
      <PageHeader
        title={`Welcome back, ${user.name.split(" ")[0]}`}
        sub="Track your service requests and respond when staff need something from you."
        action={
          <ButtonLink to="/portal/new">
            <Plus size={16} /> Request a Service
          </ButtonLink>
        }
      />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Total requests"
          value={mine.length}
          icon={<FileStack size={18} />}
        />
        <StatCard
          label="Pending / in review"
          value={
            mine.filter((r) =>
              [
                "Pending",
                "Under Review",
                "Processing",
                "For Quotation",
              ].includes(r.status),
            ).length
          }
          icon={<Clock size={18} />}
          tone="text-amber-700 bg-amber-100"
        />
        <StatCard
          label="Needs your action"
          value={action.length}
          icon={<AlertCircle size={18} />}
          tone="text-red bg-red/10"
        />
        <StatCard
          label="Completed"
          value={mine.filter((r) => r.status === "Completed").length}
          icon={<CheckCircle2 size={18} />}
          tone="text-emerald-700 bg-emerald-100"
        />
      </div>

      <div className="mt-6 grid gap-4 lg:mt-8 lg:grid-cols-[1.4fr_1fr] lg:gap-6">
        <Card>
          <CardHeader
            title="Needs your action"
            sub="Staff are waiting on you for these requests."
          />
          <div className="space-y-3 p-4">
            {action.length === 0 ? (
              <Empty title="You're all caught up" />
            ) : (
              action.map((r) => (
                <RequestCard key={r.id} r={r} to={`/portal/requests/${r.id}`} />
              ))
            )}
          </div>
        </Card>
        <Card>
          <CardHeader
            title="Recent requests"
            action={
              <Link
                to="/portal/requests"
                className="text-sm font-semibold text-blue"
              >
                View all
              </Link>
            }
          />
          <div className="space-y-3 p-4">
            {mine.filter((r) => !CLOSED.includes(r.status)).length === 0 ? (
              <Empty title="No open requests" />
            ) : (
              mine
                .filter((r) => !CLOSED.includes(r.status))
                .slice(0, 4)
                .map((r) => (
                  <RequestCard
                    key={r.id}
                    r={r}
                    to={`/portal/requests/${r.id}`}
                  />
                ))
            )}
          </div>
        </Card>
      </div>
    </>
  )
}
