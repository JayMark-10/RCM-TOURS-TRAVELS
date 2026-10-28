import {
  BarChart3,
  ClipboardList,
  History,
  LayoutDashboard,
  Receipt,
  Settings,
  ShieldCheck,
  Shuffle,
  Users,
  Briefcase,
  CreditCard,
} from "lucide-react"
import { DashboardShell } from "./DashboardShell"
export function AdminLayout() {
  return (
    <DashboardShell
      role="admin"
      title="Administration"
      items={[
        { to: "/admin", label: "Overview", icon: LayoutDashboard, end: true },
        { to: "/admin/requests", label: "All Requests", icon: ClipboardList },
        { to: "/admin/quotations", label: "Quotations", icon: Receipt },
        { to: "/admin/payments", label: "Payments", icon: CreditCard },
        { to: "/admin/assignment", label: "Request Assignment", icon: Shuffle },
        { to: "/admin/users", label: "User Management", icon: Users },
        { to: "/admin/staff", label: "Staff Management", icon: ShieldCheck },
        { to: "/admin/services", label: "Service Management", icon: Briefcase },
        { to: "/admin/reports", label: "Reports", icon: BarChart3 },
        { to: "/admin/logs", label: "Activity Logs", icon: History },
        { to: "/admin/settings", label: "System Settings", icon: Settings },
      ]}
    />
  )
}
