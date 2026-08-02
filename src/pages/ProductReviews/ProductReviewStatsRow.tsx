import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Star, MessagesSquare, TrendingUp } from 'lucide-react'
import { productReviewsApi } from '@/lib/api'
import { StatTile } from '@/components/charts/StatTile'
import { DonutChart } from '@/components/charts/DonutChart'

type RangeOption = 'today' | 'this_week' | 'this_month' | 'all_time' | 'custom'

function computeRange(option: RangeOption, customFrom: string, customTo: string): { from: string | undefined; to: string | undefined } {
  const now = new Date()
  if (option === 'today') {
    return { from: new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString(), to: now.toISOString() }
  }
  if (option === 'this_week') {
    const from = new Date(now)
    from.setDate(now.getDate() - now.getDay())
    from.setHours(0, 0, 0, 0)
    return { from: from.toISOString(), to: now.toISOString() }
  }
  if (option === 'this_month') {
    return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), to: now.toISOString() }
  }
  if (option === 'custom' && customFrom && customTo) {
    return { from: new Date(customFrom).toISOString(), to: new Date(`${customTo}T23:59:59.999`).toISOString() }
  }
  return { from: undefined, to: undefined }
}

const RATING_COLORS: Record<string, string> = {
  '1 star': '#ef4444',
  '2 stars': '#f97316',
  '3 stars': '#eab308',
  '4 stars': '#65a30d',
  '5 stars': '#22c55e',
}

export function ProductReviewStatsRow() {
  const [rangeOption, setRangeOption] = useState<RangeOption>('all_time')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const { from, to } = useMemo(() => computeRange(rangeOption, customFrom, customTo), [rangeOption, customFrom, customTo])

  const { data } = useQuery({
    queryKey: ['product-reviews', 'stats', from, to],
    queryFn: () => productReviewsApi.stats({ date_from: from, date_to: to }),
  })

  const distributionData = data
    ? (['1', '2', '3', '4', '5'] as const).map((n) => ({ label: `${n} star${n === '1' ? '' : 's'}`, count: data.distribution[n] ?? 0 }))
    : []

  return (
    <div className="card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-base-300">Feedback Overview</h2>
        <div className="flex flex-wrap items-center gap-2">
          <select className="input w-auto py-1.5 text-xs" value={rangeOption} onChange={(e) => setRangeOption(e.target.value as RangeOption)}>
            <option value="today">Today</option>
            <option value="this_week">This Week</option>
            <option value="this_month">This Month</option>
            <option value="all_time">All Time</option>
            <option value="custom">Custom Range</option>
          </select>
          {rangeOption === 'custom' && (
            <>
              <input type="date" className="input w-auto py-1.5 text-xs" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
              <input type="date" className="input w-auto py-1.5 text-xs" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile
          label="Average Rating (All Time)"
          value={data?.average_all_time != null ? data.average_all_time.toFixed(1) : '—'}
          icon={Star}
          tone="warn"
        />
        <StatTile
          label="Average Rating (Range)"
          value={data?.average_range != null ? data.average_range.toFixed(1) : '—'}
          icon={TrendingUp}
          tone="accent"
        />
        <StatTile label="Total Reviews" value={data?.total_reviews ?? 0} icon={MessagesSquare} tone="neutral" />
      </div>

      <div className="mt-5">
        <DonutChart data={distributionData} colors={RATING_COLORS} />
      </div>
    </div>
  )
}
