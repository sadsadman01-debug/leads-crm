import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import { CHART_GRID, CHART_TEXT_MUTED, TREND_COLORS } from '@/lib/chartColors'

interface TrendPoint {
  date: string
  leadsAdded: number
  emailsSent: number
}

function formatDateLabel(value: string, granularity: 'day' | 'week' | 'month') {
  try {
    const d = parseISO(value)
    if (granularity === 'month') return format(d, 'MMM yyyy')
    return format(d, 'MMM d')
  } catch {
    return value
  }
}

function CustomTooltip({ active, payload, label, granularity }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-base-600 bg-base-850 px-3 py-2 text-xs shadow-soft">
      <p className="mb-1.5 text-base-400">{formatDateLabel(label, granularity)}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="h-0.5 w-3 shrink-0" style={{ backgroundColor: p.color }} />
          <span className="font-semibold tabular-nums text-base-100">{p.value}</span>
          <span className="text-base-400">{p.name}</span>
        </div>
      ))}
    </div>
  )
}

export function TrendChart({ points, granularity }: { points: TrendPoint[]; granularity: 'day' | 'week' | 'month' }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
        <CartesianGrid stroke={CHART_GRID} strokeDasharray="0" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={(v) => formatDateLabel(v, granularity)}
          stroke={CHART_GRID}
          tick={{ fill: CHART_TEXT_MUTED, fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          minTickGap={24}
        />
        <YAxis
          stroke={CHART_GRID}
          tick={{ fill: CHART_TEXT_MUTED, fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
          width={32}
        />
        <Tooltip content={<CustomTooltip granularity={granularity} />} cursor={{ stroke: CHART_GRID, strokeWidth: 1 }} />
        <Legend
          iconType="plainline"
          wrapperStyle={{ fontSize: 12, color: CHART_TEXT_MUTED }}
        />
        <Line
          type="monotone"
          dataKey="leadsAdded"
          name="Leads Added"
          stroke={TREND_COLORS.leadsAdded}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: '#111114' }}
        />
        <Line
          type="monotone"
          dataKey="emailsSent"
          name="Cold Emails Sent"
          stroke={TREND_COLORS.emailsSent}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: '#111114' }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
