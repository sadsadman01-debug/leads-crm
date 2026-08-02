import { useQuery } from '@tanstack/react-query'
import { Mail, MessageCircle, Linkedin } from 'lucide-react'
import { outreachSequencesApi } from '@/lib/api'
import type { OutreachChannel } from '@/types/lead'

const CHANNEL_ICON: Record<OutreachChannel, typeof Mail> = { email: Mail, whatsapp: MessageCircle, linkedin: Linkedin }
const CHANNELS: OutreachChannel[] = ['email', 'whatsapp', 'linkedin']

/** Compact "channel icon + N/total completed" pills — the dynamic-sequence
 * replacement for the old fixed per-touch icon strip, since stage count is
 * now per-Organization configurable rather than always exactly 4. Shared by
 * KanbanCard and LeadsList so both read the same cached stage-count query. */
export function OutreachChannelPills({ completedCounts }: { completedCounts: Record<OutreachChannel, number> }) {
  const { data } = useQuery({ queryKey: ['outreach-sequence-stages'], queryFn: outreachSequencesApi.list })
  const stages = data?.stages ?? []

  const totalByChannel: Record<OutreachChannel, number> = { email: 0, whatsapp: 0, linkedin: 0 }
  for (const s of stages) totalByChannel[s.channel]++

  const visible = CHANNELS.filter((c) => completedCounts[c] > 0)
  if (visible.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1">
      {visible.map((c) => {
        const Icon = CHANNEL_ICON[c]
        return (
          <span
            key={c}
            title={`${c[0].toUpperCase()}${c.slice(1)}: ${completedCounts[c]}/${totalByChannel[c]} stages completed`}
            className="flex items-center gap-0.5 rounded bg-success-bg px-1.5 py-0.5 text-[10px] font-medium text-success"
          >
            <Icon size={10} />
            {completedCounts[c]}/{totalByChannel[c]}
          </span>
        )
      })}
    </div>
  )
}
