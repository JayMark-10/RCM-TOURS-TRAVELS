import { useLayoutEffect, useRef } from "react"
import { useLocation } from "react-router-dom"

export function RouteTransition({ children }) {
  const { pathname } = useLocation()
  const pageRef = useRef(null)
  const previousPathname = useRef(pathname)

  useLayoutEffect(() => {
    if (previousPathname.current === pathname) return
    previousPathname.current = pathname

    const page = pageRef.current
    if (
      !page ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      typeof page.animate !== "function"
    ) {
      return
    }

    const animation = page.animate(
      [
        { opacity: 0, transform: "translateY(4px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      {
        duration: 220,
        easing: "cubic-bezier(0.2, 0.7, 0.2, 1)",
      },
    )

    return () => animation.cancel()
  }, [pathname])

  return (
    <div ref={pageRef} className="route-transition-content">
      {children}
    </div>
  )
}
