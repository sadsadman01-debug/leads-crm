import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Handshake } from 'lucide-react'
import { dealsApi } from '@/lib/api'
import { formatCurrency } from '@/lib/currency'
import { Badge } from '@/components/ui/Badge'
import { DealForm } from '@/components/DealForm'
import { useDealStageNames } from '@/hooks/useDealStageNames'
import type { Deal } from '@/types/deal'

export function LeadDealsPanel({ leadId, companyName }: { leadId: string; companyName: string }) {
  const queryClient = useQueryClient()
  const [formOpen, setFormOpen] = useState(false)
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null)
  const stageNameById = useDealStageNames()

  const { data } = useQuery({
    queryKey: ['deals', { leadId }],
    queryFn: () => dealsApi.list({ filters: { leadId } }),
  })

  const deals = data?.deals ?? []

  return (
    <div className="card p-6">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-base-300">Deals</h2>
        <button
          className="btn-ghost px-2 text-accent-400"
          onClick={() => {
            setEditingDeal(null)
            setFormOpen(true)
          }}
        >
          <Plus size={16} />
          New Deal
        </button>
      </div>

      {deals.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <Handshake size={24} className="text-base-500" />
          <p className="text-sm text-base-400">No deals linked to this lead yet.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {deals.map((deal) => (
            <li
              key={deal.id}
              onClick={() => {
                setEditingDeal(deal)
                setFormOpen(true)
              }}
              className="cursor-pointer rounded-lg border border-base-700/60 bg-base-850 px-3 py-2.5 transition-colors hover:bg-base-800"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-medium text-base-100">{deal.name}</p>
                <span className="shrink-0 text-sm font-semibold text-accent-400">
                  {formatCurrency(Number(deal.value), deal.currency)}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <Badge tone="neutral">{(deal.stage_id && stageNameById.get(deal.stage_id)) ?? '—'}</Badge>
                <span className="pill bg-base-800 text-base-300">{deal.probability}%</span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <DealForm
        open={formOpen}
        leadId={leadId}
        leadCompanyName={companyName}
        deal={editingDeal ?? undefined}
        onClose={() => {
          setFormOpen(false)
          setEditingDeal(null)
        }}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ['deals', { leadId }] })}
      />
    </div>
  )
}
