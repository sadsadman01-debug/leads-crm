import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { UsersRound, Plus, ShieldOff, ShieldCheck, Trash2 } from 'lucide-react'
import { staffApi } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import type { StaffMember } from '@/types/staff'

/** Super Admin has full Add/Suspend/Reactivate/Delete access; a Staff viewer
 * sees the exact same list read-only — they can see who their fellow Staff
 * are, but cannot add or remove any Staff account themselves (enforced here
 * for UX and independently by the backend regardless of what this hides). */
export function StaffPage() {
  const { profile } = useAuth()
  const isSuperAdmin = profile?.role === 'super_admin'
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['staff-members'], queryFn: staffApi.list })
  const staff = data?.staff ?? []

  const [addOpen, setAddOpen] = useState(false)
  const [deleting, setDeleting] = useState<StaffMember | null>(null)

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['staff-members'] })
  }

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'suspended' }) => staffApi.updateStatus(id, status),
    onSuccess: invalidate,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => staffApi.remove(id),
    onSuccess: () => {
      invalidate()
      setDeleting(null)
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-base-100">Platform Staff</h1>
          <p className="mt-1 text-sm text-base-400">
            {isSuperAdmin
              ? 'Team members who help run day-to-day operations, with a restricted permission set.'
              : "Your fellow Staff members — only a Super Admin can add or remove accounts here."}
          </p>
        </div>
        {isSuperAdmin && (
          <button className="btn-primary" onClick={() => setAddOpen(true)}>
            <Plus size={16} />
            Add Staff Member
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="card p-12 text-center text-base-400">Loading…</div>
      ) : staff.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 p-16 text-center">
          <UsersRound size={32} className="text-base-500" />
          <p className="text-base-300">No Staff members yet.</p>
        </div>
      ) : (
        <div className="card overflow-x-auto p-6">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-base-700/60 text-xs uppercase tracking-wide text-base-400">
                <th className="py-2 pr-3 font-medium">Nickname</th>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Date Added</th>
                {isSuperAdmin && <th className="px-3 py-2 font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id} className="border-b border-base-800">
                  <td className="py-3 pr-3 font-medium text-base-100">{s.nickname || '—'}</td>
                  <td className="px-3 py-3 text-base-300">{s.email}</td>
                  <td className="px-3 py-3">
                    <Badge tone={s.is_active ? 'success' : 'neutral'}>{s.is_active ? 'Active' : 'Suspended'}</Badge>
                  </td>
                  <td className="px-3 py-3 text-base-400">{new Date(s.created_at).toLocaleDateString()}</td>
                  {isSuperAdmin && (
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          className="btn-ghost px-2 text-warn"
                          disabled={statusMutation.isPending}
                          onClick={() => statusMutation.mutate({ id: s.id, status: s.is_active ? 'suspended' : 'active' })}
                        >
                          {s.is_active ? <ShieldOff size={14} /> : <ShieldCheck size={14} />}
                          {s.is_active ? 'Suspend' : 'Reactivate'}
                        </button>
                        <button className="btn-ghost px-2 text-danger" onClick={() => setDeleting(s)}>
                          <Trash2 size={14} />
                          Delete
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isSuperAdmin && <AddStaffModal open={addOpen} onClose={() => setAddOpen(false)} onSaved={invalidate} />}

      {deleting && (
        <Modal open onClose={() => setDeleting(null)} title={`Delete ${deleting.nickname || deleting.email}?`}>
          <p className="mb-4 text-sm text-base-300">
            This permanently deletes <strong>{deleting.nickname || deleting.email}</strong>'s account. This cannot be undone.
          </p>
          {deleteMutation.isError && <p className="mb-3 text-sm text-danger">{(deleteMutation.error as Error).message}</p>}
          <div className="flex justify-end gap-3 border-t border-base-700/60 pt-4">
            <button className="btn-secondary" onClick={() => setDeleting(null)}>Cancel</button>
            <button className="btn-danger" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate(deleting.id)}>
              {deleteMutation.isPending ? 'Deleting…' : 'Delete Permanently'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function AddStaffModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nickname, setNickname] = useState('')

  const mutation = useMutation({
    mutationFn: () => staffApi.create({ email, password, nickname }),
    onSuccess: () => {
      onSaved()
      onClose()
      setEmail('')
      setPassword('')
      setNickname('')
    },
  })

  return (
    <Modal open={open} onClose={onClose} title="Add Staff Member">
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
          <input type="password" required minLength={8} className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
          <p className="mt-1 text-xs text-base-500">Set directly — the new Staff member will be required to change it on first login.</p>
        </div>
        <div>
          <label className="label">Nickname</label>
          <input required className="input" value={nickname} onChange={(e) => setNickname(e.target.value)} />
        </div>
        {mutation.isError && <p className="text-sm text-danger">{(mutation.error as Error).message}</p>}
        <div className="flex justify-end gap-3 border-t border-base-700/60 pt-4">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={mutation.isPending}>
            {mutation.isPending ? 'Creating…' : 'Create Staff Account'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
