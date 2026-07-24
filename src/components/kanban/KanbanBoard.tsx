import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import { leadsApi, pipelineStagesApi } from '@/lib/api'
import { KanbanColumn } from './KanbanColumn'
import { KanbanCard } from './KanbanCard'
import type { KanbanLead } from '@/types/lead'

export function KanbanBoard() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [activeLead, setActiveLead] = useState<KanbanLead | null>(null)

  const { data: stagesData, isLoading: stagesLoading } = useQuery({
    queryKey: ['pipeline-stages'],
    queryFn: pipelineStagesApi.list,
  })
  const { data: kanbanData, isLoading: leadsLoading } = useQuery({
    queryKey: ['leads-kanban'],
    queryFn: leadsApi.kanban,
  })

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const moveMutation = useMutation({
    mutationFn: ({ leadId, stageId }: { leadId: string; stageId: string }) => leadsApi.updateStage(leadId, stageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads-kanban'] })
      queryClient.invalidateQueries({ queryKey: ['leads'] })
    },
  })

  if (stagesLoading || leadsLoading) {
    return <div className="p-12 text-center text-base-400">Loading board…</div>
  }

  const stages = stagesData?.stages ?? []
  const leads = kanbanData?.leads ?? []

  function handleDragStart(event: DragStartEvent) {
    setActiveLead((event.active.data.current?.lead as KanbanLead) ?? null)
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveLead(null)
    const { active, over } = event
    if (!over) return
    const leadId = String(active.id)
    const newStageId = String(over.id)
    const lead = leads.find((l) => l.id === leadId)
    if (!lead || lead.stage_id === newStageId) return

    queryClient.setQueryData(['leads-kanban'], (prev: any) =>
      prev
        ? { ...prev, leads: prev.leads.map((l: KanbanLead) => (l.id === leadId ? { ...l, stage_id: newStageId } : l)) }
        : prev
    )
    moveMutation.mutate({ leadId, stageId: newStageId })
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {stages.map((stage) => {
          const stageLeads = leads.filter((l) => l.stage_id === stage.id)
          return (
            <KanbanColumn key={stage.id} id={stage.id} title={stage.name} count={stageLeads.length}>
              {stageLeads.map((lead) => (
                <KanbanCard key={lead.id} lead={lead} onOpen={() => navigate(`/leads/${lead.id}`)} />
              ))}
            </KanbanColumn>
          )
        })}
      </div>

      <DragOverlay>
        {activeLead ? <KanbanCard lead={activeLead} onOpen={() => {}} dragging /> : null}
      </DragOverlay>
    </DndContext>
  )
}
