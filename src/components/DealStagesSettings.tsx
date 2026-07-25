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
import { dealStagesApi } from '@/lib/api'
import type { DealStage } from '@/types/deal'

function SortableDealStageRow({
  stage,
  onUpdate,
  onDelete,
}: {
  stage: DealStage
  onUpdate: (id: string, patch: Partial<Pick<DealStage, 'name' | 'default_probability' | 'is_closed' | 'is_won'>>) => void
  onDelete: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stage.id })
  const [name, setName] = useState(stage.name)
  const [probability, setProbability] = useState(stage.default_probability)

  useEffect(() => setName(stage.name), [stage.name])
  useEffect(() => setProbability(stage.default_probability), [stage.default_probability])

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex flex-wrap items-center gap-2 rounded-lg border border-base-700/60 bg-base-850 px-3 py-2.5 ${
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
        className="input min-w-0 flex-1"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          const trimmed = name.trim()
          if (trimmed && trimmed !== stage.name) onUpdate(stage.id, { name: trimmed })
          else setName(stage.name)
        }}
      />
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          min={0}
          max={100}
          className="input w-20"
          value={probability}
          onChange={(e) => setProbability(Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0)))}
          onBlur={() => {
            if (probability !== stage.default_probability) onUpdate(stage.id, { default_probability: probability })
          }}
        />
        <span className="text-xs text-base-400">% win</span>
      </div>
      <label className="flex items-center gap-1.5 text-xs text-base-300">
        <input
          type="checkbox"
          checked={stage.is_closed}
          onChange={(e) => onUpdate(stage.id, { is_closed: e.target.checked })}
          className="h-4 w-4 rounded border-base-600 bg-base-800 text-accent-500 focus:ring-accent-500"
        />
        Closed stage
      </label>
      {stage.is_closed && (
        <label className="flex items-center gap-1.5 text-xs text-base-300">
          <input
            type="checkbox"
            checked={stage.is_won}
            onChange={(e) => onUpdate(stage.id, { is_won: e.target.checked })}
            className="h-4 w-4 rounded border-base-600 bg-base-800 text-accent-500 focus:ring-accent-500"
          />
          Won
        </label>
      )}
      <button className="btn-ghost px-2 hover:text-danger" onClick={() => onDelete(stage.id)} title="Delete stage">
        <Trash2 size={16} />
      </button>
    </div>
  )
}

export function DealStagesSettings() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['deal-stages'], queryFn: dealStagesApi.list })
  const [stages, setStages] = useState<DealStage[]>([])
  const [newStageName, setNewStageName] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (data) setStages(data.stages)
  }, [data])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['deal-stages'] })
  }

  const reorderMutation = useMutation({
    mutationFn: (orderedIds: string[]) => dealStagesApi.reorder(orderedIds),
    onSuccess: invalidate,
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<DealStage> }) => dealStagesApi.update(id, patch),
    onSuccess: invalidate,
  })

  const createMutation = useMutation({
    mutationFn: (name: string) => dealStagesApi.create({ name }),
    onSuccess: () => {
      invalidate()
      setNewStageName('')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => dealStagesApi.remove(id),
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
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-base-300">Deal Stages</h2>
      <p className="mb-4 text-xs text-base-400">
        The Deals pipeline — separate from the Lead pipeline. Each stage has a default win probability applied to
        new deals entering it; mark a stage "Closed" (and optionally "Won") to have it require a win/loss reason and
        auto-set the actual close date.
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
                <SortableDealStageRow
                  key={stage.id}
                  stage={stage}
                  onUpdate={(id, patch) => updateMutation.mutate({ id, patch })}
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
          placeholder="New stage name, e.g. Contract Sent"
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
