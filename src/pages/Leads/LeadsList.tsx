import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Plus,
  ArrowUpDown,
  Building2,
  Upload,
  Download,
  Rows3,
  Columns3,
} from 'lucide-react'
import { bulkApi, exportApi, leadsApi, pipelineStagesApi } from '@/lib/api'
import { PriorityBadge, TagPill, Badge } from '@/components/ui/Badge'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { FiltersBar } from '@/components/FiltersBar'
import { BulkActionsBar } from '@/components/BulkActionsBar'
import { ImportModal } from '@/components/ImportModal'
import { KanbanBoard } from '@/components/kanban/KanbanBoard'
import type { LeadFilters } from '@/types/lead'

const PAGE_SIZE = 20
type View = 'table' | 'kanban'

const SORT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'created_at', label: 'Date Added' },
  { value: 'updated_at', label: 'Last Updated' },
  { value: 'company_name', label: 'Company Name' },
  { value: 'priority', label: 'Priority' },
]

export function LeadsList() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [sortBy, setSortBy] = useState('created_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [filters, setFilters] = useState<LeadFilters>({})
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [importOpen, setImportOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [view, setView] = useState<View>('table')
  const debouncedSearch = useDebouncedValue(search, 300)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['leads', { search: debouncedSearch, page, sortBy, sortOrder, filters }],
    queryFn: () => leadsApi.list({ search: debouncedSearch, page, pageSize: PAGE_SIZE, sortBy, sortOrder, filters }),
    placeholderData: (prev) => prev,
    enabled: view === 'table',
  })

  const { data: stagesData } = useQuery({ queryKey: ['pipeline-stages'], queryFn: pipelineStagesApi.list })
  const stageNameById = new Map((stagesData?.stages ?? []).map((s) => [s.id, s.name]))

  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  function updateFilters(next: LeadFilters) {
    setFilters(next)
    setPage(1)
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleSelectAllOnPage() {
    if (!data) return
    const allSelected = data.leads.every((l) => selectedIds.has(l.id))
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allSelected) {
        data.leads.forEach((l) => next.delete(l.id))
      } else {
        data.leads.forEach((l) => next.add(l.id))
      }
      return next
    })
  }

  function invalidateLeads() {
    queryClient.invalidateQueries({ queryKey: ['leads'] })
  }

  const bulkStatusMutation = useMutation({
    mutationFn: (field: string) => bulkApi.markStatus([...selectedIds], field, true),
    onSuccess: () => {
      invalidateLeads()
      setSelectedIds(new Set())
    },
  })

  const bulkTagMutation = useMutation({
    mutationFn: (tagNames: string[]) => bulkApi.addTags([...selectedIds], tagNames),
    onSuccess: () => {
      invalidateLeads()
      setSelectedIds(new Set())
      queryClient.invalidateQueries({ queryKey: ['tags'] })
    },
  })

  const bulkDeleteMutation = useMutation({
    mutationFn: () => bulkApi.remove([...selectedIds]),
    onSuccess: () => {
      invalidateLeads()
      setSelectedIds(new Set())
    },
  })

  const bulkBusy = bulkStatusMutation.isPending || bulkTagMutation.isPending || bulkDeleteMutation.isPending

  async function handleExport() {
    setExporting(true)
    try {
      await exportApi.downloadCsv({ search: debouncedSearch, filters })
    } finally {
      setExporting(false)
    }
  }

  function statusSummary(lead: (typeof data extends undefined ? never : NonNullable<typeof data>)['leads'][number]) {
    const s = lead.status
    if (!s) return null
    if (s.converted) return <Badge tone="success">Converted</Badge>
    if (s.email_invalid || s.phone_invalid) return <Badge tone="danger">Invalid Contact</Badge>
    if (s.replied) return <Badge tone="accent">Replied</Badge>
    if (s.cold_email_sent || s.whatsapp_sent) return <Badge tone="warn">Outreach Sent</Badge>
    return <Badge tone="neutral">New</Badge>
  }

  const allOnPageSelected = Boolean(data?.leads.length) && data!.leads.every((l) => selectedIds.has(l.id))

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-base-100">Leads</h1>
          <p className="mt-1 text-sm text-base-400">{total} total lead{total === 1 ? '' : 's'}</p>
        </div>
        <div className="flex gap-2">
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
          <button className="btn-secondary" onClick={() => setImportOpen(true)}>
            <Upload size={16} />
            Import
          </button>
          <button className="btn-secondary" disabled={exporting} onClick={handleExport}>
            <Download size={16} />
            {exporting ? 'Exporting…' : 'Export'}
          </button>
          <button className="btn-primary" onClick={() => navigate('/leads/new')}>
            <Plus size={16} />
            Add New Lead
          </button>
        </div>
      </div>

      {view === 'kanban' ? (
        <KanbanBoard />
      ) : (
        <>
      <div className="card mb-4 flex flex-wrap items-center gap-3 p-4">
        <div className="relative min-w-[260px] flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base-400" />
          <input
            className="input pl-9"
            placeholder="Search by company, phone, email, or address…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
        </div>

        <FiltersBar filters={filters} onChange={updateFilters} />

        <select
          className="input w-auto"
          value={sortBy}
          onChange={(e) => {
            setSortBy(e.target.value)
            setPage(1)
          }}
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              Sort: {opt.label}
            </option>
          ))}
        </select>

        <button
          className="btn-secondary"
          onClick={() => setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'))}
          title="Toggle sort direction"
        >
          <ArrowUpDown size={16} />
          {sortOrder === 'asc' ? 'Asc' : 'Desc'}
        </button>
      </div>

      <BulkActionsBar
        selectedCount={selectedIds.size}
        onClear={() => setSelectedIds(new Set())}
        onMarkStatus={(field) => bulkStatusMutation.mutate(field)}
        onAddTags={(tagNames) => bulkTagMutation.mutate(tagNames)}
        onDelete={() => bulkDeleteMutation.mutate()}
        busy={bulkBusy}
      />

      <div className="card overflow-hidden">
        {isLoading && !data ? (
          <div className="p-12 text-center text-base-400">Loading leads…</div>
        ) : isError ? (
          <div className="p-12 text-center text-danger">Failed to load leads.</div>
        ) : data && data.leads.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-16 text-center">
            <Building2 size={32} className="text-base-500" />
            <p className="text-base-300">No leads found.</p>
            <button className="btn-primary" onClick={() => navigate('/leads/new')}>
              <Plus size={16} />
              Add your first lead
            </button>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-base-700/60 text-xs uppercase tracking-wide text-base-400">
                <th className="w-10 px-5 py-3">
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    onChange={toggleSelectAllOnPage}
                    className="h-4 w-4 rounded border-base-600 bg-base-800 text-accent-500 focus:ring-accent-500"
                  />
                </th>
                <th className="px-5 py-3 font-medium">Company</th>
                <th className="px-5 py-3 font-medium">Contact</th>
                <th className="px-5 py-3 font-medium">Stage</th>
                <th className="px-5 py-3 font-medium">Tags</th>
                <th className="px-5 py-3 font-medium">Priority</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {data?.leads.map((lead) => (
                <tr
                  key={lead.id}
                  onClick={() => navigate(`/leads/${lead.id}`)}
                  className="cursor-pointer border-b border-base-800 transition-colors hover:bg-base-850"
                >
                  <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(lead.id)}
                      onChange={() => toggleSelected(lead.id)}
                      className="h-4 w-4 rounded border-base-600 bg-base-800 text-accent-500 focus:ring-accent-500"
                    />
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-1.5">
                      {lead.status?.is_overdue && (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-danger" title="Overdue follow-up" />
                      )}
                      {!lead.status?.is_overdue && lead.status?.is_due_today && (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-warn" title="Follow-up due today" />
                      )}
                      <div className="font-medium text-base-100">{lead.company_name}</div>
                    </div>
                    <div className="text-xs text-base-400">{lead.address || '—'}</div>
                  </td>
                  <td className="px-5 py-3.5 text-base-300">
                    <div>{lead.phone || '—'}</div>
                    <div className="text-xs text-base-400">{lead.email || '—'}</div>
                  </td>
                  <td className="px-5 py-3.5">
                    {lead.stage_id && stageNameById.has(lead.stage_id) ? (
                      <Badge tone="neutral">{stageNameById.get(lead.stage_id)}</Badge>
                    ) : (
                      <span className="text-base-400">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex flex-wrap gap-1.5">
                      {lead.tags.slice(0, 2).map((t) => (
                        <TagPill key={t.id} label={t.name} />
                      ))}
                      {lead.tags.length > 2 && (
                        <span className="text-xs text-base-400">+{lead.tags.length - 2}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <PriorityBadge priority={lead.priority} />
                  </td>
                  <td className="px-5 py-3.5">{statusSummary(lead)}</td>
                  <td className="px-5 py-3.5 text-base-400">
                    {new Date(lead.updated_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {data && total > 0 && (
        <div className="mt-4 flex items-center justify-between text-sm text-base-400">
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              className="btn-secondary"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
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
        </>
      )}

      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onImported={invalidateLeads} />
    </div>
  )
}
