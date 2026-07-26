import { FUNNEL_RAMP } from '@/lib/chartColors'
import { formatMaskedCurrency } from '@/lib/currency'

export function DealFunnelChart({
  data,
  currency,
}: {
  data: Array<{ stage: string; count: number; value: number | null }>
  currency: string
}) {
  const max = Math.max(1, ...data.map((d) => d.value ?? 0))

  return (
    <div className="space-y-2.5">
      {data.map((d, i) => {
        const widthPct = Math.max(4, Math.round(((d.value ?? 0) / max) * 100))

        return (
          <div key={d.stage}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="font-medium text-base-200">{d.stage}</span>
              <span className="flex items-center gap-2 text-base-400">
                <span>{d.count} deal{d.count === 1 ? '' : 's'}</span>
                <span className="tabular-nums font-semibold text-base-100">{formatMaskedCurrency(d.value, currency)}</span>
              </span>
            </div>
            <div className="h-8 w-full overflow-hidden rounded-md bg-base-850">
              <div
                className="flex h-full items-center rounded-md transition-all duration-500 ease-out"
                style={{ width: `${widthPct}%`, backgroundColor: FUNNEL_RAMP[Math.min(i, FUNNEL_RAMP.length - 1)] }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
