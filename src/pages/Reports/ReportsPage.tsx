import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, BarChart3, Trash2, Pencil, Globe, ArrowLeft } from 'lucide-react'
import { reportsApi } from '@/lib/api'
import { useAuth, isAdminOrAbove, hasPermission } from '@/contexts/AuthContext'
import { Badge } from '@/components/ui/Badge'
import { ReportBuilder } from '@/components/reports/ReportBuilder'
import { ReportViewer } from '@/components/reports/ReportViewer'
import { ForecastTab } from '@/components/reports/ForecastTab'
import { TrendsTab } from '@/components/reports/TrendsTab'
import { STARTER_TEMPLATES, REPORT_TYPES, type SavedReport, type StarterTemplate } from '@/types/report'

type Tab = 'reports' | 'forecast' | 'trends'

export function ReportsPage() {
  const { profile } = useAuth()
  const isAdmin = isAdminOrAbove(profile?.role)
  const canBuildReports = isAdmin || hasPermission(profile, 'canAccessReportBuilder')
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('reports')
  const [mode, setMode] = useState<'list' | 'builder' | 'view'>('list')
  const [editing, setEditing] = useState<SavedReport | StarterTemplate | null>(null)
  const [viewing, setViewing] = useState<SavedReport | null>(null)

  const { data, isLoading } = useQuery({ queryKey: ['saved-reports'], queryFn: reportsApi.list })
  const reports = data?.reports ?? []

  const runViewMutation = useMutation({
    mutationFn: (report: SavedReport) =>
      reportsApi.run({ report_type: report.report_type, group_by: report.group_by, filters: report.filters }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => reportsApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['saved-reports'] }),
  })

  function openReport(report: SavedReport) {
    setViewing(report)
    setMode('view')
    runViewMutation.mutate(report)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-base-100">Reports</h1>
          <p className="mt-1 text-sm text-base-400">Custom reports, sales forecast, and trend analysis</p>
        </div>
        {tab === 'reports' && mode === 'list' && canBuildReports && (
          <button
            className="btn-primary"
            onClick={() => {
              setEditing(null)
              setMode('builder')
            }}
          >
            <Plus size={16} />
            New Report
          </button>
        )}
        {mode !== 'list' && (
          <button className="btn-secondary" onClick={() => setMode('list')}>
            <ArrowLeft size={16} />
            Back to Reports
          </button>
        )}
      </div>

      {mode === 'list' && (
        <div className="flex gap-1 rounded-lg bg-base-850 p-1 w-fit">
          {(['reports', 'forecast', 'trends'] as Tab[]).map((t) => (
            <button
              key={t}
              className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                tab === t ? 'bg-accent-500 text-white' : 'text-base-300 hover:text-base-100'
              }`}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {mode === 'builder' && (
        <ReportBuilder
          initial={editing}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['saved-reports'] })
            setMode('list')
          }}
          onCancel={() => setMode('list')}
        />
      )}

      {mode === 'view' && viewing && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-base-100">{viewing.name}</h2>
          {runViewMutation.isPending ? (
            <div className="card p-12 text-center text-sm text-base-400">Loading…</div>
          ) : runViewMutation.data ? (
            <ReportViewer
              rows={runViewMutation.data.rows}
              grouped={Boolean(viewing.group_by)}
              reportType={viewing.report_type}
              chartType={viewing.chart_type}
              displayCurrency={runViewMutation.data.displayCurrency}
              reportName={viewing.name}
            />
          ) : null}
        </div>
      )}

      {mode === 'list' && tab === 'reports' && (
        <div className="space-y-6">
          {canBuildReports && (
            <div>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-base-300">Starter Templates</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {STARTER_TEMPLATES.map((t) => (
                  <button
                    key={t.name}
                    className="card p-4 text-left transition-colors hover:bg-base-850"
                    onClick={() => {
                      setEditing(t)
                      setMode('builder')
                    }}
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <BarChart3 size={15} className="text-accent-400" />
                      <span className="font-medium text-base-100">{t.name}</span>
                    </div>
                    <p className="text-xs text-base-400">{t.description}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-base-300">My Reports</h2>
            {isLoading ? (
              <p className="text-sm text-base-400">Loading reports…</p>
            ) : reports.length === 0 ? (
              <div className="card flex flex-col items-center gap-3 p-12 text-center">
                <BarChart3 size={28} className="text-base-500" />
                <p className="text-base-300">No saved reports yet.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {reports.map((r) => (
                  <div
                    key={r.id}
                    className="card flex cursor-pointer items-center gap-3 p-4 transition-colors hover:bg-base-850"
                    onClick={() => openReport(r)}
                  >
                    <BarChart3 size={16} className="shrink-0 text-accent-400" />
                    <span className="flex-1 truncate font-medium text-base-100">{r.name}</span>
                    <Badge tone="neutral">{REPORT_TYPES.find((t) => t.value === r.report_type)?.label}</Badge>
                    {r.visible_to_all && (
                      <span title="Visible to all team members">
                        <Globe size={14} className="text-base-400" />
                      </span>
                    )}
                    {(isAdmin || (canBuildReports && r.created_by === profile?.id)) && (
                      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="btn-ghost px-2 text-accent-400"
                          onClick={() => {
                            setEditing(r)
                            setMode('builder')
                          }}
                        >
                          <Pencil size={15} />
                        </button>
                        <button className="btn-ghost px-2 hover:text-danger" onClick={() => deleteMutation.mutate(r.id)}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {mode === 'list' && tab === 'forecast' && <ForecastTab />}
      {mode === 'list' && tab === 'trends' && <TrendsTab />}
    </div>
  )
}
