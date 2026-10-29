import { Menu, Plane, X } from "lucide-react"
import { useEffect, useState } from "react"
import { Link, Outlet, useLocation } from "react-router-dom"
import { ButtonLink } from "../components/ui"
import { RouteTransition } from "../components/RouteTransition"
import { useStore } from "../lib/store"
import { getHomeDestination } from "../lib/navigation"
import { useSlidingNavIndicator } from "../hooks/useSlidingNavIndicator"
export function Logo({ dark, to = "/", onClick }) {
  const [imageFailed, setImageFailed] = useState(false)
  return (
    <Link to={to} onClick={onClick} className="group flex items-center gap-3" aria-label="RCM Travel and Tours home">
      <span className="relative grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-navy shadow-sm ring-1 ring-navy/10">
        {!imageFailed && <img src="/images/home/logo.jfif" alt="" className="absolute inset-0 h-full w-full object-cover" onError={() => setImageFailed(true)} />}
        {imageFailed && <span className="grid h-full w-full place-items-center bg-red text-white"><Plane size={20} /></span>}
      </span>
      <span className={`leading-tight ${dark ? "text-white" : "text-navy"}`}>
        <span className="block text-[15px] font-bold tracking-tight group-hover:text-red">
          RCM Travel &amp; Tours
        </span>
        <span
          className={`block text-[11px] font-medium ${
            dark ? "text-slate-400" : "text-muted"
          }`}
        >
          Service Request System
        </span>
      </span>
    </Link>
  )
}
const links = [
  ["Home", "/"],
  ["Services", "/#services"],
  ["Destinations", "/#destinations"],
  ["About", "/#how"],
  ["Contact", "/#contact"],
]
export function PublicLayout() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const { user } = useStore()
  const { hash, pathname } = useLocation()
  const isHome = pathname === "/"
  useSlidingNavIndicator("public-primary", `${pathname}${hash}:${open}`)

  useEffect(() => {
    setOpen(false)

    if (!isHome) {
      setScrolled(false)
      return
    }

    function updateScrolled() {
      setScrolled(window.scrollY > 24)
    }

    updateScrolled()
    window.addEventListener("scroll", updateScrolled, { passive: true })
    return () => window.removeEventListener("scroll", updateScrolled)
  }, [isHome, pathname, hash])

  const home = user ? getHomeDestination(user.role) : "/signin"
  const active = (to) =>
    to === "/" ? pathname === "/" && !hash : to === `/${hash}`
  return (
    <div className="min-h-screen bg-white">
      <header
        className={`${
          isHome ? "fixed inset-x-0 top-0" : "sticky top-0"
        } z-40 border-b backdrop-blur-xl transition-[background-color,border-color,box-shadow] duration-300 ease-[cubic-bezier(.2,.7,.2,1)] ${
          isHome && !scrolled
            ? "border-transparent bg-navy/15 shadow-none"
            : "border-line/80 bg-white/90 shadow-[0_8px_28px_rgba(11,31,58,.08)]"
        }`}
      >
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between gap-3 px-4 sm:h-[76px] sm:px-8">
          <Logo dark={isHome && !scrolled} />
          <nav
            aria-label="Primary navigation"
            data-sliding-nav="public-primary"
            className="relative hidden items-center gap-0.5 rounded-full border border-white/70 bg-white/85 p-1 shadow-[0_8px_28px_rgba(11,31,58,.12)] backdrop-blur-xl transition-[background-color,box-shadow] duration-300 ease-[cubic-bezier(.2,.7,.2,1)] lg:flex"
          >
            <span
              aria-hidden="true"
              data-active-indicator
              className="nav-active-indicator absolute left-0 top-0 z-0 rounded-full bg-blue shadow-[0_4px_12px_rgba(31,95,175,.22)]"
            />
            {links.map(([l, to]) => (
              <Link
                key={l}
                to={to}
                aria-current={active(to) ? "page" : undefined}
                data-active-nav-link={active(to) ? "true" : undefined}
                className={`relative z-10 rounded-full px-3 py-2.5 text-[13px] font-semibold transition-colors duration-200 ease-[cubic-bezier(.2,.7,.2,1)] sm:px-3.5 ${
                  active(to)
                    ? "text-white"
                    : "text-ink hover:bg-white hover:text-blue"
                }`}
              >
                {l}
              </Link>
            ))}
          </nav>
          <div className="hidden items-center gap-1.5 lg:flex">
            <ButtonLink
              to={home}
              variant="ghost"
              className={`rounded-full ${
                isHome && !scrolled ? "text-white hover:bg-white/15 hover:text-white" : ""
              }`}
            >
              {user ? "My Workspace" : "Sign In"}
            </ButtonLink>
            <ButtonLink to="/portal/new" className="rounded-full">
              Request a Service
            </ButtonLink>
          </div>
          <button
            aria-label="Menu"
            aria-expanded={open}
            className={`grid h-11 w-11 place-items-center rounded-full border transition-[background-color,border-color,color,box-shadow] duration-200 ease-[cubic-bezier(.2,.7,.2,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue lg:hidden ${
              isHome && !scrolled
                ? "border-white/30 bg-white/10 text-white hover:bg-white/20"
                : "border-line/80 bg-white/80 text-navy shadow-sm hover:bg-white"
            }`}
            onClick={() => setOpen(!open)}
          >
            {open ? <X /> : <Menu />}
          </button>
        </div>
        {open && (
          <div className="animate-[public-menu-enter_180ms_cubic-bezier(.2,.7,.2,1)_both] border-t border-line/70 bg-white/95 px-4 py-3 shadow-[0_16px_30px_rgba(11,31,58,.1)] backdrop-blur-2xl lg:hidden">
            <nav aria-label="Mobile navigation" data-sliding-nav="public-primary" className="relative mx-auto max-w-7xl space-y-1">
              <span
                aria-hidden="true"
                data-active-indicator
                className="nav-active-indicator absolute left-0 top-0 z-0 rounded-xl bg-blue/10"
              />
              {links.map(([l, to]) => (
                <Link
                  key={l}
                  to={to}
                  onClick={() => setOpen(false)}
                  data-active-nav-link={active(to) ? "true" : undefined}
                  className={`relative z-10 block rounded-xl px-3 py-3 text-sm font-semibold transition-[background-color,color] duration-200 ${
                    active(to) ? "text-blue" : "text-ink hover:bg-slate-50"
                  }`}
                >
                  {l}
                </Link>
              ))}
              <div className="flex gap-2 pt-2">
                <ButtonLink
                  to={home}
                  variant="outline"
                  className="flex-1 rounded-full"
                  onClick={() => setOpen(false)}
                >
                  {user ? "My Workspace" : "Sign In"}
                </ButtonLink>
                <ButtonLink
                  to="/portal/new"
                  className="flex-1 rounded-full"
                  onClick={() => setOpen(false)}
                >
                  Request a Service
                </ButtonLink>
              </div>
            </nav>
          </div>
        )}
      </header>
      <RouteTransition>
        <Outlet />
      </RouteTransition>
    </div>
  )
}
