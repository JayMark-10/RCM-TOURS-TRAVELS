export function getHomeDestination(role) {
  switch (role) {
    case "customer":
      return "/portal"
    case "staff":
      return "/staff"
    case "admin":
      return "/admin"
    default:
      return "/"
  }
}

export function shouldScrollToTop({ hash, locationChanged, navigationType }) {
  return hash === "" && locationChanged && navigationType !== "POP"
}
