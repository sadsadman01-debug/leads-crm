import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Eye, FileCheck2, Percent, CheckCircle2 } from 'lucide-react'
import { pageViewsApi, type PageViewType } from '@/lib/api'
import { StatTile } from '@/components/charts/StatTile'

type RangeOption = 'today' | 'this_week' | 'this_month' | 'all_time' | 'custom'

function computeRange(option: RangeOption, customFrom: string, customTo: string): { from: Date | null; to: Date | null } {
  const now = new Date()
  if (option === 'today') {
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    return { from, to: now }
  }
  if (option === 'this_week') {
    const from = new Date(now)
    from.setDate(now.getDate() - now.getDay())
    from.setHours(0, 0, 0, 0)
    return { from, to: now }
  }
  if (option === 'this_month') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1)
    return { from, to: now }
  }
  if (option === 'custom' && customFrom && customTo) {
    return { from: new Date(customFrom), to: new Date(`${customTo}T23:59:59.999`) }
  }
  return { from: null, to: null }
}

export interface ConversionRecord {
  /** ISO timestamp the record was created/applied/requested at. */
  date: string
  approved: boolean
}

/** A compact stats header for the two public "entry page" review screens
 * (Signup Requests / Affiliate Applications) — Page Views, Applications
 * Submitted, Conversion Rate, and Approved, all scoped to a selectable date
 * range. Only affects this header; the request list below keeps showing
 * everything regardless of range, exactly as it already does. */
export function ConversionStatsRow({ pageType, records }: { pageType: PageViewType; records: ConversionRecord[] }) {
  const [rangeOption, setRangeOption] = useState<RangeOption>('all_time')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const { from, to } = useMemo(() => computeRange(rangeOption, customFrom, customTo), [rangeOption, customFrom, customTo])

  const { submitted, approved } = useMemo(() => {
    const filtered = from && to ? records.filter((r) => { const d = new Date(r.date); return d >= from && d <= to }) : records
    return { submitted: filtered.length, approved: filtered.filter((r) => r.approved).length }
  }, [records, from, to])

  const { data: pageViewData } = useQuery({
    queryKey: ['page-view-count', pageType, from?.toISOString(), to?.toISOString()],
    queryFn: () => pageViewsApi.getCount(pageType, from?.toISOString(), to?.toISOString()),
  })
  const pageViews = pageViewData?.count ?? 0
  const conversionRate = pageViews > 0 ? `${((submitted / pageViews) * 100).toFixed(1)}%` : '—'

  return (
    <div className="card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-base-300">Page Views &amp; Conversion</h2>
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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Page Views" value={pageViews} icon={Eye} tone="neutral" />
        <StatTile label="Applications Submitted" value={submitted} icon={FileCheck2} tone="accent" />
        <StatTile label="Conversion Rate" value={conversionRate} icon={Percent} tone="warn" />
        <StatTile label="Approved" value={approved} icon={CheckCircle2} tone="success" />
      </div>
    </div>
  )
}
