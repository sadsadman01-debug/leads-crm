import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, Plus, Users, Handshake, DollarSign, ShieldOff, ShieldCheck, ArrowRight, Download, Loader2 } from 'lucide-react'
import { organizationsApi, dataExportApi } from '@/lib/api'
import { formatCurrency } from '@/lib/currency'
import { StatTile } from '@/components/charts/StatTile'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { useOrg } from '@/contexts/OrgContext'
import { computeSubscriptionStatus, type OrganizationSummary, type SubscriptionStatus } from '@/types/organization'

const SUBSCRIPTION_STATUS_TONE: Record<SubscriptionStatus, 'success' | 'accent' | 'danger' | 'neutral'> = {
  active: 'success',
  cancelled: 'accent',
  expired: 'danger',
  no_subscription: 'neutral',
}

const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  active: 'Active',
  cancelled: 'Cancelled',
  expired: 'Expired',
  no_subscription: '—',
}

export function OrganizationsOverview() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { enterOrganization, enterPersonalWorkspace } = useOrg()
  const [addOpen, setAddOpen] = useState(false)
  const [suspending, setSuspending] = useState<OrganizationSummary | null>(null)
  const [deleting, setDeleting] = useState<OrganizationSummary | null>(null)
  const [exportingId, setExportingId] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)

  const { data, isLoading } = useQuery({ queryKey: ['organizations'], queryFn: organizationsApi.list })
  const orgs = data?.organizations ?? []

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['organizations'] })
  }

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'suspended' }) =>
      organizationsApi.updateStatus(id, status),
    onSuccess: () => {
      invalidate()
      setSuspending(null)
    },
  })

  function openOrg(org: OrganizationSummary) {
    enterOrganization(org.id, org.name)
    navigate('/dashboard')
  }

  function openPersonalWorkspace() {
    enterPersonalWorkspace()
    navigate('/dashboard')
  }

  async function handleExportOrg(org: OrganizationSummary) {
    setExportError(null)
    setExportingId(org.id)
    try {
      await dataExportApi.downloadFull(org.id)
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setExportingId(null)
    }
  }

  const totals = orgs.reduce(
    (acc, o) => ({
      users: acc.users + o.userCount,
      leads: acc.leads + o.leadCount,
      pipelineValue: acc.pipelineValue + o.openPipelineValue,
    }),
    { users: 0, leads: 0, pipelineValue: 0 }
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-base-100">Organizations</h1>
          <p className="mt-1 text-sm text-base-400">Platform overview — every tenant on this deployment</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={openPersonalWorkspace}>
            My Personal Workspace
          </button>
          <button className="btn-primary" onClick={() => setAddOpen(true)}>
            <Plus size={16} />
            Add Admin
          </button>
        </div>
      </div>

      {exportError && (
        <div className="rounded-lg bg-danger-bg px-4 py-3 text-sm text-danger">{exportError}</div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Organizations" value={orgs.length} icon={Building2} tone="accent" />
        <StatTile label="Total Users" value={totals.users} icon={Users} tone="neutral" />
        <StatTile label="Total Leads" value={totals.leads} icon={Handshake} tone="accent" />
        <StatTile label="Total Pipeline Value" value={formatCurrency(totals.pipelineValue, 'USD')} icon={DollarSign} tone="success" />
      </div>

      {isLoading ? (
        <div className="card p-12 text-center text-base-400">Loading organizations…</div>
      ) : orgs.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 p-16 text-center">
          <Building2 size={32} className="text-base-500" />
          <p className="text-base-300">No organizations yet.</p>
          <button className="btn-primary" onClick={() => setAddOpen(true)}>
            <Plus size={16} />
            Add your first Admin/Organization
          </button>
        </div>
      ) : (
        <div className="card overflow-x-auto p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-base-300">Organization Comparison</h2>
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b border-base-700/60 text-xs uppercase tracking-wide text-base-400">
                <th className="py-2 pr-3 font-medium">Organization</th>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Users</th>
                <th className="px-3 py-2 font-medium">Leads</th>
                <th className="px-3 py-2 font-medium">Deals</th>
                <th className="px-3 py-2 font-medium">Open Pipeline</th>
                <th className="px-3 py-2 font-medium">Subscription</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Created</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((org) => (
                <tr key={org.id} className="border-b border-base-800">
                  <td className="py-3 pr-3">
                    <p className="font-medium text-base-100">{org.name}</p>
                    {(org.city || org.country || org.zip_code) && (
                      <p className="mt-0.5 text-xs text-base-400">{[org.city, org.country, org.zip_code].filter(Boolean).join(', ')}</p>
                    )}
                    {org.referred_by_affiliate_name && (
                      <p className="mt-0.5 text-xs text-accent-400">Referred by: {org.referred_by_affiliate_name}</p>
                    )}
                    {org.referred_by_organization_name && (
                      <p className="mt-0.5 text-xs text-accent-400">Referred by: {org.referred_by_organization_name}</p>
                    )}
                  </td>
                  <td className="max-w-[180px] px-3 py-3 text-base-300">
                    {org.admin ? (
                      <span className="block truncate" title={org.admin.email}>
                        {org.admin.email}
                      </span>
                    ) : (
                      <span className="text-base-500">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 tabular-nums text-base-300">{org.userCount}</td>
                  <td className="px-3 py-3 tabular-nums text-base-300">{org.leadCount}</td>
                  <td className="px-3 py-3 tabular-nums text-base-300">{org.dealCount}</td>
                  <td className="px-3 py-3 tabular-nums text-base-300">{formatCurrency(org.openPipelineValue, 'USD')}</td>
                  <td className="px-3 py-3">
                    {(() => {
                      const subStatus = computeSubscriptionStatus(org.subscription_end_date, org.subscription_cancelled_at)
                      return <Badge tone={SUBSCRIPTION_STATUS_TONE[subStatus]}>{SUBSCRIPTION_STATUS_LABELS[subStatus]}</Badge>
                    })()}
                  </td>
                  <td className="px-3 py-3">
                    <Badge tone={org.status === 'active' ? 'success' : 'neutral'}>{org.status}</Badge>
                  </td>
                  <td className="px-3 py-3 text-base-400">{new Date(org.created_at).toLocaleDateString()}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button className="btn-ghost px-2 text-accent-400" onClick={() => openOrg(org)}>
                        Enter
                        <ArrowRight size={14} />
                      </button>
                      <button className="btn-ghost px-2 text-warn" onClick={() => setSuspending(org)}>
                        {org.status === 'active' ? <ShieldOff size={14} /> : <ShieldCheck size={14} />}
                        {org.status === 'active' ? 'Suspend' : 'Reactivate'}
                      </button>
                      <button className="btn-ghost px-2 text-danger" onClick={() => setDeleting(org)}>
                        Delete
                      </button>
                      <button
                        className="btn-ghost px-2 text-accent-400"
                        disabled={exportingId === org.id}
                        onClick={() => handleExportOrg(org)}
                      >
                        {exportingId === org.id ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                        Export
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AddAdminModal open={addOpen} onClose={() => setAddOpen(false)} onSaved={invalidate} />

      <Modal
        open={Boolean(suspending)}
        onClose={() => setSuspending(null)}
        title={`${suspending?.status === 'active' ? 'Suspend' : 'Reactivate'} ${suspending?.name ?? ''}?`}
      >
        <p className="mb-5 text-sm text-base-300">
          {suspending?.status === 'active'
            ? 'This deactivates the Admin and every User in this organization — none of them will be able to log in until reactivated.'
            : 'This restores login access for the Admin and every User in this organization.'}
        </p>
        <div className="flex justify-end gap-3">
          <button className="btn-secondary" onClick={() => setSuspending(null)}>
            Cancel
          </button>
          <button
            className="btn-danger"
            disabled={statusMutation.isPending}
            onClick={() =>
              suspending &&
              statusMutation.mutate({ id: suspending.id, status: suspending.status === 'active' ? 'suspended' : 'active' })
            }
          >
            {statusMutation.isPending ? 'Saving…' : suspending?.status === 'active' ? 'Suspend' : 'Reactivate'}
          </button>
        </div>
      </Modal>

      <DeleteOrgModal org={deleting} onClose={() => setDeleting(null)} onSaved={invalidate} />
    </div>
  )
}

function AddAdminModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [organizationName, setOrganizationName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nickname, setNickname] = useState('')

  const mutation = useMutation({
    mutationFn: () => organizationsApi.create({ organizationName, email, password, nickname }),
    onSuccess: () => {
      onSaved()
      onClose()
      setOrganizationName('')
      setEmail('')
      setPassword('')
      setNickname('')
    },
  })

  return (
    <Modal open={open} onClose={onClose} title="Add Admin & Organization">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          mutation.mutate()
        }}
        className="space-y-4"
      >
        <div>
          <label className="label">Organization / Company Name</label>
          <input required className="input" value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} />
        </div>
        <div>
          <label className="label">Admin Email</label>
          <input type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="label">Admin Password</label>
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
          <label className="label">Admin Nickname</label>
          <input required className="input" value={nickname} onChange={(e) => setNickname(e.target.value)} />
        </div>
        {mutation.isError && <p className="text-sm text-danger">{(mutation.error as Error).message}</p>}
        <div className="flex justify-end gap-3 border-t border-base-700/60 pt-4">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={mutation.isPending}>
            {mutation.isPending ? 'Creating…' : 'Create Organization'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function DeleteOrgModal({
  org,
  onClose,
  onSaved,
}: {
  org: OrganizationSummary | null
  onClose: () => void
  onSaved: () => void
}) {
  const [confirm, setConfirm] = useState('')

  const mutation = useMutation({
    mutationFn: () => organizationsApi.remove(org!.id, confirm),
    onSuccess: () => {
      onSaved()
      onClose()
      setConfirm('')
    },
  })

  if (!org) return null

  return (
    <Modal open={Boolean(org)} onClose={onClose} title="Permanently delete this organization?">
      <p className="mb-4 text-sm text-base-300">
        This cannot be undone — it deletes the Admin, every User, and every lead/deal/setting in{' '}
        <strong>{org.name}</strong>. Type the organization name to confirm.
      </p>
      <input className="input mb-4" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={org.name} />
      {mutation.isError && <p className="mb-3 text-sm text-danger">{(mutation.error as Error).message}</p>}
      <div className="flex justify-end gap-3 border-t border-base-700/60 pt-4">
        <button className="btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn-danger"
          disabled={mutation.isPending || confirm.toLowerCase() !== org.name.toLowerCase()}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? 'Deleting…' : 'Delete Permanently'}
        </button>
      </div>
    </Modal>
  )
}
