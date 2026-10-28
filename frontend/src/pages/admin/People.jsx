import { useState } from "react"

import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Toggle,
} from "../../components/ui"

import { useStore } from "../../lib/store"
import { CLOSED } from "../../utils/workflow"

export function UserManagement() {
  const {
    users,
    usersLoading,
    usersError,
    user,
    toggleUser,
    notify,
  } = useStore()

  const [searchText, setSearchText] = useState("")
  const [selectedRole, setSelectedRole] = useState("")
  const [actionError, setActionError] = useState("")
  const [busyId, setBusyId] = useState("")

  const filteredUsers = users.filter((account) => {
    const matchesRole =
      !selectedRole || account.role === selectedRole

    const searchableText = (
      account.name + account.email
    ).toLowerCase()

    const matchesSearch = searchableText.includes(
      searchText.toLowerCase(),
    )

    return matchesRole && matchesSearch
  })

  async function handleUserToggle(account) {
    if (account.id === user.id) {
      return
    }

    setBusyId(account.id)
    setActionError("")
    try {
      await toggleUser(account.id)
      notify(account.active ? "Account deactivated." : "Account activated.")
    } catch (error) {
      setActionError(error.message || "Unable to update account status.")
    } finally {
      setBusyId("")
    }
  }

  const tableHeaders = [
    "User",
    "Role",
    "Last active",
    "Active",
  ]

  const availableRoles = [
    "customer",
    "staff",
    "admin",
  ]

  return (
    <>
      <PageHeader
        title="User Management"
        sub="Manage account access. Staff access is granted through invitations."
      />

      <Card>
        {actionError && <p className="p-4 text-sm text-red-700" role="alert">{actionError}</p>}
        {usersLoading ? (
          <p role="status" className="p-6 text-center text-sm text-muted">Loading accounts...</p>
        ) : usersError ? (
          <p role="alert" className="p-6 text-sm text-red-700">Accounts could not be loaded: {usersError}</p>
        ) : (
        <>
        <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-[1fr_200px]">
          <Input
            aria-label="Search users"
            placeholder="Search name or email"
            value={searchText}
            onChange={(event) => {
              setSearchText(event.target.value)
            }}
          />

          <Select
            aria-label="Role"
            value={selectedRole}
            onChange={(event) => {
              setSelectedRole(event.target.value)
            }}
            options={availableRoles}
            placeholder="All roles"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-muted">
              <tr>
                {tableHeaders.map((header) => (
                  <th
                    key={header}
                    className="px-4 py-3 font-medium"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-line">
              {filteredUsers.map((account) => (
                <tr key={account.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium">
                      {account.name}
                    </p>

                    <p className="text-xs text-muted">
                      {account.email}
                    </p>
                  </td>

                  <td className="px-4 py-3">
                    <span className="capitalize">{account.role}</span>
                  </td>

                  <td className="whitespace-nowrap px-4 py-3 text-muted">
                    {account.lastActive ? new Date(account.lastActive).toLocaleDateString() : "Never"}
                  </td>

                  <td className="px-4 py-3">
                    <Toggle
                      label={`Active: ${account.name}`}
                      checked={account.active}
                      disabled={(account.role === "admin" && account.active) || busyId === account.id}
                      onChange={() => {
                        handleUserToggle(account)
                      }}
                    />
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && (
                <tr><td colSpan={4} className="p-6 text-center text-sm text-muted">No accounts match this filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        </>
        )}
      </Card>
    </>
  )
}

export function StaffManagement() {
  const {
    users,
    usersLoading,
    usersError,
    requests,
    toggleAssign,
    createStaffInvitation,
    notify,
  } = useStore()

  const staffMembers = users.filter((account) => {
    return account.role === "staff"
  })

  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [staffEmail, setStaffEmail] = useState("")
  const [issuedKey, setIssuedKey] = useState("")
  const [inviteError, setInviteError] = useState("")
  const [creatingInvite, setCreatingInvite] = useState(false)
  const [assignmentError, setAssignmentError] = useState("")

  function closeAddModal() {
    setIsAddModalOpen(false)
    setIssuedKey("")
    setInviteError("")
    setStaffEmail("")
  }

  async function handleAddStaff() {
    setCreatingInvite(true)
    setInviteError("")
    try {
      const result = await createStaffInvitation(staffEmail.trim())
      setIssuedKey(result.key)
      notify("Staff invitation created.")
    } catch (error) {
      setInviteError(error.message || "Unable to create staff invitation.")
    } finally {
      setCreatingInvite(false)
    }
  }

  async function handleAssignmentToggle(staffId) {
    setAssignmentError("")
    try {
      await toggleAssign(staffId)
    } catch (error) {
      setAssignmentError(error.message || "Unable to update assignment permission.")
    }
  }

  function getOpenAssignedCount(staffId) {
    return requests.filter((request) => {
      const isAssignedToStaff = request.assignedTo === staffId
      const isStillOpen = !CLOSED.includes(request.status)

      return isAssignedToStaff && isStillOpen
    }).length
  }

  return (
    <>
      <PageHeader
        title="Staff Management"
        sub="Workload and authorization for staff accounts."
        action={
          <Button
            variant="blue"
            onClick={() => setIsAddModalOpen(true)}
          >
            Add staff
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {usersLoading ? (
          <p role="status" className="text-sm text-muted">Loading staff accounts...</p>
        ) : usersError ? (
          <p role="alert" className="text-sm text-red-700">Staff accounts could not be loaded: {usersError}</p>
        ) : staffMembers.map((staffMember) => {
          const openRequestCount = getOpenAssignedCount(
            staffMember.id,
          )

          return (
            <Card
              key={staffMember.id}
              className="p-5"
            >
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-full bg-blue font-bold text-white">
                  {staffMember.name[0]}
                </span>

                <div className="min-w-0">
                  <p className="font-semibold">
                    {staffMember.name}
                  </p>

                  <p className="truncate text-xs text-muted">
                    {staffMember.email}
                  </p>
                </div>

                {!staffMember.active && (
                  <Badge className="ml-auto bg-zinc-100 text-zinc-600 ring-zinc-200">
                    Inactive
                  </Badge>
                )}
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-line pt-4 text-sm">
                <span className="text-muted">
                  Open assigned requests
                </span>

                <span className="font-bold text-navy">
                  {openRequestCount}
                </span>
              </div>

              <div className="mt-3 flex items-center justify-between text-sm">
                <span className="text-muted">
                  Can assign requests
                </span>

                <Toggle
                  label={`Can assign: ${staffMember.name}`}
                  checked={!!staffMember.canAssign}
                  onChange={() => {
                    handleAssignmentToggle(staffMember.id)
                  }}
                />
              </div>
            </Card>
          )
        })}
      </div>

      {assignmentError && <p role="alert" className="mt-4 text-sm text-red-700">{assignmentError}</p>}

      <Modal
        open={isAddModalOpen}
        onClose={closeAddModal}
        title={issuedKey ? "Staff invitation created" : "Invite staff member"}
        footer={
          <>
            <Button
              variant="outline"
              onClick={closeAddModal}
            >
              {issuedKey ? "Close" : "Cancel"}
            </Button>

            {!issuedKey && (
              <Button
                disabled={!staffEmail.trim() || creatingInvite}
                onClick={handleAddStaff}
              >
                {creatingInvite ? "Creating..." : "Create invitation"}
              </Button>
            )}
          </>
        }
      >
        <div className="space-y-4">
          {issuedKey ? (
            <Field
              label="Single-use invitation key"
              hint={`This code is tied to ${staffEmail}. The invitee must register with this email address.`}
            >
              <Input readOnly value={issuedKey} onFocus={(event) => event.target.select()} />
            </Field>
          ) : (
            <Field
              label="Work email"
              hint="The invitation will only work when the invitee registers with this email address."
            >
              <Input
                type="email"
                required
                value={staffEmail}
                onChange={(event) => setStaffEmail(event.target.value)}
              />
            </Field>
          )}
          {inviteError && <p role="alert" className="text-sm text-red-700">{inviteError}</p>}
        </div>
      </Modal>
    </>
  )
}