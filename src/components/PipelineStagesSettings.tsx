import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Plus, Trash2, AlertCircle } from 'lucide-react'
import { pipelineStagesApi } from '@/lib/api'
import type { PipelineStage } from '@/types/lead'

function SortableStageRow({
  stage,
  onRename,
  onDelete,
}: {
  stage: PipelineStage
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stage.id })
  const [name, setName] = useState(stage.name)

  useEffect(() => setName(stage.name), [stage.name])

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
      <input
        className="input flex-1"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          const trimmed = name.trim()
          if (trimmed && trimmed !== stage.name) onRename(stage.id, trimmed)
          else setName(stage.name)
        }}
      />
      <button className="btn-ghost px-2 hover:text-danger" onClick={() => onDelete(stage.id)} title="Delete stage">
        <Trash2 size={16} />
      </button>
    </div>
  )
}

export function PipelineStagesSettings() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['pipeline-stages'], queryFn: pipelineStagesApi.list })
  const [stages, setStages] = useState<PipelineStage[]>([])
  const [newStageName, setNewStageName] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (data) setStages(data.stages)
  }, [data])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['pipeline-stages'] })
  }

  const reorderMutation = useMutation({
    mutationFn: (orderedIds: string[]) => pipelineStagesApi.reorder(orderedIds),
    onSuccess: invalidate,
  })

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => pipelineStagesApi.rename(id, name),
    onSuccess: invalidate,
  })

  const createMutation = useMutation({
    mutationFn: (name: string) => pipelineStagesApi.create(name),
    onSuccess: () => {
      invalidate()
      setNewStageName('')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => pipelineStagesApi.remove(id),
    onSuccess: invalidate,
    onError: (e: any) => setError(e?.message ?? 'Could not delete stage'),
  })

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = stages.findIndex((s) => s.id === active.id)
    const newIndex = stages.findIndex((s) => s.id === over.id)
    const reordered = arrayMove(stages, oldIndex, newIndex)
    setStages(reordered)
    reorderMutation.mutate(reordered.map((s) => s.id))
  }

  return (
    <div className="card p-6">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-base-300">Pipeline Stages</h2>
      <p className="mb-4 text-xs text-base-400">
        Drag to reorder. These are the Kanban board columns — each lead sits in exactly one stage.
      </p>

      {error && (
        <div className="mb-3 flex items-start gap-2 rounded-lg bg-danger-bg px-3 py-2.5 text-sm text-danger">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-base-400">Loading stages…</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={stages.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {stages.map((stage) => (
                <SortableStageRow
                  key={stage.id}
                  stage={stage}
                  onRename={(id, name) => renameMutation.mutate({ id, name })}
                  onDelete={(id) => {
                    setError(null)
                    deleteMutation.mutate(id)
                  }}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (newStageName.trim()) createMutation.mutate(newStageName.trim())
        }}
      >
        <input
          className="input flex-1"
          placeholder="New stage name, e.g. Proposal Sent"
          value={newStageName}
          onChange={(e) => setNewStageName(e.target.value)}
        />
        <button type="submit" className="btn-secondary" disabled={!newStageName.trim() || createMutation.isPending}>
          <Plus size={16} />
          Add Stage
        </button>
      </form>
    </div>
  )
}
