import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { KeyRound, Mail } from 'lucide-react'
import { passwordResetRequestsApi } from '@/lib/api'
import { Badge } from '@/components/ui/Badge'
import { PasswordResetResolveModal } from '@/components/PasswordResetResolveModal'
import type { PasswordResetRequest } from '@/types/passwordResetRequest'

type Tab = 'pending' | 'resolved' | 'all'

export function PasswordResetRequestsPage() {
  const [tab, setTab] = useState<Tab>('pending')
  const [orgFilter, setOrgFilter] = useState('')
  const [resolving, setResolving] = useState<PasswordResetRequest | null>(null)

  const { data, isLoading } = useQuery({ queryKey: ['password-reset-requests'], queryFn: passwordResetRequestsApi.list })
  const requests = data?.requests ?? []

  const pendingCount = useMemo(() => requests.filter((r) => r.status === 'pending').length, [requests])

  const organizations = useMemo(() => {
    const names = new Set(requests.filter((r) => r.organization_name).map((r) => r.organization_name as string))
    return [...names].sort()
  }, [requests])

  const filtered = useMemo(() => {
    let rows = tab === 'all' ? requests : requests.filter((r) => r.status === tab)
    if (orgFilter) rows = rows.filter((r) => r.organization_name === orgFilter)
    return rows
  }, [requests, tab, orgFilter])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-base-100">Password Reset Requests</h1>
        <p className="mt-1 text-sm text-base-400">
          Platform-wide — every "Forgot Password" submission, from any Organization's Users or from any Admin.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg bg-base-850 p-1 w-fit">
          {(['pending', 'resolved', 'all'] as Tab[]).map((t) => (
            <button
              key={t}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                tab === t ? 'bg-accent-500 text-white' : 'text-base-300 hover:text-base-100'
              }`}
              onClick={() => setTab(t)}
            >
              {t}
              {t === 'pending' && pendingCount > 0 && (
                <span className={`rounded-full px-1.5 text-xs ${tab === t ? 'bg-white/20' : 'bg-warn-bg text-warn'}`}>
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {organizations.length > 0 && (
          <select className="input w-auto" value={orgFilter} onChange={(e) => setOrgFilter(e.target.value)}>
            <option value="">All Organizations</option>
            {organizations.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        )}
      </div>

      {isLoading ? (
        <div className="card p-12 text-center text-base-400">Loading requests…</div>
      ) : filtered.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 p-16 text-center">
          <KeyRound size={32} className="text-base-500" />
          <p className="text-base-300">No {tab === 'all' ? '' : tab} requests.</p>
        </div>
      ) : (
        <div className="card overflow-x-auto p-6">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b border-base-700/60 text-xs uppercase tracking-wide text-base-400">
                <th className="py-2 pr-3 font-medium">Account</th>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 font-medium">Organization</th>
                <th className="px-3 py-2 font-medium">Requested</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-base-800 align-top">
                  <td className="py-3 pr-3 font-medium text-base-100">
                    <div>{r.target_nickname || r.target_email}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-base-400">
                      <Mail size={12} className="shrink-0" />
                      <span className="truncate">{r.target_email}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <Badge tone={r.target_role === 'admin' ? 'accent' : 'neutral'}>
                      {r.target_role === 'admin' ? 'Admin — needs your attention' : 'User'}
                    </Badge>
                  </td>
                  <td className="px-3 py-3 text-base-300">{r.organization_name || '—'}</td>
                  <td className="px-3 py-3 text-base-400">{new Date(r.requested_at).toLocaleString()}</td>
                  <td className="px-3 py-3">
                    <Badge tone={r.status === 'pending' ? 'warn' : 'success'}>{r.status}</Badge>
                  </td>
                  <td className="px-3 py-3">
                    {r.status === 'pending' && (
                      <button className="btn-ghost px-2 text-accent-400" onClick={() => setResolving(r)}>
                        Reset Password
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <PasswordResetResolveModal request={resolving} onClose={() => setResolving(null)} />
    </div>
  )
}
