import { useState } from 'react'
import { Mail, Tag as TagIcon, Trash2, X } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { TagInput } from '@/components/TagInput'

const QUICK_STATUS_ACTIONS = [
  { field: 'cold_email_sent', label: 'Cold Email Sent' },
  { field: 'followup1_sent', label: '1st Follow-up' },
  { field: 'followup2_sent', label: '2nd Follow-up' },
  { field: 'followup3_sent', label: '3rd Follow-up' },
]

export function BulkActionsBar({
  selectedCount,
  onClear,
  onMarkStatus,
  onAddTags,
  onDelete,
  busy,
}: {
  selectedCount: number
  onClear: () => void
  onMarkStatus: (field: string) => void
  onAddTags: (tagNames: string[]) => void
  onDelete: () => void
  busy: boolean
}) {
  const [tagModalOpen, setTagModalOpen] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [tagNames, setTagNames] = useState<string[]>([])

  if (selectedCount === 0) return null

  return (
    <div className="card mb-4 flex flex-wrap items-center gap-3 border-accent-500/40 bg-accent-500/5 p-3 animate-slideUp">
      <button className="btn-ghost px-2" onClick={onClear} title="Clear selection">
        <X size={16} />
      </button>
      <span className="text-sm font-medium text-base-100">{selectedCount} selected</span>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {QUICK_STATUS_ACTIONS.map((a) => (
          <button
            key={a.field}
            className="btn-secondary"
            disabled={busy}
            onClick={() => onMarkStatus(a.field)}
          >
            <Mail size={14} />
            {a.label}
          </button>
        ))}
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
