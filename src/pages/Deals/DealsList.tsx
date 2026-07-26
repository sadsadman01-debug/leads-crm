import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, Rows3, Columns3, ChevronLeft, ChevronRight, Handshake } from 'lucide-react'
import { dealsApi, industriesApi, dealStagesApi, teamApi } from '@/lib/api'
import { formatMaskedCurrency } from '@/lib/currency'
import { Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/RoleBadge'
import { DealForm } from '@/components/DealForm'
import { DealKanbanBoard } from '@/components/kanban/DealKanbanBoard'
import { useAuth } from '@/contexts/AuthContext'
import type { Deal, DealFilters } from '@/types/deal'

const PAGE_SIZE = 20
type View = 'table' | 'kanban'

export function DealsList() {
  const { profile } = useAuth()
  const [view, setView] = useState<View>('table')
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState<DealFilters>({})
  const [formOpen, setFormOpen] = useState(false)
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['deals', { page, filters }],
    queryFn: () => dealsApi.list({ page, pageSize: PAGE_SIZE, filters }),
    placeholderData: (prev) => prev,
    enabled: view === 'table',
  })

  const { data: stagesData } = useQuery({ queryKey: ['deal-stages'], queryFn: dealStagesApi.list })
  const stages = stagesData?.stages ?? []
  const stageNameById = new Map(stages.map((s) => [s.id, s.name]))

  const { data: industriesData } = useQuery({ queryKey: ['industries'], queryFn: industriesApi.list })
  const industries = industriesData?.industries ?? []

  const { data: rosterData } = useQuery({ queryKey: ['team-roster'], queryFn: teamApi.roster })
  const roster = rosterData?.members ?? []
  const nameById = new Map(roster.map((m) => [m.id, m.nickname || m.email]))

  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  function selectIndustry(industryId: string | undefined) {
    setFilters((prev) => ({ ...prev, industryId }))
    setPage(1)
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-base-100">Deals</h1>
          <p className="mt-1 text-sm text-base-400">{total} total deal{total === 1 ? '' : 's'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex gap-1 rounded-lg bg-base-850 p-1">
            <button
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                view === 'table' ? 'bg-accent-500 text-white' : 'text-base-300 hover:text-base-100'
              }`}
              onClick={() => setView('table')}
            >
              <Rows3 size={15} />
              Table
            </button>
            <button
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                view === 'kanban' ? 'bg-accent-500 text-white' : 'text-base-300 hover:text-base-100'
              }`}
              onClick={() => setView('kanban')}
            >
              <Columns3 size={15} />
              Kanban
            </button>
          </div>
          <button
            className="btn-primary"
            onClick={() => {
              setEditingDeal(null)
              setFormOpen(true)
            }}
          >
            <Plus size={16} />
            Add New Deal
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {profile && (
          <button
            className={`pill border transition-colors ${
              filters.assignedTo === profile.id
                ? 'border-accent-500 bg-accent-500/15 text-accent-400'
                : 'border-base-600 bg-base-800 text-base-300 hover:bg-base-700'
            }`}
            onClick={() =>
              setFilters((prev) => ({
                ...prev,
                assignedTo: prev.assignedTo === profile.id ? undefined : profile.id,
              }))
            }
          >
            My Deals
          </button>
        )}
        {roster.length > 0 && (
          <select
            className="input w-auto"
            value={filters.assignedTo ?? ''}
            onChange={(e) => setFilters((prev) => ({ ...prev, assignedTo: e.target.value || undefined }))}
          >
            <option value="">Everyone</option>
            {roster.map((m) => (
              <option key={m.id} value={m.id}>{m.nickname || m.email}</option>
            ))}
          </select>
        )}
      </div>

      {industries.length > 0 && (
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
          <button
            className={`shrink-0 pill border transition-colors ${
              !filters.industryId
                ? 'border-accent-500 bg-accent-500/15 text-accent-400'
                : 'border-base-600 bg-base-800 text-base-300 hover:bg-base-700'
            }`}
            onClick={() => selectIndustry(undefined)}
          >
            All Industries
          </button>
          {industries.map((industry) => (
            <button
              key={industry.id}
              className={`shrink-0 pill border transition-colors ${
                filters.industryId === industry.id
                  ? 'border-accent-500 bg-accent-500/15 text-accent-400'
                  : 'border-base-600 bg-base-800 text-base-300 hover:bg-base-700'
              }`}
              onClick={() => selectIndustry(industry.id)}
            >
              {industry.name}
            </button>
          ))}
        </div>
      )}

      {view === 'kanban' ? (
        <DealKanbanBoard
          industryId={filters.industryId}
          assignedTo={filters.assignedTo}
          onOpenDeal={async (dealId) => {
            const deal = await dealsApi.get(dealId)
            setEditingDeal(deal)
            setFormOpen(true)
          }}
        />
      ) : isLoading && !data ? (
        <div className="card p-12 text-center text-base-400">Loading deals…</div>
      ) : isError ? (
        <div className="card p-12 text-center text-danger">Failed to load deals.</div>
      ) : data && data.deals.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 p-16 text-center">
          <Handshake size={32} className="text-base-500" />
          <p className="text-base-300">No deals yet.</p>
          <button className="btn-primary" onClick={() => setFormOpen(true)}>
            <Plus size={16} />
            Add your first deal
          </button>
        </div>
      ) : (
        <>
          {/* Desktop / tablet: table */}
          <div className="card hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-base-700/60 text-xs uppercase tracking-wide text-base-400">
                  <th className="px-5 py-3 font-medium desktop:px-6 desktop:py-4">Deal</th>
                  <th className="px-5 py-3 font-medium desktop:w-80 desktop:px-6 desktop:py-4">Company</th>
                  <th className="px-5 py-3 font-medium desktop:px-6 desktop:py-4">Value</th>
                  <th className="px-5 py-3 font-medium desktop:px-6 desktop:py-4">Stage</th>
                  <th className="hidden px-5 py-3 font-medium lg:table-cell desktop:px-6 desktop:py-4">Probability</th>
                  <th className="hidden px-5 py-3 font-medium lg:table-cell desktop:px-6 desktop:py-4">Owner</th>
                  <th className="hidden px-5 py-3 font-medium lg:table-cell desktop:px-6 desktop:py-4">Expected Close</th>
                </tr>
              </thead>
              <tbody>
                {data?.deals.map((deal) => (
                  <tr
                    key={deal.id}
                    onClick={() => {
                      setEditingDeal(deal)
                      setFormOpen(true)
                    }}
                    className="cursor-pointer border-b border-base-800 transition-colors hover:bg-base-850"
                  >
                    <td className="px-5 py-3.5 font-medium text-base-100 desktop:px-6 desktop:py-4">{deal.name}</td>
                    <td className="px-5 py-3.5 text-base-300 desktop:px-6 desktop:py-4">{deal.lead?.company_name ?? '—'}</td>
                    <td className="px-5 py-3.5 font-semibold text-accent-400 desktop:px-6 desktop:py-4">
                      {formatMaskedCurrency(deal.value, deal.currency)}
                    </td>
                    <td className="px-5 py-3.5 desktop:px-6 desktop:py-4">
                      <Badge tone="neutral">
                        {(deal.stage_id && stageNameById.get(deal.stage_id)) ?? '—'}
                      </Badge>
                    </td>
                    <td className="hidden px-5 py-3.5 text-base-300 lg:table-cell desktop:px-6 desktop:py-4">{deal.probability}%</td>
                    <td className="hidden px-5 py-3.5 lg:table-cell desktop:px-6 desktop:py-4">
                      {deal.owner_id && nameById.has(deal.owner_id) ? (
                        <div className="flex items-center gap-1.5">
                          <Avatar name={nameById.get(deal.owner_id)} size={5} />
                          <span className="truncate text-xs text-base-300">{nameById.get(deal.owner_id)}</span>
                        </div>
                      ) : (
                        <span className="text-base-400">—</span>
                      )}
                    </td>
                    <td className="hidden px-5 py-3.5 text-base-400 lg:table-cell desktop:px-6 desktop:py-4">
                      {deal.expected_close_date ? new Date(deal.expected_close_date).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile / small tablet: stacked cards */}
          <div className="grid gap-3 md:hidden">
            {data?.deals.map((deal) => (
              <div
                key={deal.id}
                onClick={() => {
                  setEditingDeal(deal)
                  setFormOpen(true)
                }}
                className="card cursor-pointer p-3 active:bg-base-850"
              >
                <p className="truncate font-medium text-base-100">{deal.name}</p>
                <p className="truncate text-xs text-base-400">{deal.lead?.company_name ?? '—'}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-semibold text-accent-400">
                    {formatMaskedCurrency(deal.value, deal.currency)}
                  </span>
                  <Badge tone="neutral">{(deal.stage_id && stageNameById.get(deal.stage_id)) ?? '—'}</Badge>
                  <span className="pill bg-base-800 text-base-300">{deal.probability}%</span>
                </div>
                {deal.expected_close_date && (
                  <p className="mt-2 text-xs text-base-500">
                    Expected close {new Date(deal.expected_close_date).toLocaleDateString()}
                  </p>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {view === 'table' && data && total > 0 && (
        <div className="mt-4 flex flex-col gap-3 text-sm text-base-400 sm:flex-row sm:items-center sm:justify-between">
          <span>Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              <ChevronLeft size={16} />
              Previous
            </button>
            <button
              className="btn-secondary"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      <DealForm
        open={formOpen}
        deal={editingDeal ?? undefined}
        onClose={() => {
          setFormOpen(false)
          setEditingDeal(null)
        }}
      />
    </div>
  )
}
