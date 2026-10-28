import { LogOut } from "lucide-react"
import { useRef, useState } from "react"
import { useNavigate } from "react-router-dom"

import { useStore } from "../lib/store"
import { Button, Modal } from "./ui"

export function LogoutButton({ className = "", variant = "outline", size = "sm", compact = false }) {
  const { signOut } = useStore()
  const navigate = useNavigate()
  const logoutInProgress = useRef(false)
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")

  function closeDialog() {
    if (pending) return
    setOpen(false)
    setError("")
  }

  async function confirmLogout() {
    if (logoutInProgress.current) return
    logoutInProgress.current = true
    setPending(true)
    setError("")

    try {
      await signOut()
      setOpen(false)
      navigate("/signin", { replace: true })
    } catch (logoutError) {
      setError(logoutError.message || "Unable to log out. Please try again.")
    } finally {
      logoutInProgress.current = false
      setPending(false)
    }
  }

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        aria-label={compact ? "Log out" : undefined}
        aria-haspopup="dialog"
        onClick={() => {
          setError("")
          setOpen(true)
        }}
      >
        <LogOut size={16} aria-hidden="true" />
        <span className={compact ? "hidden sm:inline" : ""}>Log out</span>
      </Button>

      <Modal
        open={open}
        onClose={closeDialog}
        title="Log out?"
        footer={
          <>
            <Button variant="outline" disabled={pending} onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={pending}
              aria-busy={pending}
              onClick={confirmLogout}
            >
              <LogOut size={15} aria-hidden="true" />
              {pending ? "Logging out..." : "Log out"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">
          Are you sure you want to log out of your account?
        </p>
        {error && (
          <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">
            {error}
          </p>
        )}
      </Modal>
    </>
  )
}