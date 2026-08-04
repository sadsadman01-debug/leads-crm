import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Trophy, Medal, Award } from 'lucide-react'
import { affiliatesApi } from '@/lib/api'
import type { LeaderboardEntry, LeaderboardPeriod } from '@/types/affiliate'

const PERIOD_LABELS: Record<LeaderboardPeriod, string> = {
  this_month: 'This Month',
  this_quarter: 'This Quarter',
  all_time: 'All-Time',
}

const RANK_BADGE: Record<number, { icon: typeof Trophy; className: string }> = {
  1: { icon: Trophy, className: 'bg-amber-400/15 text-amber-400' },
  2: { icon: Medal, className: 'bg-slate-300/15 text-slate-300' },
  3: { icon: Award, className: 'bg-orange-500/15 text-orange-400' },
}

function RankBadge({ rank }: { rank: number }) {
  const top3 = RANK_BADGE[rank]
  if (top3) {
    const Icon = top3.icon
    return (
      <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${top3.className}`}>
        <Icon size={16} />
      </span>
    )
  }
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-base-800 text-sm font-semibold text-base-300">
      {rank}
    </span>
  )
}

function LeaderboardRow({ entry }: { entry: LeaderboardEntry }) {
  return (
    <tr className={`border-b border-base-800 ${entry.is_self ? 'bg-accent-500/[0.06]' : ''}`}>
      <td className="py-3 pr-3">
        <RankBadge rank={entry.rank} />
      </td>
      <td className="px-3 py-3">
        <span className={`font-medium ${entry.is_self ? 'text-accent-400' : 'text-base-100'}`}>
          {entry.display_name}
          {entry.is_self && <span className="ml-1.5 text-xs text-base-500">(You)</span>}
        </span>
      </td>
      <td className="px-3 py-3 tabular-nums text-base-300">{entry.completed}</td>
      <td className="px-3 py-3 tabular-nums text-base-300">
        {entry.commission_earned_usd != null ? `৳${entry.commission_earned_usd}` : <span className="text-base-500">—</span>}
      </td>
    </tr>
  )
}

export function LeaderboardTab() {
  const [period, setPeriod] = useState<LeaderboardPeriod>('all_time')
  const { data, isLoading } = useQuery({
    queryKey: ['affiliate-leaderboard', period],
    queryFn: () => affiliatesApi.getLeaderboard(period),
  })

  const topEntries = data?.topEntries ?? []
  const myEntry = data?.myEntry ?? null
  const myEntryInTop = topEntries.some((e) => e.is_self)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-base-100">Referral Leaderboard</h2>
          <p className="mt-1 text-sm text-base-400">Ranked by successfully converted referrals — see how you stack up.</p>
        </div>
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
      </div>

      {isLoading ? (
        <div className="card p-12 text-center text-base-400">Loading…</div>
      ) : topEntries.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 p-16 text-center">
          <Trophy size={32} className="text-base-500" />
          <p className="text-base-300">No converted referrals yet for {PERIOD_LABELS[period].toLowerCase()}.</p>
        </div>
      ) : (
        <div className="card overflow-x-auto p-6">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead>
              <tr className="border-b border-base-700/60 text-xs uppercase tracking-wide text-base-400">
                <th className="py-2 pr-3 font-medium">Rank</th>
                <th className="px-3 py-2 font-medium">Affiliate</th>
                <th className="px-3 py-2 font-medium">Converted</th>
                <th className="px-3 py-2 font-medium">Commission Earned</th>
              </tr>
            </thead>
            <tbody>
              {topEntries.map((entry) => (
                <LeaderboardRow key={entry.affiliate_id} entry={entry} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {myEntry && !myEntryInTop && (
        <div className="card flex items-center justify-between gap-3 p-5">
          <div className="flex items-center gap-3">
            <RankBadge rank={myEntry.rank} />
            <div>
              <p className="text-sm font-medium text-base-100">You're ranked #{myEntry.rank}</p>
              <p className="text-xs text-base-400">{myEntry.completed} converted referral{myEntry.completed === 1 ? '' : 's'} this period</p>
            </div>
          </div>
          {myEntry.commission_earned_usd != null && (
            <p className="text-sm font-semibold text-base-100">৳{myEntry.commission_earned_usd}</p>
          )}
        </div>
      )}
    </div>
  )
}
