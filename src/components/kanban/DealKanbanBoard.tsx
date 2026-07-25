import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import { dealsApi, dealStagesApi, teamApi } from '@/lib/api'
import { KanbanColumn } from './KanbanColumn'
import { DealKanbanCard } from './DealKanbanCard'
import { CloseDealModal } from '@/components/CloseDealModal'
import type { KanbanDeal, DealStage } from '@/types/deal'

export function DealKanbanBoard({
  industryId,
  assignedTo,
  onOpenDeal,
}: {
  industryId?: string
  assignedTo?: string
  onOpenDeal: (dealId: string) => void
}) {
  const queryClient = useQueryClient()
  const [activeDeal, setActiveDeal] = useState<KanbanDeal | null>(null)
  const [pendingClose, setPendingClose] = useState<{ dealId: string; dealName: string; stage: DealStage } | null>(null)

  const { data: stagesData, isLoading: stagesLoading } = useQuery({
    queryKey: ['deal-stages'],
    queryFn: dealStagesApi.list,
  })
  const { data: kanbanData, isLoading: dealsLoading } = useQuery({
    queryKey: ['deals-kanban', industryId, assignedTo],
    queryFn: () => dealsApi.kanban(industryId, assignedTo),
  })
  const { data: rosterData } = useQuery({ queryKey: ['team-roster'], queryFn: teamApi.roster })
  const nameById = new Map((rosterData?.members ?? []).map((m) => [m.id, m.nickname || m.email]))

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['deals-kanban'] })
    queryClient.invalidateQueries({ queryKey: ['deals'] })
    queryClient.invalidateQueries({ queryKey: ['revenue-summary'] })
  }

  const moveMutation = useMutation({
    mutationFn: (payload: { dealId: string; stageId: string; outcome_reason?: string; actual_close_date?: string }) =>
      dealsApi.updateStage(payload.dealId, {
        stage_id: payload.stageId,
        outcome_reason: payload.outcome_reason,
        actual_close_date: payload.actual_close_date,
      }),
    onSuccess: invalidate,
  })

  if (stagesLoading || dealsLoading) {
    return <div className="p-12 text-center text-base-400">Loading board…</div>
  }

  const stages = stagesData?.stages ?? []
  const deals = kanbanData?.deals ?? []

  function handleDragStart(event: DragStartEvent) {
    setActiveDeal((event.active.data.current?.deal as KanbanDeal) ?? null)
  }

  function moveDealToStage(dealId: string, newStageId: string) {
    const deal = deals.find((d) => d.id === dealId)
    const stage = stages.find((s) => s.id === newStageId)
    if (!deal || !stage || deal.stage_id === newStageId) return

    if (stage.is_closed) {
      setPendingClose({ dealId, dealName: deal.name, stage })
      return
    }

    queryClient.setQueryData(['deals-kanban', industryId, assignedTo], (prev: any) =>
      prev
        ? { ...prev, deals: prev.deals.map((d: KanbanDeal) => (d.id === dealId ? { ...d, stage_id: newStageId } : d)) }
        : prev
    )
    moveMutation.mutate({ dealId, stageId: newStageId })
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDeal(null)
    const { active, over } = event
    if (!over) return
    moveDealToStage(String(active.id), String(over.id))
  }

  return (
    <>
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 md:snap-none">
          {stages.map((stage) => {
            const stageDeals = deals.filter((d) => d.stage_id === stage.id)
            return (
              <KanbanColumn key={stage.id} id={stage.id} title={stage.name} count={stageDeals.length}>
                {stageDeals.map((deal) => (
                  <DealKanbanCard
                    key={deal.id}
                    deal={deal}
                    stages={stages}
                    onOpen={() => onOpenDeal(deal.id)}
                    onMoveToStage={(stageId) => moveDealToStage(deal.id, stageId)}
                    ownerName={deal.owner_id ? nameById.get(deal.owner_id) : undefined}
                  />
                ))}
              </KanbanColumn>
            )
          })}
        </div>

        <DragOverlay>
          {activeDeal ? (
            <DealKanbanCard deal={activeDeal} stages={stages} onOpen={() => {}} onMoveToStage={() => {}} dragging />
          ) : null}
        </DragOverlay>
      </DndContext>

      <CloseDealModal
        open={pendingClose !== null}
        dealName={pendingClose?.dealName ?? ''}
        isWon={pendingClose?.stage.is_won ?? false}
        busy={moveMutation.isPending}
        onClose={() => setPendingClose(null)}
        onConfirm={(payload) => {
          if (!pendingClose) return
          moveMutation.mutate(
            { dealId: pendingClose.dealId, stageId: pendingClose.stage.id, ...payload },
            { onSuccess: () => setPendingClose(null) }
          )
        }}
      />
    </>
  )
}
