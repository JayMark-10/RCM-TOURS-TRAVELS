import { useLocation } from "react-router-dom"

export function RouteTransition({ children }) {
  const { pathname } = useLocation()

  return (
    <div key={pathname} className="route-page-enter">
      {children}
    </div>
  )
}
