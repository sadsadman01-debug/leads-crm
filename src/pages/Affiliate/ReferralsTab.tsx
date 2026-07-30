import { useQuery } from '@tanstack/react-query'
import { Users } from 'lucide-react'
import { affiliatesApi } from '@/lib/api'
import { Badge } from '@/components/ui/Badge'

export function ReferralsTab() {
  const { data, isLoading } = useQuery({ queryKey: ['my-referrals'], queryFn: affiliatesApi.getMyReferrals })
  const referrals = data?.referrals ?? []

  if (isLoading) return <p className="text-sm text-base-400">Loading…</p>

  if (referrals.length === 0) {
    return (
      <div className="card flex flex-col items-center gap-3 p-16 text-center">
        <Users size={32} className="text-base-500" />
        <p className="text-base-300">No referrals yet — share your referral link to get started.</p>
      </div>
    )
  }

  return (
    <div className="card overflow-x-auto p-6">
      <table className="w-full min-w-[600px] text-left text-sm">
        <thead>
          <tr className="border-b border-base-700/60 text-xs uppercase tracking-wide text-base-400">
            <th className="py-2 pr-3 font-medium">Organization</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Date Referred</th>
            <th className="px-3 py-2 font-medium">Commission Earned</th>
          </tr>
        </thead>
        <tbody>
          {referrals.map((r) => (
            <tr key={r.id} className="border-b border-base-800">
              <td className="py-3 pr-3 font-medium text-base-100">{r.name}</td>
              <td className="px-3 py-3">
                <Badge tone={r.first_payment_confirmed_at ? 'success' : 'warn'}>{r.first_payment_confirmed_at ? 'Paying Customer' : 'Pending Payment'}</Badge>
              </td>
              <td className="px-3 py-3 text-base-400">{new Date(r.created_at).toLocaleDateString()}</td>
              <td className="px-3 py-3 tabular-nums text-base-200">${r.commission_earned_usd}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
