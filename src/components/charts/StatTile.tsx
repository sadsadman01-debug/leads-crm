import type { LucideIcon } from 'lucide-react'
import clsx from 'clsx'

type Tone = 'accent' | 'success' | 'warn' | 'danger' | 'neutral'

const TONE_CLASSES: Record<Tone, string> = {
  accent: 'bg-accent-500/15 text-accent-400',
  success: 'bg-success-bg text-success',
  warn: 'bg-warn-bg text-warn',
  danger: 'bg-danger-bg text-danger',
  neutral: 'bg-base-700 text-base-300',
}

export function StatTile({
  label,
  value,
  subvalue,
  icon: Icon,
  tone = 'accent',
}: {
  label: string
  value: string | number
  subvalue?: string
  icon: LucideIcon
  tone?: Tone
}) {
  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-base-400">{label}</span>
        <div className={clsx('flex h-8 w-8 items-center justify-center rounded-lg', TONE_CLASSES[tone])}>
          <Icon size={16} />
        </div>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold text-base-100">{value}</span>
        {subvalue && <span className="text-sm text-base-400">{subvalue}</span>}
      </div>
    </div>
  )
}
