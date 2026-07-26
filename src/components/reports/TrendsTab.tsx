import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowUp, ArrowDown, Minus } from 'lucide-react'
import { trendsApi, settingsApi } from '@/lib/api'
import { formatMaskedCurrency } from '@/lib/currency'
import type { TrendMetric } from '@/lib/api'

const METRIC_LABELS: Record<TrendMetric['key'], string> = {
  leadsAdded: 'New Leads Added',
  conversionRate: 'Conversion Rate',
  revenue: 'Revenue',
  avgDealSize: 'Avg Deal Size',
}

function formatMetricValue(key: TrendMetric['key'], value: number | null, currency: string): string {
  if (value === null) return '•••'
  if (key === 'conversionRate') return `${value}%`
  if (key === 'revenue' || key === 'avgDealSize') return formatMaskedCurrency(value, currency)
  return String(value)
}

function ChangeIndicator({ pctChange }: { pctChange: number | null }) {
  if (pctChange === null) return <span className="text-xs text-base-500">New</span>
  if (pctChange === 0) return (
    <span className="flex items-center gap-1 text-xs text-base-400">
      <Minus size={12} />0%
    </span>
  )
  const positive = pctChange > 0
  return (
    <span className={`flex items-center gap-1 text-xs font-medium ${positive ? 'text-success' : 'text-danger'}`}>
      {positive ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
      {Math.abs(pctChange)}%
    </span>
  )
}

export function TrendsTab() {
  const [granularity, setGranularity] = useState<'month' | 'quarter'>('month')
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get })
  const { data, isLoading } = useQuery({
    queryKey: ['trends', granularity, settings?.default_currency],
    queryFn: () => trendsApi.get(granularity, settings?.default_currency),
    enabled: Boolean(settings),
  })

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-lg bg-base-850 p-1 w-fit">
        {(['month', 'quarter'] as const).map((g) => (
          <button
            key={g}
            className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
              granularity === g ? 'bg-accent-500 text-white' : 'text-base-300 hover:text-base-100'
            }`}
            onClick={() => setGranularity(g)}
          >
            {g === 'month' ? 'Month over Month' : 'Quarter over Quarter'}
          </button>
        ))}
      </div>

      {isLoading || !data ? (
        <div className="card p-12 text-center text-sm text-base-400">Loading trends…</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {data.metrics.map((m) => (
            <div key={m.key} className="card p-5">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-base-400">{METRIC_LABELS[m.key]}</p>
              <div className="flex items-baseline justify-between">
                <span className="text-xl font-semibold text-base-100">
                  {formatMetricValue(m.key, m.current, data.displayCurrency)}
                </span>
                <ChangeIndicator pctChange={m.pctChange} />
              </div>
              <p className="mt-1 text-xs text-base-500">
                vs {formatMetricValue(m.key, m.previous, data.displayCurrency)} prior period
              </p>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-base-500">
        Cohort conversion analysis and average time-in-stage aren't available yet — the app doesn't currently record
        stage-transition timestamps needed to compute them accurately (only each record's current stage).
      </p>
    </div>
  )
}
