import { useEffect, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { customFieldsApi, industriesApi, teamApi, reportsApi } from '@/lib/api'
import { ReportViewer } from '@/components/reports/ReportViewer'
import {
  REPORT_TYPES, CHART_TYPES, GROUP_BY_OPTIONS,
  type ReportType, type ChartType, type ReportFilters, type SavedReport, type StarterTemplate,
} from '@/types/report'
import { PRIORITIES } from '@/types/lead'

export function ReportBuilder({
  initial,
  onSaved,
  onCancel,
}: {
  initial?: Partial<SavedReport> | StarterTemplate | null
  onSaved: () => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initial && 'name' in initial ? (initial as any).name : '')
  const [reportType, setReportType] = useState<ReportType>(initial?.report_type ?? 'leads')
  const [groupBy, setGroupBy] = useState<string>((initial as any)?.group_by ?? '')
  const [chartType, setChartType] = useState<ChartType>(initial?.chart_type ?? 'table')
  const [filters, setFilters] = useState<ReportFilters>((initial as any)?.filters ?? {})
  const [visibleToAll, setVisibleToAll] = useState((initial as any)?.visible_to_all ?? false)
  const [runResult, setRunResult] = useState<{ rows: any[]; grouped: boolean; displayCurrency?: string } | null>(null)

  const { data: industriesData } = useQuery({ queryKey: ['industries'], queryFn: industriesApi.list })
  const { data: rosterData } = useQuery({ queryKey: ['team-roster'], queryFn: teamApi.roster })
  const { data: customFieldsData } = useQuery({ queryKey: ['custom-fields'], queryFn: customFieldsApi.list })

  const groupByOptions = GROUP_BY_OPTIONS.filter((g) => g.reportTypes.includes(reportType))
  const dropdownCustomFields = (customFieldsData?.fields ?? []).filter(
    (f) => f.field_type === 'dropdown' && (f.applies_to === reportType || f.applies_to === 'both')
  )

  const runMutation = useMutation({
    mutationFn: () => reportsApi.run({ report_type: reportType, group_by: groupBy || null, filters }),
    onSuccess: (result) => setRunResult({ rows: result.rows, grouped: Boolean(groupBy), displayCurrency: result.displayCurrency }),
  })

  useEffect(() => {
    runMutation.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportType, groupBy, JSON.stringify(filters)])

  const existingId = initial && 'id' in initial ? (initial as SavedReport).id : undefined

  const saveMutation = useMutation({
    mutationFn: () =>
      existingId
        ? reportsApi.update(existingId, {
            name: name.trim(),
            group_by: groupBy || null,
            filters,
            chart_type: chartType,
            visible_to_all: visibleToAll,
          })
        : reportsApi.create({
            name: name.trim(),
            report_type: reportType,
            group_by: groupBy || null,
            filters,
            chart_type: chartType,
            visible_to_all: visibleToAll,
          }),
    onSuccess: onSaved,
  })

  function setFilter<K extends keyof ReportFilters>(key: K, value: ReportFilters[K]) {
    setFilters((f) => ({ ...f, [key]: value || undefined }))
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[380px_1fr] lg:items-start desktop:grid-cols-[420px_1fr]">
      <div className="card space-y-5 p-6">
        <div>
          <label className="label">Report Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Leads by Source" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-1">
          <div>
            <label className="label">1. Report Type</label>
            <select className="input" value={reportType} onChange={(e) => { setReportType(e.target.value as ReportType); setGroupBy('') }}>
              {REPORT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">2. Group By</label>
            <select className="input" value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
              <option value="">No grouping (row list)</option>
              {groupByOptions.map((g) => (
                <option key={g.value} value={g.value}>{g.label}</option>
              ))}
              {dropdownCustomFields.map((f) => (
                <option key={f.id} value={`custom:${f.id}`}>{f.label} (custom)</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">3. Visualization</label>
            <select className="input" value={chartType} onChange={(e) => setChartType(e.target.value as ChartType)} disabled={!groupBy}>
              {CHART_TYPES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="label">4. Filters</label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-2">
            <input type="date" className="input" value={filters.dateFrom ?? ''} onChange={(e) => setFilter('dateFrom', e.target.value)} title="Date from" />
            <input type="date" className="input" value={filters.dateTo ?? ''} onChange={(e) => setFilter('dateTo', e.target.value)} title="Date to" />
            {reportType === 'leads' && (
              <select className="input" value={filters.priority ?? ''} onChange={(e) => setFilter('priority', e.target.value)}>
                <option value="">Any priority</option>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            )}
            {(reportType === 'leads' || reportType === 'deals') && (
              <select className="input" value={filters.industryId ?? ''} onChange={(e) => setFilter('industryId', e.target.value)}>
                <option value="">Any industry</option>
                {(industriesData?.industries ?? []).map((i) => (
                  <option key={i.id} value={i.id}>{i.name}</option>
                ))}
              </select>
            )}
            <select className="input" value={filters.assignedTo ?? ''} onChange={(e) => setFilter('assignedTo', e.target.value)}>
              <option value="">Anyone</option>
              {(rosterData?.members ?? []).map((m) => (
                <option key={m.id} value={m.id}>{m.nickname || m.email}</option>
              ))}
            </select>
          </div>
        </div>

        <label className="flex items-center gap-2.5 text-sm text-base-200">
          <input
            type="checkbox"
            checked={visibleToAll}
            onChange={(e) => setVisibleToAll(e.target.checked)}
            className="h-4 w-4 rounded border-base-600 bg-base-800 text-accent-500 focus:ring-accent-500"
          />
          Visible to all team members (read-only)
        </label>

        <div className="flex flex-wrap justify-end gap-3 border-t border-base-700/60 pt-4">
          <button className="btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn-primary" disabled={!name.trim() || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            {saveMutation.isPending ? 'Saving…' : 'Save Report'}
          </button>
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-base-300">Preview</h3>
        {runMutation.isPending ? (
          <div className="card p-12 text-center text-sm text-base-400">Loading preview…</div>
        ) : runResult ? (
          <ReportViewer
            rows={runResult.rows}
            grouped={runResult.grouped}
            reportType={reportType}
            chartType={chartType}
            displayCurrency={runResult.displayCurrency}
            reportName={name || 'report-preview'}
          />
        ) : null}
      </div>
    </div>
  )
}
