import { useQuery } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { Mail, Tag as TagIcon, Columns3, Paperclip, Sparkles, History, UserCog } from 'lucide-react'
import { leadsApi } from '@/lib/api'
import { Avatar } from '@/components/ui/RoleBadge'
import type { LeadActivity } from '@/types/lead'

const TYPE_ICON: Record<string, typeof History> = {
  created: Sparkles,
  status: Mail,
  stage: Columns3,
  tags: TagIcon,
  industry: TagIcon,
  attachment: Paperclip,
  assignment: UserCog,
}

export function LeadTimeline({ leadId }: { leadId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['lead-activities', leadId],
    queryFn: () => leadsApi.activities(leadId),
  })

  const activities = data?.activities ?? []

  return (
    <div className="card p-6">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-base-300">Timeline</h2>

      {isLoading ? (
        <p className="text-sm text-base-400">Loading timeline…</p>
      ) : activities.length === 0 ? (
        <p className="text-sm text-base-400">No activity recorded yet.</p>
      ) : (
        <ul className="space-y-4">
          {activities.map((a: LeadActivity, i: number) => {
            const Icon = TYPE_ICON[a.type] ?? History
            return (
              <li key={a.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-base-800 text-base-300">
                    <Icon size={13} />
                  </div>
                  {i < activities.length - 1 && <div className="mt-1 w-px flex-1 bg-base-700/60" />}
                </div>
                <div className="pb-1">
                  <p className="text-sm text-base-200">{a.message}</p>
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs text-base-500">
                    {a.actor_name && (
                      <>
                        <Avatar name={a.actor_name} size={4} />
                        <span>{a.actor_name}</span>
                        <span>·</span>
                      </>
                    )}
                    <span>{formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}</span>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
