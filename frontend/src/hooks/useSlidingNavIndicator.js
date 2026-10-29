import { useLayoutEffect } from "react"

export function useSlidingNavIndicator(navId, activeKey) {
  useLayoutEffect(() => {
    const navs = Array.from(
      document.querySelectorAll(`[data-sliding-nav="${navId}"]`),
    )

    function update() {
      for (const nav of navs) {
        if (nav.getClientRects().length === 0) continue

        const activeLink =
          nav.querySelector('[data-active-nav-link="true"]') ??
          nav.querySelector('a[aria-current="page"]')
        const indicator = nav.querySelector("[data-active-indicator]")
        if (!activeLink || !indicator) continue

        const navRect = nav.getBoundingClientRect()
        const linkRect = activeLink.getBoundingClientRect()
        const x = linkRect.left - navRect.left - nav.clientLeft
        const y = linkRect.top - navRect.top - nav.clientTop

        const isInitialPosition = indicator.dataset.ready !== "true"
        if (isInitialPosition) indicator.style.transition = "none"

        if (nav.dataset.indicatorAxis === "vertical") {
          indicator.style.height = `${linkRect.height}px`
          indicator.style.transform = `translate3d(0, ${y}px, 0)`
        } else {
          indicator.style.width = `${linkRect.width}px`
          indicator.style.height = `${linkRect.height}px`
          indicator.style.transform = `translate3d(${x}px, ${y}px, 0)`
        }

        if (isInitialPosition) {
          void indicator.offsetWidth
          indicator.style.removeProperty("transition")
          indicator.dataset.ready = "true"
        }
      }
    }

    update()
    window.addEventListener("resize", update)
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update)
    for (const nav of navs) observer?.observe(nav)

    return () => {
      window.removeEventListener("resize", update)
      observer?.disconnect()
    }
  }, [navId, activeKey])
}
