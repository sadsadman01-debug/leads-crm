import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, UsersRound, ShieldCheck, KeyRound, Mail } from 'lucide-react'
import { teamApi, passwordResetRequestsApi } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { Modal } from '@/components/ui/Modal'
import { RoleBadge, Avatar } from '@/components/ui/RoleBadge'
import { Badge } from '@/components/ui/Badge'
import { PermissionsPanel } from '@/components/PermissionsPanel'
import { DirectPasswordResetModal } from '@/components/DirectPasswordResetModal'
import { PasswordResetResolveModal } from '@/components/PasswordResetResolveModal'
import { DEFAULT_USER_PERMISSIONS, permissionsMatchDefault, type TeamMember } from '@/types/team'
import type { PasswordResetRequest } from '@/types/passwordResetRequest'

type Tab = 'members' | 'password-resets'

export function TeamList() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('members')
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<TeamMember | null>(null)
  const [deactivating, setDeactivating] = useState<TeamMember | null>(null)
  const [deleting, setDeleting] = useState<TeamMember | null>(null)
  const [managingPermissions, setManagingPermissions] = useState<TeamMember | null>(null)
  const [resettingPassword, setResettingPassword] = useState<TeamMember | null>(null)
  const [resolvingRequest, setResolvingRequest] = useState<PasswordResetRequest | null>(null)

  const { data, isLoading } = useQuery({ queryKey: ['team-members'], queryFn: teamApi.list })
  const members = data?.members ?? []
  const isSuperAdmin = profile?.role === 'super_admin'

  const { data: resetRequestsData } = useQuery({
    queryKey: ['password-reset-requests'],
    queryFn: passwordResetRequestsApi.list,
  })
  const resetRequests = resetRequestsData?.requests ?? []
  const pendingResetRequests = resetRequests.filter((r) => r.status === 'pending')

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['team-members'] })
  }

  const reactivateMutation = useMutation({
    mutationFn: (id: string) => teamApi.update(id, { is_active: true }),
    onSuccess: invalidate,
  })

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-base-100">Team</h1>
          <p className="mt-1 text-sm text-base-400">{members.length} member{members.length === 1 ? '' : 's'}</p>
        </div>
        {tab === 'members' && (
          <button className="btn-primary" onClick={() => setAddOpen(true)}>
            <Plus size={16} />
            Add Team Member
          </button>
        )}
      </div>

      <div className="mb-4 flex gap-1 rounded-lg bg-base-850 p-1 w-fit">
        <button
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            tab === 'members' ? 'bg-accent-500 text-white' : 'text-base-300 hover:text-base-100'
          }`}
          onClick={() => setTab('members')}
        >
          Team Members
        </button>
        <button
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            tab === 'password-resets' ? 'bg-accent-500 text-white' : 'text-base-300 hover:text-base-100'
          }`}
          onClick={() => setTab('password-resets')}
        >
          Password Reset Requests
          {pendingResetRequests.length > 0 && (
            <span className={`rounded-full px-1.5 text-xs ${tab === 'password-resets' ? 'bg-white/20' : 'bg-warn-bg text-warn'}`}>
              {pendingResetRequests.length}
            </span>
          )}
        </button>
      </div>

      {tab === 'password-resets' ? (
        pendingResetRequests.length === 0 ? (
          <div className="card flex flex-col items-center gap-3 p-16 text-center">
            <KeyRound size={32} className="text-base-500" />
            <p className="text-base-300">No pending password reset requests.</p>
          </div>
        ) : (
          <div className="card overflow-x-auto p-6">
            <table className="w-full min-w-[600px] text-left text-sm">
              <thead>
                <tr className="border-b border-base-700/60 text-xs uppercase tracking-wide text-base-400">
                  <th className="py-2 pr-3 font-medium">User</th>
                  <th className="px-3 py-2 font-medium">Requested</th>
                  <th className="px-3 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingResetRequests.map((r) => (
                  <tr key={r.id} className="border-b border-base-800">
                    <td className="py-3 pr-3">
                      <div className="font-medium text-base-100">{r.target_nickname || r.target_email}</div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-base-400">
                        <Mail size={12} className="shrink-0" />
                        {r.target_email}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-base-400">{new Date(r.requested_at).toLocaleString()}</td>
                    <td className="px-3 py-3">
                      <button className="btn-ghost px-2 text-accent-400" onClick={() => setResolvingRequest(r)}>
                        Reset Password
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : isLoading ? (
        <div className="card p-12 text-center text-base-400">Loading team…</div>
      ) : members.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 p-16 text-center">
          <UsersRound size={32} className="text-base-500" />
          <p className="text-base-300">No team members yet.</p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-base-700/60 text-xs uppercase tracking-wide text-base-400">
                <th className="px-5 py-3 font-medium">Nickname</th>
                <th className="px-5 py-3 font-medium">Email</th>
                <th className="px-5 py-3 font-medium">Role</th>
                <th className="px-5 py-3 font-medium">Access</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Date Added</th>
                <th className="px-5 py-3 font-medium">Last Login</th>
                <th className="px-5 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const canManage = m.role !== 'super_admin' && m.id !== profile?.id && (isSuperAdmin || m.role === 'user')
                return (
                  <tr key={m.id} className="border-b border-base-800">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={m.nickname || m.email} />
                        <span className="font-medium text-base-100">{m.nickname || '—'}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-base-300">{m.email}</td>
                    <td className="px-5 py-3.5"><RoleBadge role={m.role} /></td>
                    <td className="px-5 py-3.5">
                      {m.role === 'user' && (
                        <Badge tone={permissionsMatchDefault(m.permissions ?? DEFAULT_USER_PERMISSIONS) ? 'neutral' : 'accent'}>
                          {permissionsMatchDefault(m.permissions ?? DEFAULT_USER_PERMISSIONS) ? 'Standard' : 'Custom permissions'}
                        </Badge>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge tone={m.is_active ? 'success' : 'neutral'}>{m.is_active ? 'Active' : 'Deactivated'}</Badge>
                    </td>
                    <td className="px-5 py-3.5 text-base-400">{new Date(m.created_at).toLocaleDateString()}</td>
                    <td className="px-5 py-3.5 text-base-400">
                      {m.last_login_at ? new Date(m.last_login_at).toLocaleDateString() : 'Never'}
                    </td>
                    <td className="px-5 py-3.5">
                      {canManage && (
                        <div className="flex flex-wrap gap-2">
                          <button className="btn-ghost px-2 text-accent-400" onClick={() => setEditing(m)}>
                            Edit
                          </button>
                          <button
                            className="btn-ghost px-2 text-accent-400"
                            title="Reset password"
                            onClick={() => setResettingPassword(m)}
                          >
                            <KeyRound size={16} />
                            Reset Password
                          </button>
                          {m.role === 'user' && (
                            <button
                              className="btn-ghost px-2 text-accent-400"
                              title="Manage permissions"
                              onClick={() => setManagingPermissions(m)}
                            >
                              <ShieldCheck size={16} />
                              Permissions
                            </button>
                          )}
                          {m.is_active ? (
                            <button className="btn-ghost px-2 text-warn" onClick={() => setDeactivating(m)}>
                              Deactivate
                            </button>
                          ) : (
                            <button
                              className="btn-ghost px-2 text-success"
                              disabled={reactivateMutation.isPending}
                              onClick={() => reactivateMutation.mutate(m.id)}
                            >
                              Reactivate
                            </button>
                          )}
                          {isSuperAdmin && (
                            <button className="btn-ghost px-2 text-danger" onClick={() => setDeleting(m)}>
                              Delete
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <AddMemberModal open={addOpen} onClose={() => setAddOpen(false)} onSaved={invalidate} />
      <EditMemberModal key={editing?.id ?? 'none'} member={editing} onClose={() => setEditing(null)} onSaved={invalidate} />
      <DeactivateModal
        member={deactivating}
        members={members}
        onClose={() => setDeactivating(null)}
        onSaved={invalidate}
      />
      <DeleteModal member={deleting} onClose={() => setDeleting(null)} onSaved={invalidate} />
      <PermissionsPanel
        key={managingPermissions?.id ?? 'none'}
        member={managingPermissions}
        onClose={() => setManagingPermissions(null)}
        onSaved={invalidate}
      />
      <DirectPasswordResetModal
        key={`direct-${resettingPassword?.id ?? 'none'}`}
        member={resettingPassword}
        onClose={() => setResettingPassword(null)}
      />
      <PasswordResetResolveModal
        key={`request-${resolvingRequest?.id ?? 'none'}`}
        request={resolvingRequest}
        onClose={() => setResolvingRequest(null)}
      />
    </div>
  )
}

function AddMemberModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nickname, setNickname] = useState('')

  const mutation = useMutation({
    mutationFn: () => teamApi.create({ email, password, nickname, role: 'user' }),
    onSuccess: () => {
      onSaved()
      onClose()
      setEmail('')
      setPassword('')
      setNickname('')
    },
  })

  return (
    <Modal open={open} onClose={onClose} title="Add Team Member">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          mutation.mutate()
        }}
        className="space-y-4"
      >
        <div>
          <label className="label">Email</label>
          <input type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="label">Password</label>
          <input
            type="password"
            required
            minLength={8}
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Nickname</label>
          <input required className="input" value={nickname} onChange={(e) => setNickname(e.target.value)} />
        </div>
        {mutation.isError && <p className="text-sm text-danger">{(mutation.error as Error).message}</p>}
        <div className="flex justify-end gap-3 border-t border-base-700/60 pt-4">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={mutation.isPending}>
            {mutation.isPending ? 'Creating…' : 'Create Member'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function EditMemberModal({
  member,
  onClose,
  onSaved,
}: {
  member: TeamMember | null
  onClose: () => void
  onSaved: () => void
}) {
  const [nickname, setNickname] = useState(member?.nickname ?? '')

  const mutation = useMutation({
    mutationFn: () => teamApi.update(member!.id, { nickname }),
    onSuccess: () => {
      onSaved()
      onClose()
    },
  })

  if (!member) return null

  return (
    <Modal open={Boolean(member)} onClose={onClose} title="Edit Team Member">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          mutation.mutate()
        }}
        className="space-y-4"
      >
        <div>
          <label className="label">Nickname</label>
          <input required className="input" value={nickname} onChange={(e) => setNickname(e.target.value)} />
        </div>
        {mutation.isError && <p className="text-sm text-danger">{(mutation.error as Error).message}</p>}
        <div className="flex justify-end gap-3 border-t border-base-700/60 pt-4">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function DeactivateModal({
  member,
  members,
  onClose,
  onSaved,
}: {
  member: TeamMember | null
  members: TeamMember[]
  onClose: () => void
  onSaved: () => void
}) {
  const [reassignTo, setReassignTo] = useState('')

  const mutation = useMutation({
    mutationFn: () => teamApi.update(member!.id, { is_active: false, reassignTo: reassignTo || null }),
    onSuccess: () => {
      onSaved()
      onClose()
      setReassignTo('')
    },
  })

  if (!member) return null
  const others = members.filter((m) => m.id !== member.id && m.is_active)

  return (
    <Modal open={Boolean(member)} onClose={onClose} title={`Deactivate ${member.nickname || member.email}?`}>
      <p className="mb-4 text-sm text-base-300">
        They will no longer be able to log in. Their leads and deals stay attributed to them historically, but you
        can optionally reassign their currently-assigned records to another active member now.
      </p>
      <div className="mb-4">
        <label className="label">Reassign their leads/deals to</label>
        <select className="input" value={reassignTo} onChange={(e) => setReassignTo(e.target.value)}>
          <option value="">Leave unassigned</option>
          {others.map((m) => (
            <option key={m.id} value={m.id}>{m.nickname || m.email}</option>
          ))}
        </select>
      </div>
      {mutation.isError && <p className="mb-3 text-sm text-danger">{(mutation.error as Error).message}</p>}
      <div className="flex justify-end gap-3 border-t border-base-700/60 pt-4">
        <button className="btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button className="btn-danger" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? 'Deactivating…' : 'Deactivate'}
        </button>
      </div>
    </Modal>
  )
}

function DeleteModal({
  member,
  onClose,
  onSaved,
}: {
  member: TeamMember | null
  onClose: () => void
  onSaved: () => void
}) {
  const [confirm, setConfirm] = useState('')

  const mutation = useMutation({
    mutationFn: () => teamApi.remove(member!.id, confirm),
    onSuccess: () => {
      onSaved()
      onClose()
      setConfirm('')
    },
  })

  if (!member) return null

  return (
    <Modal open={Boolean(member)} onClose={onClose} title="Permanently delete this member?">
      <p className="mb-4 text-sm text-base-300">
        This cannot be undone. Their leads and deals will be reassigned to you. Type{' '}
        <strong>{member.email}</strong> to confirm.
      </p>
      <input className="input mb-4" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={member.email} />
      {mutation.isError && <p className="mb-3 text-sm text-danger">{(mutation.error as Error).message}</p>}
      <div className="flex justify-end gap-3 border-t border-base-700/60 pt-4">
        <button className="btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn-danger"
          disabled={mutation.isPending || confirm.toLowerCase() !== member.email.toLowerCase()}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? 'Deleting…' : 'Delete Permanently'}
        </button>
      </div>
    </Modal>
  )
}
