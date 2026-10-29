import {
  Bell,
  FilePlus2,
  LayoutDashboard,
  ListChecks,
  UserRound,
} from "lucide-react"
import { Navigate, NavLink, Outlet, useLocation } from "react-router-dom"
import { Logo } from "./PublicLayout"
import { AuthConnectionError } from "./AuthConnectionError"
import { useStore } from "../lib/store"
import { LogoutButton } from "../components/LogoutButton"
import { RouteTransition } from "../components/RouteTransition"
import { useSlidingNavIndicator } from "../hooks/useSlidingNavIndicator"

export function CustomerLayout() {
  const { pathname } = useLocation()
  const { user, authLoading, authError, retryAuth, notifications } =
    useStore()
  useSlidingNavIndicator(
    "customer-primary",
    `${pathname}:${authLoading}:${user?.id ?? ""}`,
  )

  // Wait until the backend session check finishes.
  if (authLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue" />
          <p className="mt-3 text-sm text-muted">
            Checking your session...
          </p>
        </div>
      </div>
    )
  }

  // The session could not be checked because the server is unreachable.
  // Stay on this page instead of redirecting, and offer a retry.
  if (authError) {
    return <AuthConnectionError message={authError} onRetry={retryAuth} />
  }

  // Redirect only after session checking finishes.
  if (!user) {
    return <Navigate to="/signin" replace />
  }

  // Only customer accounts can access this portal.
  if (user.role !== "customer") {
    return <Navigate to={`/${user.role}`} replace />
  }

  const unread = notifications.filter(
    (n) => n.userId === user.id && !n.read,
  ).length

  const items = [
    { to: "/portal", label: "Dashboard", icon: LayoutDashboard, end: true },
    { to: "/portal/requests", label: "My Requests", icon: ListChecks },
    { to: "/portal/new", label: "New Request", icon: FilePlus2 },
    {
      to: "/portal/notifications",
      label: "Notifications",
      icon: Bell,
      badge: unread,
    },
    { to: "/portal/profile", label: "Profile", icon: UserRound },
  ]

  return (
    <div className="app-canvas min-h-screen pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0">
      <header className="sticky top-0 z-30 border-b border-white/80 bg-white/82 shadow-[0_4px_24px_rgba(11,31,58,.055)] backdrop-blur-xl transition-[background-color,box-shadow] duration-300">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-3 sm:gap-4 sm:px-5">
          <Logo />

          <nav data-sliding-nav="customer-primary" className="relative hidden items-center gap-1 md:flex">
            <span
              aria-hidden="true"
              data-active-indicator
              className="nav-active-indicator absolute left-0 top-0 z-0 rounded-full bg-blue/10 shadow-[inset_0_-2px_0_#1f5faf]"
            />
            {items.map((i) => (
              <NavLink
                key={i.to}
                to={i.to}
                end={i.end}
                className={({ isActive }) =>
                  `relative z-10 flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition-colors duration-200 ${
                    isActive
                      ? "text-blue"
                      : "text-muted hover:text-ink"
                  }`
                }
              >
                <i.icon size={16} />
                {i.label}

                {!!i.badge && (
                  <span className="grid h-4 min-w-4 place-items-center rounded-full bg-red px-1 text-[10px] font-bold text-white">
                    {i.badge}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <span className="hidden text-sm font-medium text-ink sm:block">
              {user.name}
            </span>

            <LogoutButton compact className="h-11 w-11 shrink-0 border-red/30 p-0 text-red hover:bg-red/5 sm:h-11 sm:w-auto sm:px-3.5" />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full min-w-0 max-w-6xl px-4 py-7 sm:px-6 sm:py-9">
        <RouteTransition>
          <Outlet />
        </RouteTransition>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-white/80 bg-white/86 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_rgba(11,31,58,.09)] backdrop-blur-2xl md:hidden">
        {items.map((i) => (
          <NavLink
            key={i.to}
            to={i.to}
            end={i.end}
            className={({ isActive }) =>
              `relative flex min-w-0 flex-col items-center gap-0.5 py-2.5 text-[9px] font-medium transition-colors duration-200 sm:text-[10px] ${
                isActive ? "text-blue" : "text-muted"
              }`
            }
          >
            <i.icon size={19} />

            <span className="max-w-full truncate px-0.5 text-center">{i.label.replace("My ", "").replace("New Request", "New")}</span>

            {!!i.badge && (
              <span className="absolute right-[28%] top-1.5 h-2 w-2 rounded-full bg-red" />
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
