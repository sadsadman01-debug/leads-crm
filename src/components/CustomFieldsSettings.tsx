import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  GripVertical, Plus, Trash2, Pencil, Type, Hash, Calendar, List, ListChecks, CheckSquare, Link as LinkIcon, AlignLeft,
} from 'lucide-react'
import { customFieldsApi } from '@/lib/api'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { CustomFieldInput } from '@/components/CustomFieldsSection'
import { FIELD_TYPES, APPLIES_TO_OPTIONS, type CustomFieldDefinition, type FieldType, type AppliesTo } from '@/types/customField'

const TYPE_ICON: Record<FieldType, typeof Type> = {
  text: Type,
  number: Hash,
  date: Calendar,
  dropdown: List,
  multiselect: ListChecks,
  checkbox: CheckSquare,
  url: LinkIcon,
  textarea: AlignLeft,
}

function SortableFieldRow({
  field,
  onEdit,
  onDelete,
}: {
  field: CustomFieldDefinition
  onEdit: () => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.id })
  const Icon = TYPE_ICON[field.field_type]

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 rounded-lg border border-base-700/60 bg-base-850 px-3 py-2.5 ${
        isDragging ? 'opacity-60 shadow-glow' : ''
      }`}
    >
      <button
        {...attributes}
        {...listeners}
        className="flex h-11 w-11 shrink-0 cursor-grab touch-none items-center justify-center text-base-500 hover:text-base-300 active:cursor-grabbing"
        aria-label="Drag to reorder"
      >
        <GripVertical size={18} />
      </button>
      <Icon size={16} className="shrink-0 text-base-400" />
      <span className="flex-1 truncate text-sm font-medium text-base-100">{field.label}</span>
      <Badge tone="neutral">{APPLIES_TO_OPTIONS.find((a) => a.value === field.applies_to)?.label}</Badge>
      <Badge tone="accent">{FIELD_TYPES.find((t) => t.value === field.field_type)?.label}</Badge>
      {field.required && <Badge tone="warn">Required</Badge>}
      <button className="btn-ghost px-2 text-accent-400" onClick={onEdit} title="Edit field">
        <Pencil size={16} />
      </button>
      <button className="btn-ghost px-2 hover:text-danger" onClick={onDelete} title="Delete field">
        <Trash2 size={16} />
      </button>
    </div>
  )
}

export function CustomFieldsSettings() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['custom-fields'], queryFn: customFieldsApi.list })
  const fields = data?.fields ?? []
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<CustomFieldDefinition | null>(null)
  const [deleting, setDeleting] = useState<CustomFieldDefinition | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['custom-fields'] })
  }

  const reorderMutation = useMutation({
    mutationFn: (orderedIds: string[]) => customFieldsApi.reorder(orderedIds),
    onSuccess: invalidate,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => customFieldsApi.remove(id),
    onSuccess: () => {
      invalidate()
      setDeleting(null)
    },
  })

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = fields.findIndex((f) => f.id === active.id)
    const newIndex = fields.findIndex((f) => f.id === over.id)
    const reordered = arrayMove(fields, oldIndex, newIndex)
    queryClient.setQueryData(['custom-fields'], { fields: reordered })
    reorderMutation.mutate(reordered.map((f) => f.id))
  }

  return (
    <div className="card p-6">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-base-300">Custom Fields</h2>
        <button
          className="btn-secondary"
          onClick={() => {
            setEditing(null)
            setFormOpen(true)
          }}
        >
          <Plus size={16} />
          Add Custom Field
        </button>
      </div>
      <p className="mb-4 text-xs text-base-400">
        Extra fields rendered on the Lead and/or Deal forms. Drag to reorder.
      </p>

      {isLoading ? (
        <p className="text-sm text-base-400">Loading fields…</p>
      ) : fields.length === 0 ? (
        <p className="py-4 text-center text-sm text-base-400">No custom fields defined yet.</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {fields.map((field) => (
                <SortableFieldRow
                  key={field.id}
                  field={field}
                  onEdit={() => {
                    setEditing(field)
                    setFormOpen(true)
                  }}
                  onDelete={() => setDeleting(field)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <CustomFieldFormModal
        key={editing?.id ?? 'new'}
        open={formOpen}
        field={editing}
        onClose={() => setFormOpen(false)}
        onSaved={invalidate}
      />

      <Modal open={Boolean(deleting)} onClose={() => setDeleting(null)} title={`Delete "${deleting?.label}"?`}>
        <p className="mb-5 text-sm text-base-300">
          Existing values already stored in leads/deals for this field will become inaccessible (hidden, not
          deleted) — this cannot be undone from the UI.
        </p>
        <div className="flex justify-end gap-3">
          <button className="btn-secondary" onClick={() => setDeleting(null)}>
            Cancel
          </button>
          <button
            className="btn-danger"
            disabled={deleteMutation.isPending}
            onClick={() => deleting && deleteMutation.mutate(deleting.id)}
          >
            {deleteMutation.isPending ? 'Deleting…' : 'Delete Field'}
          </button>
        </div>
      </Modal>
    </div>
  )
}

function CustomFieldFormModal({
  open,
  field,
  onClose,
  onSaved,
}: {
  open: boolean
  field: CustomFieldDefinition | null
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = Boolean(field)
  const [label, setLabel] = useState(field?.label ?? '')
  const [appliesTo, setAppliesTo] = useState<AppliesTo>(field?.applies_to ?? 'leads')
  const [fieldType, setFieldType] = useState<FieldType>(field?.field_type ?? 'text')
  const [optionsText, setOptionsText] = useState((field?.options ?? []).join('\n'))
  const [required, setRequired] = useState(field?.required ?? false)
  const [defaultValue, setDefaultValue] = useState(field?.default_value ?? '')
  const [previewValue, setPreviewValue] = useState<any>(null)

  const options = optionsText.split('\n').map((o) => o.trim()).filter(Boolean)
  const needsOptions = fieldType === 'dropdown' || fieldType === 'multiselect'

  const createMutation = useMutation({
    mutationFn: () =>
      customFieldsApi.create({
        applies_to: appliesTo,
        label: label.trim(),
        field_type: fieldType,
        options: needsOptions ? options : undefined,
        required,
        default_value: defaultValue || null,
      }),
    onSuccess: () => {
      onSaved()
      onClose()
    },
  })

  const updateMutation = useMutation({
    mutationFn: () =>
      customFieldsApi.update(field!.id, {
        label: label.trim(),
        applies_to: appliesTo,
        options: needsOptions ? options : undefined,
        required,
        default_value: defaultValue || null,
      }),
    onSuccess: () => {
      onSaved()
      onClose()
    },
  })

  const mutation = isEdit ? updateMutation : createMutation
  const canSave = label.trim().length > 0 && (!needsOptions || options.length > 0)

  const previewField: CustomFieldDefinition = {
    id: 'preview',
    label: label || 'Field label',
    applies_to: appliesTo,
    field_type: fieldType,
    options: needsOptions ? options : null,
    required,
    default_value: defaultValue || null,
    display_order: 0,
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Custom Field' : 'Add Custom Field'}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          mutation.mutate()
        }}
        className="space-y-4"
      >
        <div>
          <label className="label">Field Label</label>
          <input required className="input" value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Applies To</label>
            <select className="input" value={appliesTo} onChange={(e) => setAppliesTo(e.target.value as AppliesTo)}>
              {APPLIES_TO_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Field Type</label>
            <select
              className="input"
              value={fieldType}
              disabled={isEdit}
              onChange={(e) => setFieldType(e.target.value as FieldType)}
            >
              {FIELD_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
        </div>

        {needsOptions && (
          <div>
            <label className="label">Options (one per line)</label>
            <textarea
              className="input min-h-[90px] resize-y"
              value={optionsText}
              onChange={(e) => setOptionsText(e.target.value)}
              placeholder={'Small\nMedium\nLarge'}
            />
          </div>
        )}

        <div>
          <label className="label">Default Value (optional)</label>
          <input className="input" value={defaultValue} onChange={(e) => setDefaultValue(e.target.value)} />
        </div>

        <label className="flex items-center gap-2.5 text-sm text-base-200">
          <input
            type="checkbox"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
            className="h-4 w-4 rounded border-base-600 bg-base-800 text-accent-500 focus:ring-accent-500"
          />
          Required when creating a record
        </label>

        <div className="rounded-lg border border-base-700/60 bg-base-850 p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-base-400">Live Preview</p>
          <CustomFieldInput field={previewField} value={previewValue} onChange={setPreviewValue} />
        </div>

        {mutation.isError && <p className="text-sm text-danger">{(mutation.error as Error).message}</p>}

        <div className="flex justify-end gap-3 border-t border-base-700/60 pt-4">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={!canSave || mutation.isPending}>
            {mutation.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Field'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
