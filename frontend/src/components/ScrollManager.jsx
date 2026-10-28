import { useEffect } from "react"
import { useLocation } from "react-router-dom"

// Scrolls to the top on every page change, or to the section named in the URL hash (e.g. /#services).
function ScrollManager() {
  const { pathname, hash } = useLocation()

  useEffect(() => {
    if (hash === "") {
      window.scrollTo(0, 0)
      return
    }

    // Wait one tick so the page has rendered before looking for the section.
    const timer = window.setTimeout(() => {
      const section = document.getElementById(hash.slice(1))
      if (section) {
        section.scrollIntoView({ behavior: "smooth" })
      }
    }, 0)

    return () => window.clearTimeout(timer)
  }, [pathname, hash])

  return null
}

export default ScrollManager
