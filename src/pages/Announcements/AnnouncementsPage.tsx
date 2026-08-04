import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Megaphone, Plus } from 'lucide-react'
import { announcementsApi } from '@/lib/api'
import { Badge } from '@/components/ui/Badge'
import { CreateAnnouncementModal } from '@/components/CreateAnnouncementModal'
import { AUDIENCE_LABELS } from '@/types/announcement'

export function AnnouncementsPage() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['announcements'], queryFn: announcementsApi.list })
  const announcements = data?.announcements ?? []

  const [creating, setCreating] = useState(false)

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => announcementsApi.deactivate(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['announcements'] }),
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-base-100">Announcements</h1>
          <p className="mt-1 text-sm text-base-400">
            Broadcast a message to all Organizations, or a targeted subset — recipients see it as a banner at the top of their Dashboard.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setCreating(true)}>
          <Plus size={16} />
          New Announcement
        </button>
      </div>

      {isLoading ? (
        <div className="card p-12 text-center text-base-400">Loading…</div>
      ) : announcements.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 p-16 text-center">
          <Megaphone size={32} className="text-base-500" />
          <p className="text-base-300">No announcements sent yet.</p>
        </div>
      ) : (
        <div className="card overflow-x-auto p-6">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-base-700/60 text-xs uppercase tracking-wide text-base-400">
                <th className="py-2 pr-3 font-medium">Title</th>
                <th className="px-3 py-2 font-medium">Audience</th>
                <th className="px-3 py-2 font-medium">Sent Date</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {announcements.map((a) => (
                <tr key={a.id} className="border-b border-base-800">
                  <td className="py-3 pr-3 font-medium text-base-100">{a.title}</td>
                  <td className="px-3 py-3 text-base-300">
                    {AUDIENCE_LABELS[a.audience]}
                    {a.audience === 'specific_organizations' && a.target_organization_ids && (
                      <span className="ml-1 text-xs text-base-500">({a.target_organization_ids.length})</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-base-400">{new Date(a.created_at).toLocaleString()}</td>
                  <td className="px-3 py-3">
                    <Badge tone={a.is_active ? 'success' : 'neutral'}>{a.is_active ? 'Active' : 'Inactive'}</Badge>
                  </td>
                  <td className="px-3 py-3">
                    {a.is_active && (
                      <button
                        className="btn-ghost px-2 text-xs"
                        disabled={deactivateMutation.isPending}
                        onClick={() => deactivateMutation.mutate(a.id)}
                      >
                        Unpublish
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && <CreateAnnouncementModal onClose={() => setCreating(false)} />}
    </div>
  )
}
