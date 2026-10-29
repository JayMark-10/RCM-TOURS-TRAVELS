import { useEffect, useRef } from "react"
import { useLocation, useNavigationType } from "react-router-dom"
import { shouldScrollToTop } from "../lib/navigation"

// Scrolls to the top on every page change, or to the section named in the URL hash (e.g. /#services).
function ScrollManager() {
  const { pathname, hash, key } = useLocation()
  const navigationType = useNavigationType()
  const previousLocation = useRef({ pathname, key })

  useEffect(() => {
    const routeChanged = previousLocation.current.pathname !== pathname
    const locationChanged = previousLocation.current.key !== key
    previousLocation.current = { pathname, key }
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches

    if (hash === "") {
      // Let browser history restore scroll on Back/Forward. Route changes from
      // links reset instantly so scrolling does not compete with page motion.
      if (shouldScrollToTop({ hash, locationChanged, navigationType })) {
        window.scrollTo({ top: 0, behavior: "auto" })
      }
      return
    }

    // Wait one tick for the destination page to render. Anchor-only movement
    // can remain smooth; cross-route movement is immediate to avoid a second
    // simultaneous animation while the page enters.
    const timer = window.setTimeout(() => {
      const section = document.getElementById(hash.slice(1))
      if (section) {
        section.scrollIntoView({
          behavior: routeChanged || reduceMotion || navigationType === "POP" ? "auto" : "smooth",
        })
      }
    }, 0)

    return () => window.clearTimeout(timer)
  }, [pathname, hash, key, navigationType])

  return null
}

export default ScrollManager
