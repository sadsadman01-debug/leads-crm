import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Megaphone, Plus } from 'lucide-react'
import { announcementsApi, organizationsApi } from '@/lib/api'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { AUDIENCE_LABELS, type Announcement, type AnnouncementAudience } from '@/types/announcement'

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
          <p className="mt-1 text-sm text-base-400">Broadcast a message to all Organizations, or a targeted subset, through the Notification Center.</p>
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

function CreateAnnouncementModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const { data: orgsData } = useQuery({ queryKey: ['organizations'], queryFn: organizationsApi.list })
  const organizations = orgsData?.organizations ?? []

  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [audience, setAudience] = useState<AnnouncementAudience>('all')
  const [targetOrgIds, setTargetOrgIds] = useState<string[]>([])

  function toggleOrg(id: string) {
    setTargetOrgIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const mutation = useMutation({
    mutationFn: () =>
      announcementsApi.create({
        title: title.trim(),
        message: message.trim(),
        audience,
        ...(audience === 'specific_organizations' ? { target_organization_ids: targetOrgIds } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['announcements'] })
      onClose()
    },
  })

  const canSubmit = title.trim() && message.trim() && (audience !== 'specific_organizations' || targetOrgIds.length > 0)

  return (
    <Modal open onClose={onClose} title="New Announcement" size="lg">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (canSubmit) mutation.mutate()
        }}
        className="space-y-4"
      >
        <div>
          <label className="label" htmlFor="announcement-title">Title</label>
          <input
            id="announcement-title"
            required
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. New feature: Outreach Sequences"
          />
        </div>

        <div>
          <label className="label" htmlFor="announcement-message">Message</label>
          <textarea
            id="announcement-message"
            required
            className="input min-h-[120px] resize-y"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="What's new, what's changing, or what to expect…"
          />
        </div>

        <div>
          <label className="label">Audience</label>
          <select className="input" value={audience} onChange={(e) => setAudience(e.target.value as AnnouncementAudience)}>
            {(Object.keys(AUDIENCE_LABELS) as AnnouncementAudience[]).map((a) => (
              <option key={a} value={a}>
                {AUDIENCE_LABELS[a]}
              </option>
            ))}
          </select>
        </div>

        {audience === 'specific_organizations' && (
          <div>
            <label className="label">Organizations</label>
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-base-700/60 p-2">
              {organizations.length === 0 ? (
                <p className="p-2 text-sm text-base-400">No organizations found.</p>
              ) : (
                organizations.map((org) => (
                  <label key={org.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-base-200 hover:bg-base-800">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-base-600 bg-base-800"
                      checked={targetOrgIds.includes(org.id)}
                      onChange={() => toggleOrg(org.id)}
                    />
                    {org.name}
                  </label>
                ))
              )}
            </div>
            <p className="mt-1 text-xs text-base-500">{targetOrgIds.length} organization{targetOrgIds.length === 1 ? '' : 's'} selected</p>
          </div>
        )}

        {mutation.isError && <p className="text-sm text-danger">{(mutation.error as Error).message}</p>}

        <div className="flex justify-end gap-3 border-t border-base-700/60 pt-4">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={mutation.isPending || !canSubmit}>
            {mutation.isPending ? 'Publishing…' : 'Publish Announcement'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
