import { useQuery } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { forecastApi, settingsApi, teamApi } from '@/lib/api'
import { formatCurrency } from '@/lib/currency'
import { useAuth, isAdminOrAbove } from '@/contexts/AuthContext'
import { useState } from 'react'
import type { ForecastPeriod } from '@/lib/api'

const STATUS_STYLES: Record<ForecastPeriod['status'], { bar: string; label: string; tone: string }> = {
  on_track: { bar: 'bg-success', label: 'On Track', tone: 'text-success' },
  at_risk: { bar: 'bg-warn', label: 'At Risk', tone: 'text-warn' },
  behind: { bar: 'bg-danger', label: 'Behind', tone: 'text-danger' },
  no_quota: { bar: 'bg-base-600', label: 'No Quota Set', tone: 'text-base-400' },
}

function PeriodCard({ period, currency }: { period: ForecastPeriod; currency: string }) {
  const style = STATUS_STYLES[period.status]
  const pct = Math.min(100, period.progressPct ?? 0)

  return (
    <div className="card p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-base-300">{period.label}</h3>
        <span className={`text-xs font-medium ${style.tone}`}>{style.label}</span>
      </div>
      <p className="mb-1 text-2xl font-semibold text-base-100">{formatCurrency(period.forecast, currency)}</p>
      <p className="mb-4 text-xs text-base-400">
        {formatCurrency(period.closedWon, currency)} closed + {formatCurrency(period.openWeighted, currency)} weighted pipeline
      </p>
      {period.quota > 0 ? (
        <>
          <div className="mb-1.5 h-2.5 w-full overflow-hidden rounded-full bg-base-800">
            <div className={`h-full rounded-full transition-all duration-500 ${style.bar}`} style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-base-400">
            {period.progressPct}% of {formatCurrency(period.quota, currency)} quota
          </p>
        </>
      ) : (
        <p className="text-xs text-base-500">Set a quota in Settings to track progress.</p>
      )}
    </div>
  )
}

export function ForecastTab() {
  const { profile } = useAuth()
  const isAdmin = isAdminOrAbove(profile?.role)
  const [assignedTo, setAssignedTo] = useState('')

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get })
  const { data: rosterData } = useQuery({ queryKey: ['team-roster'], queryFn: teamApi.roster, enabled: isAdmin })

  const effectiveAssignedTo = isAdmin ? assignedTo || undefined : profile?.id

  const { data, isLoading } = useQuery({
    queryKey: ['forecast', settings?.default_currency, effectiveAssignedTo],
    queryFn: () => forecastApi.get(settings?.default_currency, effectiveAssignedTo),
    enabled: Boolean(settings),
  })

  if (isLoading || !data) {
    return <div className="card p-12 text-center text-sm text-base-400">Loading forecast…</div>
  }

  return (
    <div className="space-y-4">
      {isAdmin && (rosterData?.members.length ?? 0) > 0 && (
        <select className="input w-auto" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
          <option value="">Whole Organization</option>
          {rosterData!.members.map((m) => (
            <option key={m.id} value={m.id}>{m.nickname || m.email}</option>
          ))}
        </select>
      )}

      <p className="text-xs text-base-500">
        Rates updated {formatDistanceToNow(new Date(data.ratesUpdatedAt), { addSuffix: true })} — figures shown in {data.displayCurrency}.
      </p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <PeriodCard period={data.thisMonth} currency={data.displayCurrency} />
        <PeriodCard period={data.thisQuarter} currency={data.displayCurrency} />
        <PeriodCard period={data.nextQuarter} currency={data.displayCurrency} />
      </div>

      <p className="text-xs text-base-500">
        Forecast = (open deal value × win probability) for deals expected to close in that period, plus revenue already Closed Won in it.
      </p>
    </div>
  )
}
