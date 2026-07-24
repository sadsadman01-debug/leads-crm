import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Filter, X, ChevronDown } from 'lucide-react'
import { tagsApi, isFiltersEmpty } from '@/lib/api'
import { LEAD_SOURCES, PRIORITIES, STATUS_TOGGLE_FIELDS, type LeadFilters } from '@/types/lead'

export function FiltersBar({
  filters,
  onChange,
}: {
  filters: LeadFilters
  onChange: (filters: LeadFilters) => void
}) {
  const [open, setOpen] = useState(false)
  const { data: tagsData } = useQuery({ queryKey: ['tags'], queryFn: tagsApi.list })
  const tags = tagsData?.tags ?? []

  function set<K extends keyof LeadFilters>(key: K, value: LeadFilters[K]) {
    onChange({ ...filters, [key]: value })
  }

  function toggleTag(tagId: string) {
    const current = filters.tagIds ?? []
    set('tagIds', current.includes(tagId) ? current.filter((t) => t !== tagId) : [...current, tagId])
  }

  const statusCheck = filters.statusChecks?.[0]

  function setStatusCheck(field: string) {
    if (!field) {
      set('statusChecks', undefined)
      return
    }
    set('statusChecks', [{ field, value: true }])
  }

  const activeCount = [
    filters.priority,
    filters.leadSource,
    filters.tagIds?.length ? true : undefined,
    filters.statusChecks?.length ? true : undefined,
    filters.dateFrom,
    filters.dateTo,
    filters.hasWebsite,
    filters.hasSocialProfile,
  ].filter(Boolean).length

  return (
    <div className="relative">
      <button className="btn-secondary" onClick={() => setOpen((o) => !o)}>
        <Filter size={16} />
        Filters
        {activeCount > 0 && <span className="pill bg-accent-500/20 text-accent-400 px-1.5">{activeCount}</span>}
        <ChevronDown size={14} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="card absolute right-0 z-50 mt-2 w-[380px] p-5 animate-slideUp">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-base-100">Filter Leads</h3>
              {!isFiltersEmpty(filters) && (
                <button
                  className="flex items-center gap-1 text-xs text-base-400 hover:text-danger"
                  onClick={() => onChange({})}
                >
                  <X size={12} />
                  Clear all
                </button>
              )}
            </div>

            <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
              <div>
                <label className="label">Outreach Status</label>
                <select
                  className="input"
                  value={statusCheck?.field ?? ''}
                  onChange={(e) => setStatusCheck(e.target.value)}
                >
                  <option value="">Any status</option>
                  {STATUS_TOGGLE_FIELDS.map((s) => (
                    <option key={s.field} value={s.field}>{s.label}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Priority</label>
                  <select
                    className="input"
                    value={filters.priority ?? ''}
                    onChange={(e) => set('priority', (e.target.value || undefined) as any)}
                  >
                    <option value="">Any priority</option>
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="label">Lead Source</label>
                  <select
                    className="input"
                    value={filters.leadSource ?? ''}
                    onChange={(e) => set('leadSource', (e.target.value || undefined) as any)}
                  >
                    <option value="">Any source</option>
                    {LEAD_SOURCES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Date Added From</label>
                  <input
                    type="date"
                    className="input"
                    value={filters.dateFrom ?? ''}
                    onChange={(e) => set('dateFrom', e.target.value || undefined)}
                  />
                </div>
                <div>
                  <label className="label">Date Added To</label>
                  <input
                    type="date"
                    className="input"
                    value={filters.dateTo ?? ''}
                    onChange={(e) => set('dateTo', e.target.value || undefined)}
                  />
                </div>
              </div>

              {tags.length > 0 && (
                <div>
                  <label className="label">Tags</label>
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((tag) => {
                      const active = filters.tagIds?.includes(tag.id)
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => toggleTag(tag.id)}
                          className={`pill border ${
                            active
                              ? 'border-accent-500 bg-accent-500/15 text-accent-400'
                              : 'border-base-600 bg-base-800 text-base-300 hover:bg-base-700'
                          }`}
                        >
                          {tag.name}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm text-base-200">
                  <input
                    type="checkbox"
                    checked={Boolean(filters.hasWebsite)}
                    onChange={(e) => set('hasWebsite', e.target.checked || undefined)}
                    className="h-4 w-4 rounded border-base-600 bg-base-800 text-accent-500 focus:ring-accent-500"
                  />
                  Has website
                </label>
                <label className="flex items-center gap-2 text-sm text-base-200">
                  <input
                    type="checkbox"
                    checked={Boolean(filters.hasSocialProfile)}
                    onChange={(e) => set('hasSocialProfile', e.target.checked || undefined)}
                    className="h-4 w-4 rounded border-base-600 bg-base-800 text-accent-500 focus:ring-accent-500"
                  />
                  Has social profile
                </label>
              </div>
            </div>

            <button className="btn-primary mt-4 w-full" onClick={() => setOpen(false)}>
              Apply
            </button>
          </div>
        </>
      )}
    </div>
  )
}
