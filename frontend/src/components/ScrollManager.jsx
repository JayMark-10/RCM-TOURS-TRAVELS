import { useEffect, useRef } from "react"
import { useLocation, useNavigationType } from "react-router-dom"

// Scrolls to the top on every page change, or to the section named in the URL hash (e.g. /#services).
function ScrollManager() {
  const { pathname, hash } = useLocation()
  const navigationType = useNavigationType()
  const previousPathname = useRef(pathname)

  useEffect(() => {
    const routeChanged = previousPathname.current !== pathname
    previousPathname.current = pathname
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches

    if (hash === "") {
      // Let browser history restore scroll on Back/Forward. Route changes from
      // links reset instantly so scrolling does not compete with page motion.
      if (routeChanged && navigationType !== "POP") {
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
          behavior: routeChanged || reduceMotion ? "auto" : "smooth",
        })
      }
    }, 0)

    return () => window.clearTimeout(timer)
  }, [pathname, hash, navigationType])

  return null
}

export default ScrollManager
