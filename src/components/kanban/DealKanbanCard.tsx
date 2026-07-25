import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { MoveRight, CalendarClock } from 'lucide-react'
import clsx from 'clsx'
import { formatCurrency } from '@/lib/currency'
import { Avatar } from '@/components/ui/RoleBadge'
import type { KanbanDeal } from '@/types/deal'
import type { DealStage } from '@/types/deal'

function closeDateUrgency(expectedCloseDate: string | null): 'overdue' | 'soon' | null {
  if (!expectedCloseDate) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(expectedCloseDate)
  const daysUntil = (due.getTime() - today.getTime()) / 86400000
  if (daysUntil < 0) return 'overdue'
  if (daysUntil <= 7) return 'soon'
  return null
}

export function DealKanbanCard({
  deal,
  stages,
  onOpen,
  onMoveToStage,
  dragging,
  ownerName,
}: {
  deal: KanbanDeal
  stages: DealStage[]
  onOpen: () => void
  onMoveToStage: (stageId: string) => void
  dragging?: boolean
  ownerName?: string
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: deal.id,
    data: { deal },
  })

  const urgency = closeDateUrgency(deal.expected_close_date)

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => !isDragging && onOpen()}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={clsx(
        'card relative cursor-grab touch-none p-3.5 transition-shadow hover:-translate-y-0.5 hover:shadow-glow active:cursor-grabbing',
        (isDragging || dragging) && 'opacity-50'
      )}
    >
      {urgency === 'overdue' && (
        <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-danger ring-2 ring-base-950" title="Expected close date overdue" />
      )}
      {urgency === 'soon' && (
        <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-warn ring-2 ring-base-950" title="Closing within 7 days" />
      )}

      <div className="mb-0.5 flex items-center justify-between gap-2">
        <p className="truncate text-sm font-medium text-base-100">{deal.name}</p>
        {ownerName && <Avatar name={ownerName} size={5} />}
      </div>
      <p className="mb-2 truncate text-xs text-base-400">{deal.company_name}</p>

      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-accent-400">{formatCurrency(Number(deal.value), deal.currency)}</span>
        <span className="pill bg-base-800 text-base-300">{deal.probability}%</span>
      </div>

      {deal.expected_close_date && (
        <div
          className={clsx(
            'flex items-center gap-1.5 text-xs',
            urgency === 'overdue' ? 'text-danger' : urgency === 'soon' ? 'text-warn' : 'text-base-400'
          )}
        >
          <CalendarClock size={12} />
          {new Date(deal.expected_close_date).toLocaleDateString()}
        </div>
      )}

      {/* Touch-drag fallback — always reachable on mobile where drag gestures can be unreliable */}
      <div
        className="relative mt-3 md:hidden"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <select
          value={deal.stage_id ?? ''}
          onChange={(e) => onMoveToStage(e.target.value)}
          className="input w-full appearance-none pl-8 text-xs"
        >
          {stages.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <MoveRight size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-base-400" />
      </div>
    </div>
  )
}
