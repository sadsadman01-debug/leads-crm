import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Mail, MessageCircle, Linkedin, Tag as TagIcon, Trash2, X } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { TagInput } from '@/components/TagInput'
import { outreachSequencesApi } from '@/lib/api'
import type { OutreachChannel } from '@/types/lead'

const CHANNEL_ICON: Record<OutreachChannel, typeof Mail> = { email: Mail, whatsapp: MessageCircle, linkedin: Linkedin }
const CHANNELS: OutreachChannel[] = ['email', 'whatsapp', 'linkedin']

export function BulkActionsBar({
  selectedCount,
  onClear,
  onMarkStatus,
  onMarkOutreachStage,
  onAddTags,
  onDelete,
  busy,
}: {
  selectedCount: number
  onClear: () => void
  onMarkStatus: (field: string) => void
  onMarkOutreachStage: (stageId: string) => void
  onAddTags: (tagNames: string[]) => void
  onDelete: () => void
  busy: boolean
}) {
  const [tagModalOpen, setTagModalOpen] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [tagNames, setTagNames] = useState<string[]>([])
  const { data: sequenceData } = useQuery({ queryKey: ['outreach-sequence-stages'], queryFn: outreachSequencesApi.list })

  // Only the initial-contact stage per channel — the most common bulk quick
  // action ("mark these leads as emailed") — since per-stage-number bulk UI
  // for arbitrarily long sequences isn't worth the added complexity here.
  const initialTouchStages = CHANNELS.map((channel) =>
    (sequenceData?.stages ?? []).find((s) => s.channel === channel && s.stage_number === 0)
  ).filter((s): s is NonNullable<typeof s> => Boolean(s))

  if (selectedCount === 0) return null

  return (
    <div className="card mb-4 flex flex-wrap items-center gap-3 border-accent-500/40 bg-accent-500/5 p-3 animate-slideUp">
      <button className="btn-ghost px-2" onClick={onClear} title="Clear selection">
        <X size={16} />
      </button>
      <span className="text-sm font-medium text-base-100">{selectedCount} selected</span>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {initialTouchStages.map((stage) => {
          const Icon = CHANNEL_ICON[stage.channel]
          return (
            <button
              key={stage.id}
              className="btn-secondary"
              disabled={busy}
              onClick={() => onMarkOutreachStage(stage.id)}
            >
              <Icon size={14} />
              Mark {stage.stage_label}
            </button>
          )
        })}
        <button className="btn-secondary" disabled={busy} onClick={() => setTagModalOpen(true)}>
          <TagIcon size={14} />
          Add Tag
        </button>
        <button className="btn-danger" disabled={busy} onClick={() => setDeleteModalOpen(true)}>
          <Trash2 size={14} />
          Delete
        </button>
      </div>

      <Modal open={tagModalOpen} onClose={() => setTagModalOpen(false)} title={`Add tags to ${selectedCount} leads`}>
        <TagInput value={tagNames} onChange={setTagNames} />
        <div className="mt-5 flex justify-end gap-3">
          <button className="btn-secondary" onClick={() => setTagModalOpen(false)}>Cancel</button>
          <button
            className="btn-primary"
            disabled={tagNames.length === 0 || busy}
            onClick={() => {
              onAddTags(tagNames)
              setTagNames([])
              setTagModalOpen(false)
            }}
          >
            Add Tags
          </button>
        </div>
      </Modal>

      <Modal open={deleteModalOpen} onClose={() => setDeleteModalOpen(false)} title="Delete selected leads?">
        <p className="mb-5 text-sm text-base-300">
          This will permanently delete <strong>{selectedCount}</strong> lead{selectedCount === 1 ? '' : 's'} and all
          associated status history and attachments. This cannot be undone.
        </p>
        <div className="flex justify-end gap-3">
          <button className="btn-secondary" onClick={() => setDeleteModalOpen(false)}>Cancel</button>
          <button
            className="btn-danger"
            disabled={busy}
            onClick={() => {
              onDelete()
              setDeleteModalOpen(false)
            }}
          >
            Delete {selectedCount} Leads
          </button>
        </div>
      </Modal>
    </div>
  )
}
