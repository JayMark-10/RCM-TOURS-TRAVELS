import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"
import { apiRequest, isTemporaryFailure } from "../services/api"

const AUTH_UNREACHABLE_MESSAGE =
  "We could not verify your session because the server is unreachable. Your session may still be valid. Check your connection and retry."

const Ctx = createContext(null)

export const useStore = () => {
  const c = useContext(Ctx)

  if (!c) {
    throw new Error("StoreProvider missing")
  }

  return c
}

export function StoreProvider({ children }) {
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  // Set only when the session check failed because the server could not be
  // reached (or failed). It means "session not verified", never "signed in".
  const [authError, setAuthError] = useState(null)

  const [users, setUsers] = useState([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [usersError, setUsersError] = useState("")
  const [directoryRetry, setDirectoryRetry] = useState(0)
  const [services, setServices] = useState([])
  const [servicesLoading, setServicesLoading] = useState(true)
  const [servicesError, setServicesError] = useState("")
  const [servicesRetry, setServicesRetry] = useState(0)
  const [requests, setRequests] = useState([])
  const [requestsLoading, setRequestsLoading] = useState(false)
  const [requestsError, setRequestsError] = useState("")
  const [requestRetry, setRequestRetry] = useState(0)
  const [notifications, setNotifications] = useState([])
  const [logs, setLogs] = useState([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsError, setLogsError] = useState("")
  const [logsPagination, setLogsPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 1 })

  const [toast, setToast] = useState(null)

  const [settings, setSettings] = useState({
    companyName: "RCM Travel and Tours",
    contactEmail: "",
    contactPhone: "",
    address: "",
    disclaimer:
      "Submitting a request does not guarantee booking confirmation. Payments are handled outside this system.",
    allowRegistration: true,
    paymentMethods: [],
  })
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [settingsError, setSettingsError] = useState("")
  const [settingsRetry, setSettingsRetry] = useState(0)

  const toastTimer = useRef(null)

  // Identifies the newest session check so older, slower responses are ignored.
  const authRequestId = useRef(0)
  const settingsRequestId = useRef(0)
  const logsRequestId = useRef(0)

  // Ask the backend who the current user is.
  // - 200: use the returned user (or none).
  // - 401/403 and other confirmed rejections: the session is invalid, so sign out.
  // - Network failure or server/proxy failure: the session is NOT verified, but
  //   it is not known to be invalid either, so keep the user as is and show a
  //   connection error with a retry instead of redirecting to sign in.
  const restoreSession = useCallback(async () => {
    authRequestId.current += 1
    const requestId = authRequestId.current

    setAuthLoading(true)
    setAuthError(null)

    try {
      const result = await apiRequest("/api/auth/me")

      if (requestId !== authRequestId.current) {
        return
      }

      setUser(result.user ?? null)
    } catch (error) {
      if (requestId !== authRequestId.current) {
        return
      }

      if (isTemporaryFailure(error)) {
        setAuthError(AUTH_UNREACHABLE_MESSAGE)
      } else {
        setUser(null)
      }
    } finally {
      if (requestId === authRequestId.current) {
        setAuthLoading(false)
      }
    }
  }, [])

  // Restore the authenticated user from the backend.
  useEffect(() => {
    restoreSession()

    return () => {
      // Ignore any response that arrives after unmount.
      authRequestId.current += 1
    }
  }, [restoreSession])

  // Load only records visible to the authenticated account.
  useEffect(() => {
    if (authLoading) {
      return
    }

    if (!user?.id) {
      setRequests([])
      setRequestsLoading(false)
      setRequestsError("")
      return
    }

    let isMounted = true
    setRequests([])
    setRequestsLoading(true)
    setRequestsError("")

    async function loadRequests() {
      try {
        const result = await apiRequest("/api/requests")

        if (!Array.isArray(result.requests)) {
          throw new Error("Invalid request list returned by the server.")
        }

        if (isMounted) {
          setRequests(result.requests)
        }
      } catch (error) {
        if (isMounted) {
          console.error("Failed to load customer requests:", error)
          setRequestsError(error.message || "Unable to load requests.")
          notify("Unable to load requests. Please refresh and try again.")
        }
      } finally {
        if (isMounted) setRequestsLoading(false)
      }
    }

    loadRequests()

    return () => {
      isMounted = false
    }
  }, [authLoading, user?.id, user?.role, requestRetry])

  useEffect(() => {
    if (authLoading) return
    if (!user?.id || user.role === "customer") {
      setUsers([])
      setUsersLoading(false)
      setUsersError("")
      return
    }
    let isMounted = true
    setUsers([])
    setUsersLoading(true)
    setUsersError("")

    const path = user.role === "admin" ? "/api/users" : "/api/users/directory"
    apiRequest(path)
      .then((result) => {
        if (!Array.isArray(result.users)) throw new Error("Invalid account directory returned by the server.")
        if (isMounted) setUsers(result.users)
      })
      .catch((error) => {
        if (isMounted) {
          console.error("Failed to load user directory:", error)
          setUsersError(error.message || "Unable to load account directory.")
          notify("Unable to load account directory. Please retry.")
        }
      })
      .finally(() => {
        if (isMounted) setUsersLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [authLoading, user?.id, user?.role, directoryRetry])

  useEffect(() => {
    let isMounted = true
    setServicesLoading(true)
    setServicesError("")
    const path = !user ? "/api/services" : user.role === "admin" ? "/api/services/admin" : "/api/services/workspace"
    apiRequest(path)
      .then((result) => {
        if (!Array.isArray(result.services)) throw new Error("Invalid service catalog returned by the server.")
        if (isMounted) setServices(result.services)
      })
      .catch((error) => {
        if (isMounted) {
          setServicesError(error.message || "Unable to load services.")
          setServices([])
        }
      })
      .finally(() => {
        if (isMounted) setServicesLoading(false)
      })
    return () => { isMounted = false }
  }, [user?.role, servicesRetry])

  useEffect(() => {
    if (authLoading) return
    const requestId = ++settingsRequestId.current
    let isMounted = true
    setSettingsLoading(true)
    setSettingsError("")
    apiRequest("/api/settings")
      .then((result) => {
        if (!result.settings || typeof result.settings !== "object") throw new Error("Invalid settings returned by the server.")
        if (isMounted && requestId === settingsRequestId.current) setSettings(result.settings)
      })
      .catch((error) => {
        if (isMounted && requestId === settingsRequestId.current) setSettingsError(error.message || "Unable to load system settings.")
      })
      .finally(() => {
        if (isMounted && requestId === settingsRequestId.current) setSettingsLoading(false)
      })
    return () => { isMounted = false }
  }, [authLoading, user?.id, user?.role, settingsRetry])

  const loadLogs = useCallback(async (filters = {}) => {
    const requestId = ++logsRequestId.current
    const query = new URLSearchParams()
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null && value !== "") query.set(key, String(value))
    }
    const queryString = query.toString()
    setLogsLoading(true)
    setLogsError("")
    try {
      const result = await apiRequest(`/api/audit-events${queryString ? `?${queryString}` : ""}`)
      if (!Array.isArray(result.events) || !result.pagination) throw new Error("Invalid audit events returned by the server.")
      if (requestId === logsRequestId.current) {
        setLogs(result.events)
        setLogsPagination(result.pagination)
      }
    } catch (error) {
      if (requestId === logsRequestId.current) setLogsError(error.message || "Unable to load activity history.")
    } finally {
      if (requestId === logsRequestId.current) setLogsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (authLoading) return
    if (user?.role !== "admin") {
      logsRequestId.current += 1
      setLogs([])
      setLogsLoading(false)
      setLogsError("")
      setLogsPagination({ page: 1, limit: 50, total: 0, totalPages: 1 })
      return
    }
    void loadLogs()
    return () => { logsRequestId.current += 1 }
  }, [authLoading, user?.id, user?.role, loadLogs])

  useEffect(() => {
    if (authLoading || !user?.id) return
    if (user.role !== "customer") {
      setNotifications([])
      return
    }
    let isMounted = true
    setNotifications([])
    apiRequest("/api/notifications")
      .then((result) => {
        if (isMounted && Array.isArray(result.notifications)) {
          setNotifications(result.notifications.map((item) => ({
            ...item,
            userId: user.id,
          })))
        }
      })
      .catch((error) => {
        if (isMounted) {
          console.error("Failed to load notifications:", error)
          notify("Unable to load notifications. Please retry.")
        }
      })
    return () => {
      isMounted = false
    }
  }, [authLoading, user?.id, user?.role])

  // Clear the toast timer when the provider unmounts.
  useEffect(
    () => () => {
      if (toastTimer.current) {
        window.clearTimeout(toastTimer.current)
      }
    },
    [],
  )

  const notify = useCallback((msg) => {
    setToast(msg)

    if (toastTimer.current) {
      window.clearTimeout(toastTimer.current)
    }

    toastTimer.current = window.setTimeout(() => {
      setToast(null)
    }, 3200)
  }, [])

  const refreshUserDirectory = useCallback(
    () => setDirectoryRetry((current) => current + 1),
    [],
  )
  const refreshRequests = useCallback(
    () => setRequestRetry((current) => current + 1),
    [],
  )
  const refreshServices = useCallback(
    () => setServicesRetry((current) => current + 1),
    [],
  )
  const refreshSettings = useCallback(
    () => setSettingsRetry((current) => current + 1),
    [],
  )

  // Loads ONE request from the backend (customer-only endpoint) and puts the
  // server's version into state. It has no dependencies on purpose, so its
  // identity stays the same between renders and it is safe to use in an effect.
  // Errors are thrown to the caller; the error has a "status" for HTTP failures.
  const fetchRequestById = useCallback(async (id) => {
    const result = await apiRequest(
      `/api/requests/${encodeURIComponent(id)}`,
    )

    const request = result?.request

    if (!request || typeof request !== "object" || request.id !== id) {
      throw new Error("The server returned an unexpected response.")
    }

    setRequests((currentRequests) =>
      currentRequests.some((item) => item.id === request.id)
        ? currentRequests.map((item) =>
            item.id === request.id ? request : item,
          )
        : [request, ...currentRequests],
    )

    return request
  }, [])

  const applyServerRequest = useCallback((request) => {
    if (!request || typeof request !== "object" || !request.id) {
      throw new Error("The server did not return the saved request.")
    }

    setRequests((currentRequests) =>
      currentRequests.some((item) => item.id === request.id)
        ? currentRequests.map((item) =>
            item.id === request.id ? request : item,
          )
        : [request, ...currentRequests],
    )

    return request
  }, [])

  const value = {
    user,
    authLoading,
    authError,
    requestsLoading,
    requestsError,
    refreshRequests,
    usersLoading,
    usersError,
    refreshUserDirectory,
    servicesLoading,
    servicesError,
    refreshServices,
    settingsLoading,
    settingsError,
    refreshSettings,
    logsLoading,
    logsError,
    loadLogs,
    logsPagination,

    // Check the session again after a connection error.
    retryAuth: restoreSession,

    signIn: (authenticatedUser) => {
      // A successful sign in replaces any session check still in progress.
      authRequestId.current += 1
      setAuthError(null)
      setAuthLoading(false)
      setUser(authenticatedUser)
    },

    signOut: async () => {
      const result = await apiRequest("/api/auth/logout", {
        method: "POST",
      })

      if (result?.ok !== true) {
        throw new Error("The server did not confirm logout. Please try again.")
      }

      authRequestId.current += 1
      setAuthError(null)
      setAuthLoading(false)
      setUser(null)
      setRequests([])
      setUsers([])
      setRequestsLoading(false)
      setRequestsError("")
      setUsersLoading(false)
      setUsersError("")
      setNotifications([])
      setServices([])
      setLogs([])
    },

    users,
    services,
    requests,
    notifications,
    logs,
    settings,
    toast,
    notify,

    fetchRequestById,

    // Submit online requests to the backend.
    submitRequest: async (i) => {
      const payload = {
        serviceId: i.serviceId,
        source: i.source,
        customerId: i.customerId || undefined,
        customer: i.customer || undefined,
        internalNote: i.internalNote || undefined,
        details: i.details ?? {},
        dateFrom: i.dateFrom || "",
        dateTo: i.dateTo || "",
        description: i.description,
        documents: [],
        checklist: i.checklist ?? [],
      }
      const result = await apiRequest("/api/requests", {
        method: "POST",
        body: JSON.stringify(payload),
      })
      const request = applyServerRequest(result.request)
      const uploadErrors = []
      for (const file of (i.documents ?? []).filter((item) => item instanceof File)) {
        try {
          if (file.size > 20 * 1024 * 1024) throw new Error(`${file.name} exceeds the 20 MB limit.`)
          const data = await new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result)
            reader.onerror = () => reject(new Error(`Could not read ${file.name}.`))
            reader.readAsDataURL(file)
          })
          await apiRequest(`/api/requests/${request.id}/documents`, {
            method: "POST",
            body: JSON.stringify({ name: file.name, type: file.type, data }),
          })
        } catch (error) { uploadErrors.push(`${file.name}: ${error.message}`) }
      }
      return { ...request, uploadErrors }
    },

    updateStatus: async (id, status, text, confirmationRecord) => {
      const result = await apiRequest(`/api/requests/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status, note: text, confirmationRecord }),
      })
      const request = applyServerRequest(result.request)
      return request
    },

    assign: async (id, staffId) => {
      const result = await apiRequest(`/api/requests/${id}/assignment`, {
        method: "PATCH",
        body: JSON.stringify({ staffId }),
      })
      const request = applyServerRequest(result.request)
      return request
    },

    customerMessage: async (id, text, files = []) => {
      const uploadErrors = []
      for (const file of files.filter((item) => item instanceof File)) {
        try {
          if (file.size > 20 * 1024 * 1024) throw new Error(`${file.name} exceeds the 20 MB limit.`)
          const data = await new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result)
            reader.onerror = () => reject(new Error(`Could not read ${file.name}.`))
            reader.readAsDataURL(file)
          })
          await apiRequest(`/api/requests/${id}/documents`, { method: "POST", body: JSON.stringify({ name: file.name, type: file.type, data }) })
        } catch (error) { uploadErrors.push(`${file.name}: ${error.message}`) }
      }
      const result = await apiRequest(`/api/requests/${id}/messages`, {
        method: "POST",
        body: JSON.stringify({
          text,
          documents: [],
        }),
      })
      const request = applyServerRequest(result.request)
      return { ...request, uploadErrors }
    },

    staffMessage: async (id, text, status) => {
      const result = await apiRequest(`/api/requests/${id}/messages`, {
        method: "POST",
        body: JSON.stringify({ text, status }),
      })
      const request = applyServerRequest(result.request)
      return request
    },

    addNote: async (id, text) => {
      const result = await apiRequest(`/api/requests/${id}/notes`, {
        method: "POST",
        body: JSON.stringify({ text }),
      })
      const request = applyServerRequest(result.request)
      return request
    },

    toggleChecklist: async (id, index) => {
      const request = requests.find((item) => item.id === id)
      const item = request?.checklist?.[index]
      if (!item) return
      const result = await apiRequest(`/api/requests/${id}/checklist`, {
        method: "PATCH",
        body: JSON.stringify({ label: item.label, received: !item.received }),
      })
      return applyServerRequest(result.request)
    },

    saveQuotation: async (id, quotation) => {
      const result = await apiRequest(`/api/requests/${id}/quotation`, {
        method: "PUT",
        body: JSON.stringify({ quotation }),
      })
      const request = applyServerRequest(result.request)
      return request
    },

    sendQuotation: async (id) => {
      const result = await apiRequest(`/api/requests/${id}/quotation/send`, {
        method: "POST",
      })
      const request = applyServerRequest(result.request)
      return request
    },

    respondQuotation: async (id, accept) => {
      const result = await apiRequest(`/api/requests/${id}/quotation/respond`, {
        method: "POST",
        body: JSON.stringify({ accept }),
      })
      const request = applyServerRequest(result.request)
      return request
    },

    cancelOwn: async (id) => {
      const result = await apiRequest(`/api/requests/${id}/cancel`, {
        method: "POST",
      })
      const request = applyServerRequest(result.request)
      return request
    },

    markRead: async (id) => {
      try {
        if (id) {
          await apiRequest(`/api/notifications/${id}/read`, { method: "PATCH" })
        } else {
          await apiRequest("/api/notifications/read-all", { method: "PATCH" })
        }
        setNotifications((currentNotifications) => currentNotifications.map((notification) =>
          !id || notification.id === id ? { ...notification, read: true } : notification,
        ))
      } catch (error) {
        notify(error.message || "Unable to update notifications.")
      }
    },

    saveService: async (service) => {
      const result = await apiRequest(`/api/services/${encodeURIComponent(service.id)}`, {
        method: "PUT",
        body: JSON.stringify(service),
      })
      setServices((currentServices) => currentServices.some((item) => item.id === result.service.id)
        ? currentServices.map((item) => item.id === result.service.id ? result.service : item)
        : [...currentServices, result.service])
      return result.service
    },

    updateProfile: async (profile) => {
      const result = await apiRequest("/api/users/me", {
        method: "PATCH",
        body: JSON.stringify(profile),
      })
      setUser(result.user)
      return result.user
    },

    toggleUser: async (id) => {
      const target = users.find((item) => item.id === id)
      if (!target) return
      const result = await apiRequest(`/api/users/${id}/active`, {
        method: "PATCH",
        body: JSON.stringify({ active: !target.active }),
      })
      setUsers((currentUsers) => currentUsers.map((item) => item.id === id ? result.user : item))
      return result.user
    },

    toggleAssign: async (id) => {
      const target = users.find((item) => item.id === id)
      if (!target) return
      const result = await apiRequest(`/api/users/${id}/assignment-permission`, {
        method: "PATCH",
        body: JSON.stringify({ canAssign: !target.canAssign }),
      })
      setUsers((currentUsers) => currentUsers.map((item) => item.id === id ? result.user : item))
      return result.user
    },

    createStaffInvitation: async (email) => {
      const result = await apiRequest("/api/invitations", {
        method: "POST",
        body: JSON.stringify({ role: "staff", email }),
      })
      return result
    },

    saveSettings: async (newSettings) => {
      const result = await apiRequest("/api/settings", {
        method: "PATCH",
        body: JSON.stringify(newSettings),
      })
      setSettings(result.settings)
      setSettingsError("")
      return result.settings
    },
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
