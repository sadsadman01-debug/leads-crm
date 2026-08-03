import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { format, parseISO } from 'date-fns'
import { CHART_GRID, CHART_TEXT_MUTED, REVENUE_TREND_COLORS } from '@/lib/chartColors'
import type { EarningsTrendPoint, EarningsGranularity } from '@/types/earnings'

function formatDateLabel(value: string, granularity: EarningsGranularity) {
  try {
    if (granularity === 'month') return format(parseISO(`${value}-01`), 'MMM yyyy')
    return format(parseISO(value), 'MMM d')
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
          <span className="font-semibold tabular-nums text-base-100">৳{Math.round(p.value).toLocaleString()}</span>
          <span className="text-base-400">{p.name}</span>
        </div>
      ))}
    </div>
  )
}

/** Gross vs Net revenue over time (Super Admin's own earnings) — distinct
 * from RevenueTrendChart.tsx, which renders an Organization's own closed-won
 * Deals revenue (a different data shape/source entirely). */
export function EarningsTrendChart({ points, granularity }: { points: EarningsTrendPoint[]; granularity: EarningsGranularity }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
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
          tickFormatter={(v) => `৳${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`}
          width={44}
        />
        <Tooltip content={<CustomTooltip granularity={granularity} />} cursor={{ stroke: CHART_GRID, strokeWidth: 1 }} />
        <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, color: CHART_TEXT_MUTED }} />
        <Line
          type="monotone"
          dataKey="gross"
          name="Gross Revenue"
          stroke={REVENUE_TREND_COLORS.gross}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: '#111114' }}
        />
        <Line
          type="monotone"
          dataKey="net"
          name="Net Revenue"
          stroke={REVENUE_TREND_COLORS.net}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: '#111114' }}
        />
        <Line
          type="monotone"
          dataKey="refunds"
          name="Refunds"
          stroke={REVENUE_TREND_COLORS.refunds}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: '#111114' }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
