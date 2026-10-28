import {
  ClipboardList,
  CreditCard,
  FilePlus2,
  HelpCircle,
  LayoutDashboard,
  Receipt,
  UserCheck,
} from "lucide-react"

import { useStore } from "../lib/store"
import { CLOSED } from "../utils/workflow"
import { DashboardShell } from "./DashboardShell"

export function StaffLayout() {
  const { requests, user } = useStore()

  const assignedRequestCount = requests.filter((request) => {
    const isAssignedToCurrentUser = request.assignedTo === user?.id
    const isStillOpen = !CLOSED.includes(request.status)

    return isAssignedToCurrentUser && isStillOpen
  }).length

  const navigationItems = [
    {
      to: "/staff",
      label: "Dashboard",
      icon: LayoutDashboard,
      end: true,
    },
    {
      to: "/staff/requests",
      label: "All Requests",
      icon: ClipboardList,
    },
    {
      to: "/staff/assigned",
      label: "Assigned to Me",
      icon: UserCheck,
      badge: assignedRequestCount,
    },
    {
      to: "/staff/awaiting",
      label: "Awaiting Information",
      icon: HelpCircle,
    },
    {
      to: "/staff/quotations",
      label: "Quotations",
      icon: Receipt,
    },
    { to: "/staff/payments", label: "Payments", icon: CreditCard },
    {
      to: "/staff/new",
      label: "Create Offline Request",
      icon: FilePlus2,
    },
  ]

  return (
    <DashboardShell
      role="staff"
      title="Staff Workspace"
      items={navigationItems}
    />
  )
}
