import { FUNNEL_RAMP } from '@/lib/chartColors'

export function FunnelChart({ data }: { data: Array<{ stage: string; count: number }> }) {
  const max = Math.max(1, ...data.map((d) => d.count))

  return (
    <div className="space-y-2.5">
      {data.map((d, i) => {
        const widthPct = Math.max(4, Math.round((d.count / max) * 100))
        const prevCount = i > 0 ? data[i - 1].count : d.count
        const dropOffPct = i > 0 && prevCount > 0 ? Math.round(((prevCount - d.count) / prevCount) * 100) : null

        return (
          <div key={d.stage} className="group">
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="font-medium text-base-200">{d.stage}</span>
              <span className="flex items-center gap-2 text-base-400">
                {dropOffPct !== null && dropOffPct > 0 && (
                  <span className="text-warn">-{dropOffPct}%</span>
                )}
                <span className="tabular-nums font-semibold text-base-100">{d.count.toLocaleString()}</span>
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
