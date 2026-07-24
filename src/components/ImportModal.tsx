import { useRef, useState } from 'react'
import Papa from 'papaparse'
import { Upload, FileSpreadsheet, Link as LinkIcon, CheckCircle2, AlertCircle } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { importApi, type ImportResult } from '@/lib/api'

const BATCH_SIZE = 400

type Tab = 'csv' | 'sheet'

export function ImportModal({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: () => void }) {
  const [tab, setTab] = useState<Tab>('csv')
  const [file, setFile] = useState<File | null>(null)
  const [sheetUrl, setSheetUrl] = useState('')
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function reset() {
    setFile(null)
    setSheetUrl('')
    setProgress(null)
    setResult(null)
    setError(null)
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function handleCsvImport() {
    if (!file) return
    setBusy(true)
    setError(null)
    setResult(null)

    try {
      const rows = await new Promise<Record<string, string>[]>((resolve, reject) => {
        Papa.parse<Record<string, string>>(file, {
          header: true,
          skipEmptyLines: true,
          complete: (res) => resolve(res.data),
          error: reject,
        })
      })

      if (rows.length === 0) {
        setError('No rows found in that file.')
        setBusy(false)
        return
      }

      const batches: Record<string, string>[][] = []
      for (let i = 0; i < rows.length; i += BATCH_SIZE) batches.push(rows.slice(i, i + BATCH_SIZE))

      let imported = 0
      let skipped = 0
      setProgress({ done: 0, total: rows.length })

      for (const batch of batches) {
        const res = await importApi.rows(batch)
        imported += res.imported
        skipped += res.skipped
        setProgress((p) => ({ done: (p?.done ?? 0) + batch.length, total: rows.length }))
      }

      setResult({ imported, skipped, total: rows.length })
      onImported()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleSheetImport() {
    if (!sheetUrl.trim()) return
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const res = await importApi.googleSheet(sheetUrl.trim())
      setResult(res)
      onImported()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Import Leads">
      <div className="mb-4 flex gap-1 rounded-lg bg-base-850 p-1">
        <button
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            tab === 'csv' ? 'bg-accent-500 text-white' : 'text-base-300 hover:text-base-100'
          }`}
          onClick={() => setTab('csv')}
        >
          CSV File
        </button>
        <button
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            tab === 'sheet' ? 'bg-accent-500 text-white' : 'text-base-300 hover:text-base-100'
          }`}
          onClick={() => setTab('sheet')}
        >
          Google Sheet
        </button>
      </div>

      {tab === 'csv' ? (
        <div className="space-y-3">
          <p className="text-xs text-base-400">
            Expected columns: Company Name (required), Address, Phone, Email, Website, Lead Source, Priority,
            Tags (comma-separated), Notes.
          </p>
          <button
            className="btn-secondary w-full"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            <Upload size={16} />
            {file ? file.name : 'Choose CSV file'}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-base-400">
            The sheet must be shared as "Anyone with the link can view." First row is used as headers, same
            column names as CSV import.
          </p>
          <div className="relative">
            <FileSpreadsheet size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base-400" />
            <input
              className="input pl-9"
              placeholder="https://docs.google.com/spreadsheets/d/…"
              value={sheetUrl}
              onChange={(e) => setSheetUrl(e.target.value)}
            />
          </div>
        </div>
      )}

      {progress && !result && (
        <div className="mt-4">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-base-700">
            <div
              className="h-full rounded-full bg-accent-500 transition-all"
              style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-base-400">{progress.done} / {progress.total} rows sent…</p>
        </div>
      )}

      {result && (
        <div className="mt-4 flex items-start gap-2 rounded-lg bg-success-bg px-3 py-2.5 text-sm text-success">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          <p>
            Imported {result.imported} lead{result.imported === 1 ? '' : 's'}.
            {result.skipped > 0 && ` Skipped ${result.skipped} row${result.skipped === 1 ? '' : 's'} (missing company name).`}
          </p>
        </div>
      )}

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-lg bg-danger-bg px-3 py-2.5 text-sm text-danger">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      <div className="mt-5 flex justify-end gap-3">
        <button className="btn-secondary" onClick={handleClose}>
          {result ? 'Close' : 'Cancel'}
        </button>
        {!result && (
          <button
            className="btn-primary"
            disabled={busy || (tab === 'csv' ? !file : !sheetUrl.trim())}
            onClick={tab === 'csv' ? handleCsvImport : handleSheetImport}
          >
            {busy ? 'Importing…' : (
              <>
                <LinkIcon size={16} />
                Import
              </>
            )}
          </button>
        )}
      </div>
    </Modal>
  )
}
