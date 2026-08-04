import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Mail, Tag as TagIcon, Columns3, Paperclip, Sparkles, History, UserCog, Handshake, Trophy, Activity as ActivityIcon } from 'lucide-react'
import { teamActivityApi, teamApi } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Avatar } from '@/components/ui/RoleBadge'
import { formatRelativeTime } from '@/lib/relativeTime'
import type { TeamActivityEntry, TeamActivityTypeFilter } from '@/types/teamActivity'

const TYPE_ICON: Record<string, typeof History> = {
  created: Sparkles,
  status: Mail,
  stage: Columns3,
  tags: TagIcon,
  industry: TagIcon,
  attachment: Paperclip,
  assignment: UserCog,
  deal: Handshake,
}

const PAGE_SIZE = 50

function ActivityRow({ entry }: { entry: TeamActivityEntry }) {
  const navigate = useNavigate()
  const Icon = TYPE_ICON[entry.type] ?? History

  return (
    <button
      onClick={() => navigate(`/leads/${entry.lead_id}`)}
      className={`flex w-full items-start gap-3 rounded-lg border-b border-base-800 px-2 py-3 text-left transition-colors hover:bg-base-850 ${
        entry.is_win ? 'bg-success-bg/40' : ''
      }`}
    >
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          entry.is_win ? 'bg-success-bg text-success' : 'bg-base-800 text-base-300'
        }`}
      >
        {entry.is_win ? <Trophy size={15} /> : <Icon size={15} />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-base-200">
          {entry.actor_name && <span className="font-medium text-base-100">{entry.actor_name}</span>} {entry.message}
          {entry.company_name && <span className="text-base-400"> · {entry.company_name}</span>}
        </p>
        <div className="mt-1 flex items-center gap-1.5 text-xs text-base-500">
          {entry.actor_name && <Avatar name={entry.actor_name} size={4} />}
          <span>{formatRelativeTime(entry.created_at)}</span>
        </div>
      </div>
    </button>
  )
}

export function TeamActivityPage() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [memberId, setMemberId] = useState('')
  const [activityType, setActivityType] = useState<TeamActivityTypeFilter>('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [activities, setActivities] = useState<TeamActivityEntry[]>([])

  const filters = { memberId: memberId || undefined, activityType: activityType || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined }
  const filterKey = JSON.stringify(filters)

  const { data: rosterData } = useQuery({ queryKey: ['team-roster'], queryFn: teamApi.roster })
  const members = rosterData?.members ?? []

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['team-activity', filterKey, page],
    queryFn: () => teamActivityApi.list({ ...filters, page, pageSize: PAGE_SIZE }),
    placeholderData: (prev) => prev,
  })

  // Reset pagination whenever a filter changes.
  useEffect(() => {
    setPage(1)
    setActivities([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey])

  useEffect(() => {
    if (!data) return
    setActivities((prev) => (page === 1 ? data.activities : [...prev, ...data.activities]))
  }, [data, page])

  // Realtime — mirrors NotificationBell's exact pattern (per-insert
  // invalidate-and-refetch rather than a client-side merge). lead_activities
  // has no organization_id to filter on server-side, so this subscribes
  // unfiltered and relies on the backend's own visibility/org scoping when
  // the invalidated query refetches — only ever refreshes while the viewer
  // is on the first page, which is the common "just landed on this feed" case.
  useEffect(() => {
    if (!profile) return
    const channel = supabase
      .channel(`team-activity-${profile.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lead_activities' }, () => {
        if (page === 1) queryClient.invalidateQueries({ queryKey: ['team-activity', filterKey, 1] })
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [profile?.id, queryClient, filterKey, page])

  const total = data?.total ?? 0
  const hasMore = activities.length < total

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-base-100">Team Activity</h1>
        <p className="mt-1 text-sm text-base-400">What everyone's up to across Leads and Deals — live, organization-wide.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select className="input w-auto py-1.5 text-xs" value={memberId} onChange={(e) => setMemberId(e.target.value)}>
          <option value="">All Team Members</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nickname || m.email}
            </option>
          ))}
        </select>
        <select
          className="input w-auto py-1.5 text-xs"
          value={activityType}
          onChange={(e) => setActivityType(e.target.value as TeamActivityTypeFilter)}
        >
          <option value="">All Activity</option>
          <option value="leads">Leads Only</option>
          <option value="deals">Deals Only</option>
          <option value="wins">Wins Only</option>
        </select>
        <input type="date" className="input w-auto py-1.5 text-xs" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <span className="text-xs text-base-500">to</span>
        <input type="date" className="input w-auto py-1.5 text-xs" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
      </div>

      {isLoading && activities.length === 0 ? (
        <div className="card p-12 text-center text-base-400">Loading activity…</div>
      ) : activities.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 p-16 text-center">
          <ActivityIcon size={32} className="text-base-500" />
          <p className="text-base-300">No activity found for this filter.</p>
        </div>
      ) : (
        <div className="card p-4">
          <div className="space-y-0.5">
            {activities.map((entry) => (
              <ActivityRow key={entry.id} entry={entry} />
            ))}
          </div>
          {hasMore && (
            <div className="mt-3 flex justify-center border-t border-base-700/60 pt-3">
              <button className="btn-secondary" disabled={isFetching} onClick={() => setPage((p) => p + 1)}>
                {isFetching ? 'Loading…' : 'Load More'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
