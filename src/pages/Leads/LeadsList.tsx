import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
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
  SlidersHorizontal,
  LayoutDashboard,
  X,
} from 'lucide-react'
import { bulkApi, exportApi, industriesApi, leadsApi, pipelineStagesApi, teamApi, customFieldsApi } from '@/lib/api'
import { PriorityBadge, ScoreBadge, TagPill, Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/RoleBadge'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { FiltersBar } from '@/components/FiltersBar'
import { BulkActionsBar } from '@/components/BulkActionsBar'
import { ImportModal } from '@/components/ImportModal'
import { KanbanBoard } from '@/components/kanban/KanbanBoard'
import { useAuth, hasPermission } from '@/contexts/AuthContext'
import type { LeadFilters } from '@/types/lead'

const PAGE_SIZE = 20
type View = 'table' | 'kanban'

const SORT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'created_at', label: 'Date Added' },
  { value: 'updated_at', label: 'Last Updated' },
  { value: 'company_name', label: 'Company Name' },
  { value: 'priority', label: 'Priority' },
]

const STANDARD_COLUMNS = [
  { id: 'contact', label: 'Contact' },
  { id: 'stage', label: 'Stage' },
  { id: 'tags', label: 'Tags' },
  { id: 'priority', label: 'Priority' },
  { id: 'score', label: 'Lead Score' },
  { id: 'status', label: 'Status' },
  { id: 'assignedTo', label: 'Assigned To' },
  { id: 'industry', label: 'Industry' },
  { id: 'updated', label: 'Updated' },
] as const

const DEFAULT_VISIBLE_COLUMNS = ['contact', 'stage', 'tags', 'priority', 'score', 'status', 'assignedTo', 'updated']
// Tablet gets a reduced default column set (Company is always shown separately)
// so the table stays readable without horizontal scrolling at 768-1023px.
const TABLET_DEFAULT_VISIBLE_COLUMNS = ['stage', 'priority', 'updated']
const COLUMNS_STORAGE_KEY = 'leads-table-columns-v1'

function getDefaultVisibleColumns(): string[] {
  const isTablet = typeof window !== 'undefined' && window.matchMedia('(min-width: 768px) and (max-width: 1023px)').matches
  return isTablet ? TABLET_DEFAULT_VISIBLE_COLUMNS : DEFAULT_VISIBLE_COLUMNS
}

function loadStoredColumns(): Set<string> {
  try {
    const raw = localStorage.getItem(COLUMNS_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return new Set(parsed)
    }
  } catch {
    // fall through to tier-aware default
  }
  return new Set(getDefaultVisibleColumns())
}

