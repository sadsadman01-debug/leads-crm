import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Handshake, ShieldOff, ShieldCheck, ArrowRight } from 'lucide-react'
import { affiliatesApi } from '@/lib/api'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { FunnelChart } from '@/components/charts/FunnelChart'
import { AffiliateTrendChart } from '@/pages/Affiliate/AffiliateTrendChart'
import type { AffiliateWithSummary } from '@/types/affiliate'

type SortKey = 'lifetimeEarned' | 'pendingWithdrawal' | 'totalPaidOut' | 'clicks' | 'requests' | 'completed'

export function AffiliatesPage() {
  const { data, isLoading } = useQuery({ queryKey: ['affiliates'], queryFn: affiliatesApi.list })
  const affiliates = data?.affiliates ?? []
  const [sortKey, setSortKey] = useState<SortKey>('lifetimeEarned')
  const [viewing, setViewing] = useState<AffiliateWithSummary | null>(null)

  const sorted = useMemo(() => {
    return [...affiliates].sort((a, b) => {
      const av = sortKey === 'clicks' || sortKey === 'requests' || sortKey === 'completed' ? a.funnel[sortKey] : a.balances[sortKey]
      const bv = sortKey === 'clicks' || sortKey === 'requests' || sortKey === 'completed' ? b.funnel[sortKey] : b.balances[sortKey]
      return bv - av
    })
  }, [affiliates, sortKey])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-base-100">Affiliates</h1>
        <p className="mt-1 text-sm text-base-400">Every approved affiliate, with earnings and funnel performance at a glance.</p>
      </div>

      {isLoading ? (
        <div className="card p-12 text-center text-base-400">Loading affiliates…</div>
      ) : affiliates.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 p-16 text-center">
          <Handshake size={32} className="text-base-500" />
          <p className="text-base-300">No affiliates yet.</p>
        </div>
      ) : (
        <div className="card overflow-x-auto p-6">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-base-700/60 text-xs uppercase tracking-wide text-base-400">
                <th className="py-2 pr-3 font-medium">Affiliate</th>
                <th className="px-3 py-2 font-medium">Status</th>
                {(
                  [
                    ['lifetimeEarned', 'Total Earned'],
                    ['pendingWithdrawal', 'Pending'],
                    ['totalPaidOut', 'Paid'],
                    ['clicks', 'Clicks'],
                    ['requests', 'Requests'],
                    ['completed', 'Completed'],
                  ] as Array<[SortKey, string]>
                ).map(([key, label]) => (
                  <th key={key} className="cursor-pointer px-3 py-2 font-medium hover:text-base-200" onClick={() => setSortKey(key)}>
                    {label} {sortKey === key && '↓'}
                  </th>
                ))}
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((a) => (
                <tr key={a.id} className="border-b border-base-800">
                  <td className="py-3 pr-3">
                    <p className="font-medium text-base-100">{a.full_name}</p>
                    <p className="text-xs text-base-500">{a.email}</p>
                  </td>
                  <td className="px-3 py-3">
                    <Badge tone={a.status === 'active' ? 'success' : 'neutral'}>{a.status}</Badge>
                  </td>
                  <td className="px-3 py-3 tabular-nums text-base-200">${a.balances.lifetimeEarned}</td>
                  <td className="px-3 py-3 tabular-nums text-warn">${a.balances.pendingWithdrawal}</td>
                  <td className="px-3 py-3 tabular-nums text-success">${a.balances.totalPaidOut}</td>
                  <td className="px-3 py-3 tabular-nums text-base-300">{a.funnel.clicks}</td>
                  <td className="px-3 py-3 tabular-nums text-base-300">{a.funnel.requests}</td>
                  <td className="px-3 py-3 tabular-nums text-base-300">{a.funnel.completed}</td>
                  <td className="px-3 py-3">
                    <button className="btn-ghost px-2 text-accent-400" onClick={() => setViewing(a)}>
                      View <ArrowRight size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AffiliateDetailModal affiliate={viewing} onClose={() => setViewing(null)} />
    </div>
  )
}

function AffiliateDetailModal({ affiliate, onClose }: { affiliate: AffiliateWithSummary | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const { data: detail } = useQuery({
    queryKey: ['affiliate-detail', affiliate?.id],
    queryFn: () => affiliatesApi.getDetail(affiliate!.id),
    enabled: Boolean(affiliate),
  })

  const statusMutation = useMutation({
    mutationFn: (status: 'active' | 'suspended') => affiliatesApi.updateStatus(affiliate!.id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['affiliates'] }),
  })

  if (!affiliate) return null

  const funnel = detail?.funnel
  const funnelData = funnel ? [
    { stage: 'Link Clicks', count: funnel.clicks },
    { stage: 'Signup Requests Submitted', count: funnel.requests },
    { stage: 'Signups Completed', count: funnel.completed },
  ] : []

  return (
    <Modal open onClose={onClose} title={affiliate.full_name} size="lg">
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div className="rounded-lg bg-base-850 p-3">
            <p className="text-xs text-base-500">Email</p>
            <p className="truncate text-base-200">{affiliate.email}</p>
          </div>
          <div className="rounded-lg bg-base-850 p-3">
            <p className="text-xs text-base-500">Referral Code</p>
            <p className="font-mono text-base-200">{affiliate.referral_code}</p>
          </div>
          <div className="rounded-lg bg-base-850 p-3">
            <p className="text-xs text-base-500">Available Balance</p>
            <p className="text-base-100">${detail?.balances.availableBalance ?? affiliate.balances.availableBalance}</p>
          </div>
          <div className="rounded-lg bg-base-850 p-3">
            <p className="text-xs text-base-500">Joined</p>
            <p className="text-base-200">{new Date(affiliate.created_at).toLocaleDateString()}</p>
          </div>
          <div className="rounded-lg bg-base-850 p-3">
            <p className="text-xs text-base-500">City</p>
            <p className="truncate text-base-200">{affiliate.city || '—'}</p>
          </div>
          <div className="rounded-lg bg-base-850 p-3">
            <p className="text-xs text-base-500">Country</p>
            <p className="truncate text-base-200">{affiliate.country || '—'}</p>
          </div>
          <div className="rounded-lg bg-base-850 p-3">
            <p className="text-xs text-base-500">ZIP/Postal Code</p>
            <p className="truncate text-base-200">{affiliate.zip_code || '—'}</p>
          </div>
        </div>

        {funnelData.length > 0 && (
          <div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-base-300">Conversion Funnel (All Time)</h3>
            <FunnelChart data={funnelData} />
          </div>
        )}

        {detail && detail.trend.length > 0 && (
          <div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-base-300">Momentum</h3>
            <AffiliateTrendChart points={detail.trend} />
          </div>
        )}

        <div className="flex justify-end gap-3 border-t border-base-700/60 pt-4">
          <button className="btn-secondary" onClick={onClose}>Close</button>
          <button
            className="btn-secondary"
            disabled={statusMutation.isPending}
            onClick={() => statusMutation.mutate(affiliate.status === 'active' ? 'suspended' : 'active')}
          >
            {affiliate.status === 'active' ? <ShieldOff size={14} /> : <ShieldCheck size={14} />}
            {affiliate.status === 'active' ? 'Suspend' : 'Reactivate'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
