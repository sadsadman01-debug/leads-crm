import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Wallet } from 'lucide-react'
import { withdrawalsApi } from '@/lib/api'
import { Badge } from '@/components/ui/Badge'
import type { WithdrawalRequest, WithdrawalStatus } from '@/types/affiliate'
import { WithdrawalDetailModal } from './WithdrawalDetailModal'

type Tab = WithdrawalStatus | 'all'

const STATUS_TONE: Record<WithdrawalStatus, 'neutral' | 'accent' | 'success' | 'danger'> = {
  pending: 'neutral',
  processing: 'accent',
  approved: 'success',
  rejected: 'danger',
}

export function WithdrawalRequestsPage() {
  const [tab, setTab] = useState<Tab>('pending')
  const [viewing, setViewing] = useState<WithdrawalRequest | null>(null)

  const { data, isLoading } = useQuery({ queryKey: ['withdrawal-requests', tab], queryFn: () => withdrawalsApi.list(tab) })
  const withdrawals = data?.withdrawals ?? []

  const { data: allData } = useQuery({ queryKey: ['withdrawal-requests', 'all'], queryFn: () => withdrawalsApi.list('all') })
  const pendingCount = useMemo(() => (allData?.withdrawals ?? []).filter((w) => w.status === 'pending').length, [allData])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-base-100">Withdrawal Requests</h1>
        <p className="mt-1 text-sm text-base-400">Review and process affiliate payout requests.</p>
      </div>

      <div className="flex gap-1 rounded-lg bg-base-850 p-1 w-fit overflow-x-auto">
        {(['pending', 'processing', 'approved', 'rejected', 'all'] as Tab[]).map((t) => (
          <button
            key={t}
            className={`flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
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
        <div className="card p-12 text-center text-base-400">Loading…</div>
      ) : withdrawals.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 p-16 text-center">
          <Wallet size={32} className="text-base-500" />
          <p className="text-base-300">No {tab === 'all' ? '' : tab} withdrawal requests.</p>
        </div>
      ) : (
        <div className="card overflow-x-auto p-6">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-base-700/60 text-xs uppercase tracking-wide text-base-400">
                <th className="py-2 pr-3 font-medium">Affiliate</th>
                <th className="px-3 py-2 font-medium">Amount</th>
                <th className="px-3 py-2 font-medium">Method</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Requested</th>
              </tr>
            </thead>
            <tbody>
              {withdrawals.map((w) => (
                <tr key={w.id} className="cursor-pointer border-b border-base-800 hover:bg-base-850" onClick={() => setViewing(w)}>
                  <td className="py-3 pr-3 font-medium text-base-100">{w.affiliate?.full_name ?? '—'}</td>
                  <td className="px-3 py-3 tabular-nums text-base-200">৳{w.amount_usd}</td>
                  <td className="px-3 py-3 text-base-400">
                    {w.payout_method ? `${w.payout_method.method_type === 'mfs' ? '📱' : w.payout_method.method_type === 'bank_account' ? '🏦' : '₿'} ${w.payout_method.label}` : '—'}
                  </td>
                  <td className="px-3 py-3">
                    <Badge tone={STATUS_TONE[w.status]}>{w.status}</Badge>
                  </td>
                  <td className="px-3 py-3 text-base-400">{new Date(w.requested_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <WithdrawalDetailModal withdrawalId={viewing?.id ?? null} onClose={() => setViewing(null)} />
    </div>
  )
}
