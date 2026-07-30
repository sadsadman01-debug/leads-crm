import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Handshake, Mail } from 'lucide-react'
import { affiliateApplicationsApi } from '@/lib/api'
import { Badge } from '@/components/ui/Badge'
import type { AffiliateApplication, AffiliateApplicationStatus } from '@/types/affiliate'
import { ApproveAffiliateFlow } from './ApproveAffiliateFlow'
import { RejectAffiliateModal } from './RejectAffiliateModal'

type Tab = 'pending' | 'approved' | 'rejected' | 'all'

const STATUS_TONE: Record<AffiliateApplicationStatus, 'warn' | 'success' | 'danger'> = {
  pending: 'warn',
  approved: 'success',
  rejected: 'danger',
}

export function AffiliateApplicationsPage() {
  const [tab, setTab] = useState<Tab>('pending')
  const [approving, setApproving] = useState<AffiliateApplication | null>(null)
  const [rejecting, setRejecting] = useState<AffiliateApplication | null>(null)

  const { data, isLoading } = useQuery({ queryKey: ['affiliate-applications'], queryFn: affiliateApplicationsApi.list })
  const applications = data?.applications ?? []

  const pendingCount = useMemo(() => applications.filter((a) => a.status === 'pending').length, [applications])

  const filtered = useMemo(() => {
    if (tab === 'all') return applications
    return applications.filter((a) => a.status === tab)
  }, [applications, tab])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-base-100">Affiliate Applications</h1>
        <p className="mt-1 text-sm text-base-400">Review and approve or reject applications from the "Become an Affiliate" form.</p>
      </div>

      <div className="flex gap-1 rounded-lg bg-base-850 p-1 w-fit">
        {(['pending', 'approved', 'rejected', 'all'] as Tab[]).map((t) => (
          <button
            key={t}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
              tab === t ? 'bg-accent-500 text-white' : 'text-base-300 hover:text-base-100'
            }`}
            onClick={() => setTab(t)}
          >
            {t}
            {t === 'pending' && pendingCount > 0 && (
              <span className={`rounded-full px-1.5 text-xs ${tab === t ? 'bg-white/20' : 'bg-warn-bg text-warn'}`}>{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="card p-12 text-center text-base-400">Loading applications…</div>
      ) : filtered.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 p-16 text-center">
          <Handshake size={32} className="text-base-500" />
          <p className="text-base-300">No {tab === 'all' ? '' : tab} applications.</p>
        </div>
      ) : (
        <div className="card overflow-x-auto p-6">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-base-700/60 text-xs uppercase tracking-wide text-base-400">
                <th className="py-2 pr-3 font-medium">Full Name</th>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Promotion Plan</th>
                <th className="px-3 py-2 font-medium">Applied</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id} className="border-b border-base-800 align-top">
                  <td className="py-3 pr-3 font-medium text-base-100">{a.full_name}</td>
                  <td className="px-3 py-3 text-base-300">
                    <div className="flex items-center gap-1.5">
                      <Mail size={12} className="shrink-0 text-base-400" />
                      <span className="truncate">{a.email}</span>
                    </div>
                  </td>
                  <td className="max-w-[260px] px-3 py-3 text-xs text-base-400">{a.how_they_plan_to_promote || <span className="text-base-500">—</span>}</td>
                  <td className="px-3 py-3 text-base-400">{new Date(a.applied_at).toLocaleDateString()}</td>
                  <td className="px-3 py-3">
                    <Badge tone={STATUS_TONE[a.status]}>{a.status}</Badge>
                    {a.status === 'rejected' && a.rejection_reason && <p className="mt-1 max-w-[160px] text-xs text-base-500">{a.rejection_reason}</p>}
                  </td>
                  <td className="px-3 py-3">
                    {a.status === 'pending' && (
                      <div className="flex flex-wrap gap-2">
                        <button className="btn-ghost px-2 text-success" onClick={() => setApproving(a)}>
                          Approve
                        </button>
                        <button className="btn-ghost px-2 text-danger" onClick={() => setRejecting(a)}>
                          Reject
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ApproveAffiliateFlow application={approving} onClose={() => setApproving(null)} />
      <RejectAffiliateModal application={rejecting} onClose={() => setRejecting(null)} />
    </div>
  )
}
