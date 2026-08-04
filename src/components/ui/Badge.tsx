import clsx from 'clsx'
import { Flame } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Priority, ScoreBand } from '@/types/lead'

type Tone = 'success' | 'warn' | 'danger' | 'neutral' | 'accent' | 'info'

const TONE_CLASSES: Record<Tone, string> = {
  success: 'bg-success-bg text-success',
  warn: 'bg-warn-bg text-warn',
  danger: 'bg-danger-bg text-danger',
  neutral: 'bg-base-700 text-base-200',
  accent: 'bg-accent-500/15 text-accent-400',
  info: 'bg-blue-500/15 text-blue-400',
}

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={clsx('pill', TONE_CLASSES[tone])}>{children}</span>
}

const PRIORITY_TONE: Record<Priority, Tone> = { High: 'danger', Medium: 'warn', Low: 'success' }

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <Badge tone={PRIORITY_TONE[priority]}>{priority}</Badge>
}

export function TagPill({ label }: { label: string }) {
  return <span className="pill bg-base-800 text-base-300 border border-base-600">{label}</span>
}

const SCORE_BAND_TONE: Record<ScoreBand, Tone> = { Hot: 'success', Warm: 'warn', Cold: 'neutral' }

export function ScoreBadge({ score, band }: { score: number; band: ScoreBand }) {
  return (
    <Badge tone={SCORE_BAND_TONE[band]}>
      <Flame size={11} />
      {band} · {score}
    </Badge>
  )
}
