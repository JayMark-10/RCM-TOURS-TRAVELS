import { Menu, X } from "lucide-react"
import { useState } from "react"
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom"
import { Logo } from "./PublicLayout"
import { AuthConnectionError } from "./AuthConnectionError"
import { useStore } from "../lib/store"
import { LogoutButton } from "../components/LogoutButton"
import { RouteTransition } from "../components/RouteTransition"
import { useSlidingNavIndicator } from "../hooks/useSlidingNavIndicator"

export function DashboardShell({ role, title, items }) {
  const { pathname } = useLocation()
  const { user, authLoading, authError, retryAuth } = useStore()
  const [open, setOpen] = useState(false)
  const nav = useNavigate()
  useSlidingNavIndicator(
    `${role}-sidebar`,
    `${pathname}:${open}:${authLoading}:${user?.id ?? ""}`,
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

  // Redirect to sign in only after session checking finishes.
  if (!user) {
    return <Navigate to="/signin" replace />
  }

  // Frontend role check for navigation.
  // The backend must still enforce authorization for protected API requests.
  if (user.role !== role) {
    return (
      <div className="grid min-h-screen place-items-center p-6 text-center">
        <div className="max-w-sm rounded-xl border border-line bg-white p-8">
          <h1 className="text-lg font-bold text-navy">
            Access restricted
          </h1>

          <p className="mt-2 text-sm text-muted">
            This area is only available to{" "}
            {role === "admin" ? "administrators" : "staff"}. You are signed in
            as {user.role}.
          </p>

          <button
            onClick={() =>
              nav(user.role === "customer" ? "/portal" : `/${user.role}`)
            }
            className="mt-5 rounded-lg bg-blue px-4 py-2 text-sm font-semibold text-white"
          >
            Go to my workspace
          </button>
        </div>
      </div>
    )
  }

  const sidebar = (
      <div className="flex h-full flex-col bg-gradient-to-b from-navy via-[#0d294b] to-[#0b1f3a] text-slate-300">
      <div className="flex h-[76px] items-center justify-between border-b border-white/10 px-5">
        <Logo dark />

        <button
          className="grid h-11 w-11 place-items-center rounded-xl text-slate-200 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white xl:hidden"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
        >
          <X size={20} />
        </button>
      </div>

      <p className="px-5 pb-2 pt-5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {title}
      </p>

      <nav
        data-sliding-nav={`${role}-sidebar`}
        data-indicator-axis="vertical"
        className="relative min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 pb-4"
      >
        <span
          aria-hidden="true"
          data-active-indicator
          className="nav-active-indicator absolute left-3 right-3 top-0 z-0 rounded-lg bg-white/10 [background-image:linear-gradient(#D9364F,#D9364F)] [background-position:left_center] [background-repeat:no-repeat] [background-size:3px_100%]"
        />
        {items.map((i) => (
          <NavLink
            key={i.to}
            to={i.to}
            end={i.end}
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              `relative z-10 flex min-w-0 items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors duration-200 ease-[cubic-bezier(.2,.7,.2,1)] ${
                isActive
                  ? "text-white"
                  : "hover:bg-white/5 hover:text-white"
              }`
            }
          >
            <i.icon size={17} />
            <span className="min-w-0 flex-1 break-words">{i.label}</span>

            {!!i.badge && (
              <span className="rounded-full bg-red px-1.5 text-[11px] font-bold text-white">
                {i.badge}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-white/10 p-4">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-blue text-sm font-bold text-white">
            {user.name?.[0] || "U"}
          </span>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">
              {user.name}
            </p>
            <p className="text-xs capitalize text-slate-400">
              {user.role}
            </p>
          </div>

          <LogoutButton
            variant="ghost"
            className="h-9 px-2 text-slate-200 hover:bg-white/10 hover:text-white"
          />
        </div>
      </div>
    </div>
  )

  return (
    <div className="app-canvas min-h-screen xl:pl-64">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-white/10 shadow-[8px_0_32px_rgba(11,31,58,.08)] xl:block">
        {sidebar}
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 xl:hidden">
          <div
            className="absolute inset-0 bg-navy/60"
            onClick={() => setOpen(false)}
          />

        <aside className="absolute inset-y-0 left-0 w-[min(20rem,88vw)] shadow-2xl">
            {sidebar}
          </aside>
        </div>
      )}

      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-white/70 bg-white/80 px-4 shadow-[0_6px_22px_rgba(11,31,58,.07)] backdrop-blur-xl transition-[background-color,box-shadow] duration-300 xl:hidden">
        <button
          className="grid h-11 w-11 place-items-center rounded-xl hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
          aria-label="Open menu"
          onClick={() => setOpen(true)}
        >
          <Menu />
        </button>

        <span className="text-sm font-semibold text-navy">
          {title}
        </span>
      </header>

      <main className="mx-auto w-full min-w-0 max-w-[1440px] px-4 py-7 sm:px-7 xl:px-9 xl:py-9">
        <RouteTransition>
          <Outlet />
        </RouteTransition>
      </main>
    </div>
  )
}