export function LeadsList() {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  const canImport = hasPermission(profile, 'canImport')
  const canExport = hasPermission(profile, 'canExport')
  const drillState = location.state as { initialFilters?: LeadFilters; drillLabel?: string; prefillSearch?: string } | null
  const [search, setSearch] = useState(() => drillState?.prefillSearch ?? '')
  const [page, setPage] = useState(1)
  const [sortBy, setSortBy] = useState('created_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [filters, setFilters] = useState<LeadFilters>(() => drillState?.initialFilters ?? {})
  const [drillLabel, setDrillLabel] = useState<string | null>(drillState?.drillLabel ?? null)

  // Clear the navigation state once consumed so a later browser back/forward
  // doesn't re-apply a stale drill-down context.
  useEffect(() => {
    if (drillState) navigate(location.pathname, { replace: true, state: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function clearDrillFilter() {
    setFilters({})
    setDrillLabel(null)
    setPage(1)
  }
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

  const { data: industriesData } = useQuery({ queryKey: ['industries'], queryFn: industriesApi.list })
  const industries = industriesData?.industries ?? []
  const selectedIndustryId = filters.industryId

  const { data: rosterData } = useQuery({ queryKey: ['team-roster'], queryFn: teamApi.roster })
  const assigneeNameById = new Map((rosterData?.members ?? []).map((m) => [m.id, m.nickname || m.email]))

  const { data: customFieldsData } = useQuery({ queryKey: ['custom-fields'], queryFn: customFieldsApi.list })
  const leadCustomFields = (customFieldsData?.fields ?? []).filter((f) => f.applies_to === 'leads' || f.applies_to === 'both')
  const [visibleColumnIds, setVisibleColumnIds] = useState<Set<string>>(() => loadStoredColumns())
  const [columnsMenuOpen, setColumnsMenuOpen] = useState(false)
  const visibleCustomFields = leadCustomFields.filter((f) => visibleColumnIds.has(f.id))
  const visibleStandardColumns = STANDARD_COLUMNS.filter((c) => visibleColumnIds.has(c.id))

  useEffect(() => {
    localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify([...visibleColumnIds]))
  }, [visibleColumnIds])

  function toggleColumn(id: string) {
    setVisibleColumnIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function resetColumnsToDefault() {
    setVisibleColumnIds(new Set(getDefaultVisibleColumns()))
  }

  function formatCustomFieldCell(value: any): string {
    if (value === null || value === undefined || value === '') return '—'
    if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : '—'
    if (typeof value === 'boolean') return value ? 'Yes' : 'No'
    return String(value)
  }

  const industryNameById = new Map(industries.map((i) => [i.id, i.name]))

  function renderStandardCell(columnId: string, lead: NonNullable<typeof data>['leads'][number]) {
    switch (columnId) {
      case 'contact':
        return (
          <td key={columnId} className="px-5 py-3.5 text-base-300 desktop:px-6 desktop:py-4">
            <div>{lead.phone || '—'}</div>
            <div className="text-xs text-base-400">{lead.email || '—'}</div>
          </td>
        )
      case 'stage':
        return (
          <td key={columnId} className="px-5 py-3.5 desktop:px-6 desktop:py-4">
            {lead.stage_id && stageNameById.has(lead.stage_id) ? (
              <Badge tone="neutral">{stageNameById.get(lead.stage_id)}</Badge>
            ) : (
              <span className="text-base-400">—</span>
            )}
          </td>
        )
      case 'tags':
        return (
          <td key={columnId} className="px-5 py-3.5 desktop:px-6 desktop:py-4">
            <div className="flex flex-wrap gap-1.5">
              {lead.tags.slice(0, 2).map((t) => (
                <TagPill key={t.id} label={t.name} />
              ))}
              {lead.tags.length > 2 && <span className="text-xs text-base-400">+{lead.tags.length - 2}</span>}
            </div>
          </td>
        )
      case 'priority':
        return (
          <td key={columnId} className="px-5 py-3.5 desktop:px-6 desktop:py-4">
            <PriorityBadge priority={lead.priority} />
          </td>
        )
      case 'score':
        return (
          <td key={columnId} className="px-5 py-3.5 desktop:px-6 desktop:py-4">
            <ScoreBadge score={lead.score} band={lead.band} />
          </td>
        )
      case 'status':
        return <td key={columnId} className="px-5 py-3.5 desktop:px-6 desktop:py-4">{statusSummary(lead)}</td>
      case 'assignedTo':
        return (
          <td key={columnId} className="px-5 py-3.5 desktop:px-6 desktop:py-4">
            {lead.assigned_to && assigneeNameById.has(lead.assigned_to) ? (
              <div className="flex items-center gap-1.5">
                <Avatar name={assigneeNameById.get(lead.assigned_to)} size={5} />
                <span className="truncate text-xs text-base-300">{assigneeNameById.get(lead.assigned_to)}</span>
              </div>
            ) : (
              <span className="text-base-400">—</span>
            )}
          </td>
        )
      case 'industry':
        return (
          <td key={columnId} className="px-5 py-3.5 text-base-300 desktop:px-6 desktop:py-4">
            {lead.industry_id ? industryNameById.get(lead.industry_id) ?? '—' : '—'}
          </td>
        )
      case 'updated':
        return (
          <td key={columnId} className="px-5 py-3.5 text-base-400 desktop:px-6 desktop:py-4">
            {new Date(lead.updated_at).toLocaleDateString()}
          </td>
        )
      default:
        return null
    }
  }

  function openLead(leadId: string) {
    navigate(`/leads/${leadId}`, {
      state: { navContext: { search: debouncedSearch, filters, sortBy, sortOrder } },
    })
  }

  function selectIndustry(industryId: string | undefined) {
    setFilters((prev) => ({ ...prev, industryId }))
    setPage(1)
  }

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
      {drillLabel && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg bg-accent-500/10 px-4 py-3 text-sm text-accent-300">
          <LayoutDashboard size={16} className="shrink-0" />
          <span className="flex-1">
            Showing leads where: <strong className="text-accent-200">{drillLabel}</strong>
          </span>
          <button className="flex items-center gap-1 text-accent-300 hover:text-accent-100" onClick={clearDrillFilter}>
            <X size={14} />
            Clear filter
          </button>
          <button className="btn-ghost px-2 text-accent-300 hover:text-accent-100" onClick={() => navigate('/dashboard')}>
            Back to Dashboard
          </button>
        </div>
      )}

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-base-100">Leads</h1>
          <p className="mt-1 text-sm text-base-400">{total} total lead{total === 1 ? '' : 's'}</p>
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
          {view === 'table' && (
            <div className="relative">
              <button className="btn-secondary" onClick={() => setColumnsMenuOpen((o) => !o)}>
                <SlidersHorizontal size={16} />
                Columns
              </button>
              {columnsMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setColumnsMenuOpen(false)} />
                  <div className="card absolute right-0 z-50 mt-2 max-h-[70vh] w-64 overflow-y-auto p-3 sm:right-0">
                    <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-base-400">Columns</p>
                    <label className="flex cursor-not-allowed items-center gap-2 rounded-md px-1 py-1.5 text-sm text-base-400 opacity-60">
                      <input type="checkbox" checked disabled className="h-4 w-4 rounded border-base-600 bg-base-800" />
                      Company (always shown)
                    </label>
                    <div className="my-1.5 border-t border-base-700/60" />
                    {STANDARD_COLUMNS.map((c) => (
                      <label key={c.id} className="flex items-center gap-2 rounded-md px-1 py-1.5 text-sm text-base-200 hover:bg-base-800">
                        <input
                          type="checkbox"
                          checked={visibleColumnIds.has(c.id)}
                          onChange={() => toggleColumn(c.id)}
                          className="h-4 w-4 rounded border-base-600 bg-base-800 text-accent-500 focus:ring-accent-500"
                        />
                        {c.label}
                      </label>
                    ))}
                    {leadCustomFields.length > 0 && (
                      <>
                        <div className="my-1.5 border-t border-base-700/60" />
                        <p className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-base-400">Custom Fields</p>
                        {leadCustomFields.map((f) => (
                          <label key={f.id} className="flex items-center gap-2 rounded-md px-1 py-1.5 text-sm text-base-200 hover:bg-base-800">
                            <input
                              type="checkbox"
                              checked={visibleColumnIds.has(f.id)}
                              onChange={() => toggleColumn(f.id)}
                              className="h-4 w-4 rounded border-base-600 bg-base-800 text-accent-500 focus:ring-accent-500"
                            />
                            {f.label}
                          </label>
                        ))}
                      </>
                    )}
                    <div className="my-1.5 border-t border-base-700/60" />
                    <button
                      className="w-full rounded-md px-1 py-1.5 text-left text-sm text-accent-400 hover:bg-base-800"
                      onClick={resetColumnsToDefault}
                    >
                      Reset to Default
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
          {canImport && (
            <button className="btn-secondary" onClick={() => setImportOpen(true)}>
              <Upload size={16} />
              Import
            </button>
          )}
          {canExport && (
            <button className="btn-secondary" disabled={exporting} onClick={handleExport}>
              <Download size={16} />
              {exporting ? 'Exporting…' : 'Export'}
            </button>
          )}
          <button className="btn-primary" onClick={() => navigate('/leads/new')}>
            <Plus size={16} />
            Add New Lead
          </button>
        </div>
      </div>

      {industries.length > 0 && (
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
          <button
            className={`shrink-0 pill border transition-colors ${
              !selectedIndustryId
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
                selectedIndustryId === industry.id
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
        <KanbanBoard industryId={selectedIndustryId} assignedTo={filters.assignedTo} />
      ) : (
        <>
      <div className="card mb-4 flex flex-wrap items-center gap-3 p-4">
        <div className="relative min-w-0 flex-1 sm:min-w-[260px]">
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
          className="input w-auto flex-1 sm:flex-initial"
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

      {isLoading && !data ? (
        <div className="card p-12 text-center text-base-400">Loading leads…</div>
      ) : isError ? (
        <div className="card p-12 text-center text-danger">Failed to load leads.</div>
      ) : data && data.leads.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 p-16 text-center">
          <Building2 size={32} className="text-base-500" />
          <p className="text-base-300">{drillLabel ? 'No leads match this filter yet.' : 'No leads found.'}</p>
          {!drillLabel && (
            <button className="btn-primary" onClick={() => navigate('/leads/new')}>
              <Plus size={16} />
              Add your first lead
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Desktop / tablet: table */}
          <div className="card hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-base-700/60 text-xs uppercase tracking-wide text-base-400">
                  <th className="w-10 px-5 py-3 desktop:px-6 desktop:py-4">
                    <input
                      type="checkbox"
                      checked={allOnPageSelected}
                      onChange={toggleSelectAllOnPage}
                      className="h-4 w-4 rounded border-base-600 bg-base-800 text-accent-500 focus:ring-accent-500"
                    />
                  </th>
                  <th className="w-64 min-w-[220px] px-5 py-3 font-medium desktop:w-96 desktop:px-6 desktop:py-4">Company</th>
                  {visibleStandardColumns.map((c) => (
                    <th key={c.id} className="px-5 py-3 font-medium desktop:px-6 desktop:py-4">{c.label}</th>
                  ))}
                  {visibleCustomFields.map((f) => (
                    <th key={f.id} className="px-5 py-3 font-medium desktop:px-6 desktop:py-4">{f.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data?.leads.map((lead) => (
                  <tr
                    key={lead.id}
                    onClick={() => openLead(lead.id)}
                    className="cursor-pointer border-b border-base-800 transition-colors hover:bg-base-850"
                  >
                    <td className="px-5 py-3.5 desktop:px-6 desktop:py-4" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(lead.id)}
                        onChange={() => toggleSelected(lead.id)}
                        className="h-4 w-4 rounded border-base-600 bg-base-800 text-accent-500 focus:ring-accent-500"
                      />
                    </td>
                    <td className="w-64 min-w-[220px] px-5 py-3.5 desktop:w-96 desktop:px-6 desktop:py-4">
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
                    {visibleStandardColumns.map((c) => renderStandardCell(c.id, lead))}
                    {visibleCustomFields.map((f) => (
                      <td key={f.id} className="px-5 py-3.5 text-base-300 desktop:px-6 desktop:py-4">
                        {formatCustomFieldCell(lead.custom_fields?.[f.id])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile / small tablet: stacked cards */}
          <div className="grid gap-3 md:hidden">
            {data?.leads.map((lead) => (
              <div
                key={lead.id}
                onClick={() => openLead(lead.id)}
                className="card flex cursor-pointer items-start gap-1 p-3 active:bg-base-850"
              >
                <label
                  className="flex h-11 w-11 shrink-0 items-center justify-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(lead.id)}
                    onChange={() => toggleSelected(lead.id)}
                    className="h-5 w-5 rounded border-base-600 bg-base-800 text-accent-500 focus:ring-accent-500"
                  />
                </label>

                <div className="min-w-0 flex-1 py-1">
                  <div className="flex items-center gap-1.5">
                    {lead.status?.is_overdue && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-danger" title="Overdue follow-up" />
                    )}
                    {!lead.status?.is_overdue && lead.status?.is_due_today && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-warn" title="Follow-up due today" />
                    )}
                    <p className="truncate font-medium text-base-100">{lead.company_name}</p>
                  </div>

                  <p className="mt-0.5 truncate text-xs text-base-400">
                    {[lead.phone, lead.email].filter(Boolean).join(' · ') || lead.address || '—'}
                  </p>

                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <PriorityBadge priority={lead.priority} />
                    <ScoreBadge score={lead.score} band={lead.band} />
                    {statusSummary(lead)}
                    {lead.stage_id && stageNameById.has(lead.stage_id) && (
                      <Badge tone="neutral">{stageNameById.get(lead.stage_id)}</Badge>
                    )}
                  </div>

                  <p className="mt-2 text-xs text-base-500">
                    Updated {new Date(lead.updated_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {data && total > 0 && (
        <div className="mt-4 flex flex-col gap-3 text-sm text-base-400 sm:flex-row sm:items-center sm:justify-between">
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
