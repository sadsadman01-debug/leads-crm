import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { Mail, Send, MessageCircle, Linkedin, MessageSquare, Reply, Trophy } from 'lucide-react'
import clsx from 'clsx'
import { PriorityBadge } from '@/components/ui/Badge'
import type { KanbanLead } from '@/types/lead'

const QUICK_ICONS: Array<{ key: keyof NonNullable<KanbanLead['status']>; icon: typeof Mail; label: string }> = [
  { key: 'cold_email_sent', icon: Mail, label: 'Cold email sent' },
  { key: 'followup1_sent', icon: Send, label: '1st follow-up sent' },
  { key: 'followup2_sent', icon: Send, label: '2nd follow-up sent' },
  { key: 'followup3_sent', icon: Send, label: '3rd follow-up sent' },
  { key: 'whatsapp_sent', icon: MessageCircle, label: 'WhatsApp sent' },
  { key: 'linkedin_sent', icon: Linkedin, label: 'LinkedIn sent' },
  { key: 'sms_sent', icon: MessageSquare, label: 'SMS sent' },
  { key: 'replied', icon: Reply, label: 'Replied' },
  { key: 'converted', icon: Trophy, label: 'Converted' },
]

export function KanbanCard({
  lead,
  onOpen,
  dragging,
}: {
  lead: KanbanLead
  onOpen: () => void
  dragging?: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: lead.id,
    data: { lead },
  })

  const status = lead.status

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
      {status?.is_overdue && (
        <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-danger ring-2 ring-base-950" title="Overdue follow-up" />
      )}
      {!status?.is_overdue && status?.is_due_today && (
        <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-warn ring-2 ring-base-950" title="Follow-up due today" />
      )}

      <p className="mb-2 truncate text-sm font-medium text-base-100">{lead.company_name}</p>

      <div className="mb-2 flex items-center justify-between">
        <PriorityBadge priority={lead.priority} />
      </div>

      {status && (
        <div className="flex flex-wrap gap-1.5">
          {QUICK_ICONS.filter((q) => status[q.key]).map((q) => (
            <span
              key={q.key}
              title={q.label}
              className="flex h-5 w-5 items-center justify-center rounded bg-success-bg text-success"
            >
              <q.icon size={11} />
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
