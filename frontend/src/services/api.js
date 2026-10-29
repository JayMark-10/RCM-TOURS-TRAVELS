// Keep production requests on the Pages origin so session cookies are
// first-party on mobile browsers. Vite proxies this path during development.
const API_BASE_URL = ""

const SERVER_ERROR_MESSAGE =
  "The server ran into a problem. Please try again in a moment."

// Turns a failed response into a safe, readable message.
// The backend sends errors as { error: "..." } (and { ref } for 5xx errors).
function readErrorMessage(result, status) {
  // Server-side failures (5xx): never show the server's own text.
  // The backend only sends a short reference code, which we show if it
  // looks like the expected 8-character code. Support can find it in the logs.
  if (status >= 500) {
    const ref =
      result && typeof result.ref === "string" && /^[a-f0-9]{8}$/.test(result.ref)
        ? result.ref
        : ""

    return ref
      ? `${SERVER_ERROR_MESSAGE} (Reference: ${ref})`
      : SERVER_ERROR_MESSAGE
  }

  // Client errors (4xx): the backend writes these messages on purpose.
  if (result && typeof result.error === "string" && result.error.trim()) {
    return result.error
  }

  // Accept { message } too, in case another route uses that shape.
  if (result && typeof result.message === "string" && result.message.trim()) {
    return result.message
  }

  if (status === 429) {
    return "Too many requests. Please wait a moment and try again."
  }

  return `The request could not be completed (status ${status}). Please try again.`
}

export async function apiRequest(path, options = {}) {
  let response

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      credentials: "include",
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    })
  } catch {
    // fetch only throws when the server cannot be reached at all.
    const error = new Error(
      "Cannot reach the server. Check your connection and try again.",
    )
    error.isNetworkError = true
    throw error
  }

  const result = await response.json().catch(() => ({}))

  if (!response.ok) {
    const error = new Error(readErrorMessage(result, response.status))
    error.status = response.status
    throw error
  }

  return result
}

// True when a failed request says nothing about the session itself: the server
// could not be reached, or it (or a proxy in front of it) failed or is busy.
// A 401 or 403 is NOT temporary: the backend answered and refused the session.
export function isTemporaryFailure(error) {
  if (!error) {
    return false
  }

  if (error.isNetworkError) {
    return true
  }

  const status = error.status

  return status === 408 || status === 429 || status >= 500
}

export function getApiBaseUrl() {
  return API_BASE_URL
}
