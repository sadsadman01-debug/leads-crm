import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Trophy } from 'lucide-react'
import { affiliatesApi } from '@/lib/api'
import { Badge } from '@/components/ui/Badge'
import type { LeaderboardPeriod } from '@/types/affiliate'

const PERIOD_LABELS: Record<LeaderboardPeriod, string> = {
  this_month: 'This Month',
  this_quarter: 'This Quarter',
  all_time: 'All-Time',
}

/** Super Admin's full-visibility leaderboard — every active affiliate, real
 * identity and exact commission for all, regardless of any individual
 * affiliate's own leaderboard_opt_in (that flag only ever hides a row from
 * OTHER affiliates, never from the Super Admin). */
export function AffiliateLeaderboardView() {
  const [period, setPeriod] = useState<LeaderboardPeriod>('all_time')
  const { data, isLoading } = useQuery({
    queryKey: ['affiliate-leaderboard-admin', period],
    queryFn: () => affiliatesApi.getLeaderboardAdmin(period),
  })
  const entries = data?.entries ?? []

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-lg bg-base-850 p-1 w-fit">
        {(Object.keys(PERIOD_LABELS) as LeaderboardPeriod[]).map((p) => (
          <button
            key={p}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              period === p ? 'bg-accent-500 text-white' : 'text-base-300 hover:text-base-100'
            }`}
            onClick={() => setPeriod(p)}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="card p-12 text-center text-base-400">Loading…</div>
      ) : entries.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 p-16 text-center">
          <Trophy size={32} className="text-base-500" />
          <p className="text-base-300">No active affiliates yet.</p>
        </div>
      ) : (
        <div className="card overflow-x-auto p-6">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-base-700/60 text-xs uppercase tracking-wide text-base-400">
                <th className="py-2 pr-3 font-medium">Rank</th>
                <th className="px-3 py-2 font-medium">Affiliate</th>
                <th className="px-3 py-2 font-medium">Converted</th>
                <th className="px-3 py-2 font-medium">Commission Earned</th>
                <th className="px-3 py-2 font-medium">Public Leaderboard</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.affiliate_id} className="border-b border-base-800">
                  <td className="py-3 pr-3 tabular-nums font-semibold text-base-100">#{e.rank}</td>
                  <td className="px-3 py-3">
                    <p className="font-medium text-base-100">{e.full_name}</p>
                    <p className="text-xs text-base-500">{e.email}</p>
                    {e.public_display_name && <p className="text-xs text-base-500">Displays as: {e.public_display_name}</p>}
                  </td>
                  <td className="px-3 py-3 tabular-nums text-base-300">{e.completed}</td>
                  <td className="px-3 py-3 tabular-nums text-base-200">
                    {e.commission_earned_usd != null ? `৳${e.commission_earned_usd}` : <span className="text-base-500">•••</span>}
                  </td>
                  <td className="px-3 py-3">
                    <Badge tone={e.leaderboard_opt_in ? 'success' : 'neutral'}>{e.leaderboard_opt_in ? 'Visible' : 'Opted Out'}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
