import { useMemo } from 'react'
import {
  BarChart, Bar, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { Download, FileText } from 'lucide-react'
import Papa from 'papaparse'
import { DonutChart } from '@/components/charts/DonutChart'
import { CATEGORICAL_PALETTE, CHART_TEXT_MUTED } from '@/lib/chartColors'
import { formatCurrency } from '@/lib/currency'
import type { ChartType, ReportType } from '@/types/report'

function pickPrimaryMetric(reportType: ReportType): { key: string; label: string; isCurrency: boolean } {
  if (reportType === 'deals') return { key: 'totalValue', label: 'Total Value', isCurrency: true }
  return { key: 'count', label: 'Count', isCurrency: false }
}

export function ReportViewer({
  rows,
  grouped,
  reportType,
  chartType,
  displayCurrency,
  reportName,
}: {
  rows: any[]
  grouped: boolean
  reportType: ReportType
  chartType: ChartType
  displayCurrency?: string
  reportName: string
}) {
  const metric = pickPrimaryMetric(reportType)
  const showChart = grouped && chartType !== 'table' && rows.length > 0
  const showTable = chartType === 'table' || chartType === 'table_and_chart' || !grouped

  const chartData = useMemo(() => rows.map((r, i) => ({ ...r, fill: CATEGORICAL_PALETTE[i % CATEGORICAL_PALETTE.length] })), [rows])

  const columns = useMemo(() => (rows.length > 0 ? Object.keys(rows[0]).filter((k) => k !== 'custom_fields') : []), [rows])

  function formatCell(value: any): string {
    if (value === null || value === undefined) return '—'
    if (typeof value === 'boolean') return value ? 'Yes' : 'No'
    if (typeof value === 'number') return metric.isCurrency && displayCurrency ? formatCurrency(value, displayCurrency) : String(value)
    return String(value)
  }

  function exportCsv() {
    const csv = Papa.unparse(rows.map(({ custom_fields, ...rest }) => rest))
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${reportName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  async function exportPdf() {
    const [{ default: jsPDF }, autoTableModule] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
    const autoTable = (autoTableModule as any).default ?? (autoTableModule as any)
    const doc = new jsPDF()
    doc.setFontSize(14)
    doc.text(reportName, 14, 16)
    autoTable(doc, {
      startY: 22,
      head: [columns],
      body: rows.map((r) => columns.map((c) => formatCell(r[c]))),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [91, 108, 240] },
    })
    doc.save(`${reportName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`)
  }

  if (rows.length === 0) {
    return <div className="card p-12 text-center text-sm text-base-400">No data matches this report's filters yet.</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <button className="btn-secondary" onClick={exportCsv}>
          <Download size={15} />
          CSV
        </button>
        <button className="btn-secondary" onClick={exportPdf}>
          <FileText size={15} />
          PDF
        </button>
      </div>

      {showChart && chartType === 'bar' && (
        <div className="card p-6">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2b36" />
              <XAxis dataKey="group" tick={{ fill: CHART_TEXT_MUTED, fontSize: 11 }} />
              <YAxis tick={{ fill: CHART_TEXT_MUTED, fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#1a1b23', border: '1px solid #3a3b46', borderRadius: 8 }} />
              <Bar dataKey={metric.key} radius={[4, 4, 0, 0]}>
                {chartData.map((d, i) => (
                  <Cell key={i} fill={d.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {showChart && chartType === 'line' && (
        <div className="card p-6">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2b36" />
              <XAxis dataKey="group" tick={{ fill: CHART_TEXT_MUTED, fontSize: 11 }} />
              <YAxis tick={{ fill: CHART_TEXT_MUTED, fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#1a1b23', border: '1px solid #3a3b46', borderRadius: 8 }} />
              <Line type="monotone" dataKey={metric.key} stroke={CATEGORICAL_PALETTE[0]} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {showChart && chartType === 'donut' && (
        <div className="card p-6">
          <DonutChart
            data={rows.map((r) => ({ label: r.group, count: r[metric.key] }))}
            colors={Object.fromEntries(rows.map((r, i) => [r.group, CATEGORICAL_PALETTE[i % CATEGORICAL_PALETTE.length]]))}
          />
        </div>
      )}

      {showTable && (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[500px] text-left text-sm">
            <thead>
              <tr className="border-b border-base-700/60 text-xs uppercase tracking-wide text-base-400">
                {columns.map((c) => (
                  <th key={c} className="px-5 py-3 font-medium">{c.replace(/_/g, ' ')}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id ?? r.group ?? i} className="border-b border-base-800">
                  {columns.map((c) => (
                    <td key={c} className="px-5 py-3 text-base-200">{formatCell(r[c])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
