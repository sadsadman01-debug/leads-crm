import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Search, ChevronLeft, ChevronRight, Plus, ArrowUpDown, Building2 } from 'lucide-react'
import { leadsApi } from '@/lib/api'
import { PriorityBadge, TagPill, Badge } from '@/components/ui/Badge'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'

const PAGE_SIZE = 20

const SORT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'created_at', label: 'Date Added' },
  { value: 'updated_at', label: 'Last Updated' },
  { value: 'company_name', label: 'Company Name' },
  { value: 'priority', label: 'Priority' },
]

export function LeadsList() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [sortBy, setSortBy] = useState('created_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const debouncedSearch = useDebouncedValue(search, 300)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['leads', { search: debouncedSearch, page, sortBy, sortOrder }],
    queryFn: () => leadsApi.list({ search: debouncedSearch, page, pageSize: PAGE_SIZE, sortBy, sortOrder }),
    placeholderData: (prev) => prev,
  })

  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  function toggleSort(field: string) {
    if (sortBy === field) {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(field)
      setSortOrder('asc')
    }
    setPage(1)
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

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-base-100">Leads</h1>
          <p className="mt-1 text-sm text-base-400">{total} total lead{total === 1 ? '' : 's'}</p>
        </div>
        <button className="btn-primary" onClick={() => navigate('/leads/new')}>
          <Plus size={16} />
          Add New Lead
        </button>
      </div>

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
                <th className="px-5 py-3 font-medium">Company</th>
                <th className="px-5 py-3 font-medium">Contact</th>
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
                  <td className="px-5 py-3.5">
                    <div className="font-medium text-base-100">{lead.company_name}</div>
                    <div className="text-xs text-base-400">{lead.address || '—'}</div>
                  </td>
                  <td className="px-5 py-3.5 text-base-300">
                    <div>{lead.phone || '—'}</div>
                    <div className="text-xs text-base-400">{lead.email || '—'}</div>
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
    </div>
  )
}
