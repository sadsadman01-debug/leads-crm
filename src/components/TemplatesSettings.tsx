import { useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { templatesApi, customFieldsApi } from '@/lib/api'
import { TEMPLATE_TYPES, type Template, type TemplateType } from '@/types/lead'
import { STANDARD_MERGE_FIELDS } from '@/lib/mergeFields'

function typeHasSubject(value: TemplateType) {
  return TEMPLATE_TYPES.find((t) => t.value === value)?.hasSubject ?? true
}

function InsertPlaceholderMenu({
  customFieldLabels,
  onInsert,
}: {
  customFieldLabels: string[]
  onInsert: (tag: string) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setOpen((o) => !o)}>
        Insert Placeholder ▾
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 max-h-64 w-64 overflow-y-auto rounded-lg border border-base-700/60 bg-base-850 p-1.5 shadow-lg">
          {STANDARD_MERGE_FIELDS.map((f) => (
            <button
              key={f.tag}
              type="button"
              className="block w-full rounded px-2 py-1.5 text-left text-xs text-base-200 hover:bg-base-800"
              onClick={() => {
                onInsert(`{{${f.tag}}}`)
                setOpen(false)
              }}
            >
              {f.label} <span className="text-base-500">{'{{' + f.tag + '}}'}</span>
            </button>
          ))}
          {customFieldLabels.length > 0 && (
            <>
              <div className="my-1 border-t border-base-700/60" />
              {customFieldLabels.map((label) => (
                <button
                  key={label}
                  type="button"
                  className="block w-full rounded px-2 py-1.5 text-left text-xs text-base-200 hover:bg-base-800"
                  onClick={() => {
                    onInsert(`{{custom.${label}}}`)
                    setOpen(false)
                  }}
                >
                  {label} <span className="text-base-500">{'{{custom.' + label + '}}'}</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function TemplateEditor({
  template,
  customFieldLabels,
  onClose,
  onSave,
}: {
  template: Template | null
  customFieldLabels: string[]
  onClose: () => void
  onSave: (payload: { name: string; subject: string; body: string; template_type: TemplateType }) => void
}) {
  const [name, setName] = useState(template?.name ?? '')
  const [templateType, setTemplateType] = useState<TemplateType>(template?.template_type ?? 'cold_email')
  const [subject, setSubject] = useState(template?.subject ?? '')
  const [body, setBody] = useState(template?.body ?? '')
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  const hasSubject = typeHasSubject(templateType)

  function insertIntoBody(tag: string) {
    const el = bodyRef.current
    if (!el) {
      setBody((b) => b + tag)
      return
    }
    const start = el.selectionStart ?? body.length
    const end = el.selectionEnd ?? body.length
    const next = body.slice(0, start) + tag + body.slice(end)
    setBody(next)
    requestAnimationFrame(() => {
      el.focus()
      el.selectionStart = el.selectionEnd = start + tag.length
    })
  }

  return (
    <Modal open onClose={onClose} title={template ? 'Edit Template' : 'New Template'}>
      <div className="space-y-4">
        <div>
          <label className="label">Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Cold Intro" />
        </div>

        <div>
          <label className="label">Template Type</label>
          <select
            className="input"
            value={templateType}
            onChange={(e) => setTemplateType(e.target.value as TemplateType)}
          >
            {TEMPLATE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        {hasSubject && (
          <div>
            <label className="label">Subject</label>
            <input
              className="input"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Quick question for {{company_name}}"
            />
          </div>
        )}

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="label mb-0">{hasSubject ? 'Body' : 'Message'}</label>
            <InsertPlaceholderMenu customFieldLabels={customFieldLabels} onInsert={insertIntoBody} />
          </div>
          <textarea
            ref={bodyRef}
            className="input min-h-[160px] resize-y"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Hi {{contact_name}}, I noticed {{company_name}}…"
          />
          <p className="mt-1.5 text-xs text-base-400">
            Use the Insert Placeholder menu above, or type tags directly, e.g. {'{{company_name}}'}, {'{{contact_name}}'}.
          </p>
        </div>
      </div>

      <div className="mt-5 flex justify-end gap-3">
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button
          className="btn-primary"
          disabled={!name.trim()}
          onClick={() => onSave({ name: name.trim(), subject: hasSubject ? subject : '', body, template_type: templateType })}
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
  const { data: customFieldsData } = useQuery({ queryKey: ['custom-fields'], queryFn: customFieldsApi.list })
  const customFieldLabels = (customFieldsData?.fields ?? [])
    .filter((f) => f.applies_to === 'leads' || f.applies_to === 'both')
    .map((f) => f.label)
  const [editing, setEditing] = useState<Template | 'new' | null>(null)

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['templates'] })
  }

  const createMutation = useMutation({
    mutationFn: (payload: { name: string; subject: string; body: string; template_type: TemplateType }) =>
      templatesApi.create(payload),
    onSuccess: () => {
      invalidate()
      setEditing(null)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string
      payload: { name: string; subject: string; body: string; template_type: TemplateType }
    }) => templatesApi.update(id, payload),
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

  const grouped = useMemo(() => {
    const groups = new Map<TemplateType, Template[]>()
    for (const t of templates) {
      const list = groups.get(t.template_type) ?? []
      list.push(t)
      groups.set(t.template_type, list)
    }
    return TEMPLATE_TYPES.map((t) => ({ type: t, items: groups.get(t.value) ?? [] })).filter((g) => g.items.length > 0)
  }, [templates])

  return (
    <div className="card p-6">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-base-300">Message Templates</h2>
        <button className="btn-secondary" onClick={() => setEditing('new')}>
          <Plus size={16} />
          New Template
        </button>
      </div>
      <p className="mb-4 text-xs text-base-400">
        Reusable outreach copy with placeholders — filled in per lead on the lead detail page, then copied to your
        clipboard to paste into your own email, WhatsApp, LinkedIn, or SMS client. Nothing is sent from here.
      </p>

      {isLoading ? (
        <p className="text-sm text-base-400">Loading templates…</p>
      ) : templates.length === 0 ? (
        <p className="text-sm text-base-400">No templates yet.</p>
      ) : (
        <div className="space-y-4">
          {grouped.map((group) => (
            <div key={group.type.value}>
              <p className="mb-1.5 inline-block rounded-full bg-base-800 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-base-300">
                {group.type.label}
              </p>
              <ul className="space-y-2">
                {group.items.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-base-700/60 bg-base-850 px-4 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-base-100">{t.name}</p>
                      <p className="truncate text-xs text-base-400">
                        {typeHasSubject(t.template_type) ? t.subject || '—' : t.body || '—'}
                      </p>
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
            </div>
          ))}
        </div>
      )}

      {editing && (
        <TemplateEditor
          template={editing === 'new' ? null : editing}
          customFieldLabels={customFieldLabels}
          onClose={() => setEditing(null)}
          onSave={(payload) =>
            editing === 'new' ? createMutation.mutate(payload) : updateMutation.mutate({ id: editing.id, payload })
          }
        />
      )}
    </div>
  )
}
