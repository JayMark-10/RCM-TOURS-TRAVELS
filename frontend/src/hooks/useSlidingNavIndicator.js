import { useLayoutEffect } from "react"

export function useSlidingNavIndicator(navId, activeKey) {
  useLayoutEffect(() => {
    const navs = Array.from(
      document.querySelectorAll(`[data-sliding-nav="${navId}"]`),
    )
    let disposed = false
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update)

    function update() {
      for (const nav of navs) {
        if (nav.getClientRects().length === 0) continue

        const activeLink =
          nav.querySelector('[data-active-nav-link="true"]') ??
          nav.querySelector('a[aria-current="page"]')
        const indicator = nav.querySelector("[data-active-indicator]")
        if (!activeLink || !indicator) continue
        observer?.observe(activeLink)

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
    for (const nav of navs) observer?.observe(nav)
    document.fonts?.addEventListener?.("loadingdone", update)
    document.fonts?.ready?.then(() => {
      if (!disposed) update()
    })

    return () => {
      disposed = true
      window.removeEventListener("resize", update)
      document.fonts?.removeEventListener?.("loadingdone", update)
      observer?.disconnect()
    }
  }, [navId, activeKey])
}
