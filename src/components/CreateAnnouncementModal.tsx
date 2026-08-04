import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { announcementsApi, organizationsApi } from '@/lib/api'
import { Modal } from '@/components/ui/Modal'
import { AUDIENCE_LABELS, type AnnouncementAudience } from '@/types/announcement'

/** The Announcements page's own "New Announcement" form, extracted so it can
 * also be opened as a pre-filled shortcut from the Organizations table (Send
 * Announcement, targeted to one Organization) — same data model/delivery
 * mechanism/form, just seeded with an initial audience/target instead of the
 * defaults. */
export function CreateAnnouncementModal({
  onClose,
  initialAudience = 'all',
  initialTargetOrgIds = [],
}: {
  onClose: () => void
  initialAudience?: AnnouncementAudience
  initialTargetOrgIds?: string[]
}) {
  const queryClient = useQueryClient()
  const { data: orgsData } = useQuery({ queryKey: ['organizations'], queryFn: organizationsApi.list })
  const organizations = orgsData?.organizations ?? []

  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [audience, setAudience] = useState<AnnouncementAudience>(initialAudience)
  const [targetOrgIds, setTargetOrgIds] = useState<string[]>(initialTargetOrgIds)

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
