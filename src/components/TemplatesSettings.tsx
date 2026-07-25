import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { templatesApi } from '@/lib/api'
import type { Template } from '@/types/lead'

const PLACEHOLDER_HINT =
  'Available placeholders: {{company_name}}, {{address}}, {{phone}}, {{email}}, {{website}}, {{lead_source}}, {{priority}}'

function TemplateEditor({
  template,
  onClose,
  onSave,
}: {
  template: Template | null
  onClose: () => void
  onSave: (payload: { name: string; subject: string; body: string }) => void
}) {
  const [name, setName] = useState(template?.name ?? '')
  const [subject, setSubject] = useState(template?.subject ?? '')
  const [body, setBody] = useState(template?.body ?? '')

  return (
    <Modal open onClose={onClose} title={template ? 'Edit Template' : 'New Template'}>
      <div className="space-y-4">
        <div>
          <label className="label">Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Cold Intro" />
        </div>
        <div>
          <label className="label">Subject</label>
          <input
            className="input"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Quick question for {{company_name}}"
          />
        </div>
        <div>
          <label className="label">Body</label>
          <textarea
            className="input min-h-[160px] resize-y"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Hi there, I noticed {{company_name}}…"
          />
          <p className="mt-1.5 text-xs text-base-400">{PLACEHOLDER_HINT}</p>
        </div>
      </div>

      <div className="mt-5 flex justify-end gap-3">
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button
          className="btn-primary"
          disabled={!name.trim()}
          onClick={() => onSave({ name: name.trim(), subject, body })}
        >
          Save
        </button>
      </div>
    </Modal>
  )
}

export function TemplatesSettings() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['templates'], queryFn: templatesApi.list })
  const [editing, setEditing] = useState<Template | 'new' | null>(null)

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['templates'] })
  }

  const createMutation = useMutation({
    mutationFn: (payload: { name: string; subject: string; body: string }) => templatesApi.create(payload),
    onSuccess: () => {
      invalidate()
      setEditing(null)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { name: string; subject: string; body: string } }) =>
      templatesApi.update(id, payload),
    onSuccess: () => {
      invalidate()
      setEditing(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => templatesApi.remove(id),
    onSuccess: invalidate,
  })

  const templates = data?.templates ?? []

  return (
    <div className="card p-6">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-base-300">Email Templates</h2>
        <button className="btn-secondary" onClick={() => setEditing('new')}>
          <Plus size={16} />
          New Template
        </button>
      </div>
      <p className="mb-4 text-xs text-base-400">
        Reusable outreach copy with placeholders — filled in per lead on the lead detail page, then copied to your
        clipboard to paste into your own email client. No email is sent from here.
      </p>

      {isLoading ? (
        <p className="text-sm text-base-400">Loading templates…</p>
      ) : templates.length === 0 ? (
        <p className="text-sm text-base-400">No templates yet.</p>
      ) : (
        <ul className="space-y-2">
          {templates.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-base-700/60 bg-base-850 px-4 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-base-100">{t.name}</p>
                <p className="truncate text-xs text-base-400">{t.subject || '—'}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button className="btn-ghost px-2" onClick={() => setEditing(t)} title="Edit">
                  <Pencil size={16} />
                </button>
                <button
                  className="btn-ghost px-2 hover:text-danger"
                  onClick={() => deleteMutation.mutate(t.id)}
                  title="Delete"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <TemplateEditor
          template={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={(payload) =>
            editing === 'new' ? createMutation.mutate(payload) : updateMutation.mutate({ id: editing.id, payload })
          }
        />
      )}
    </div>
  )
}
