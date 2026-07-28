import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Download, DatabaseBackup, Loader2 } from 'lucide-react'
import { dataExportApi, leadsApi, dealsApi, teamApi } from '@/lib/api'

export function DataExportSettings() {
  const queryClient = useQueryClient()
  const [exporting, setExporting] = useState(false)
  const [justExported, setJustExported] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: counts } = useQuery({
    queryKey: ['export-counts'],
    queryFn: async () => {
      const [leads, deals, team] = await Promise.all([
        leadsApi.list({ page: 1, pageSize: 1 }),
        dealsApi.list({ page: 1, pageSize: 1 }),
        teamApi.list(),
      ])
      return { leads: leads.total, deals: deals.total, team: team.members.length }
    },
  })

  const { data: logData } = useQuery({ queryKey: ['export-log'], queryFn: dataExportApi.listLog })
  const entries = logData?.entries ?? []

  async function handleExport() {
    setError(null)
    setExporting(true)
    try {
      await dataExportApi.downloadFull()
      setJustExported(true)
      queryClient.invalidateQueries({ queryKey: ['export-log'] })
      setTimeout(() => setJustExported(false), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="card p-6">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-base-300">
        <DatabaseBackup size={15} className="text-base-400" />
        Data Export
      </h2>
      <p className="mb-4 text-xs text-base-400">
        Download a full backup of your organization's data — Leads, Deals, activity timeline, templates, pipeline
        configuration, team members, and saved reports — as a ZIP file, directly to your device.
      </p>

      {counts && (
        <p className="mb-4 text-sm text-base-300">
          {counts.leads} lead{counts.leads === 1 ? '' : 's'}, {counts.deals} deal{counts.deals === 1 ? '' : 's'},{' '}
          {counts.team} team member{counts.team === 1 ? '' : 's'}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={exporting} onClick={handleExport}>
          {exporting ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Generating…
            </>
          ) : (
            <>
              <Download size={16} />
              Export All Data
            </>
          )}
        </button>
        {justExported && (
          <span className="flex items-center gap-1 text-sm text-success">
            <CheckCircle2 size={16} />
            Export downloaded successfully
          </span>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      {entries.length > 0 && (
        <div className="mt-5 border-t border-base-700/60 pt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-base-500">Recent Exports</p>
          <ul className="space-y-1.5">
            {entries.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 text-sm text-base-300">
                <span>{e.triggered_by_name || 'Unknown'}</span>
                <span className="text-xs text-base-500">{new Date(e.created_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
