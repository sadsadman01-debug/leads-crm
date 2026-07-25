import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Copy, Check, FileText } from 'lucide-react'
import { templatesApi } from '@/lib/api'
import type { Lead } from '@/types/lead'

function fillPlaceholders(text: string, lead: Lead): string {
  const values: Record<string, string> = {
    company_name: lead.company_name,
    address: lead.address ?? '',
    phone: lead.phone ?? '',
    email: lead.email ?? '',
    website: lead.website ?? '',
    lead_source: lead.lead_source,
    priority: lead.priority,
  }
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => values[key] ?? match)
}

export function TemplateUsePanel({ lead }: { lead: Lead }) {
  const { data } = useQuery({ queryKey: ['templates'], queryFn: templatesApi.list })
  const templates = data?.templates ?? []
  const [selectedId, setSelectedId] = useState('')
  const [copied, setCopied] = useState(false)

  const selected = templates.find((t) => t.id === selectedId)

  const filled = useMemo(() => {
    if (!selected) return null
    return { subject: fillPlaceholders(selected.subject, lead), body: fillPlaceholders(selected.body, lead) }
  }, [selected, lead])

  async function handleCopy() {
    if (!filled) return
    const text = filled.subject ? `Subject: ${filled.subject}\n\n${filled.body}` : filled.body
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (templates.length === 0) return null

  return (
    <div className="card p-6">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-base-300">Outreach Template</h2>
      <p className="mb-3 text-xs text-base-400">Fill a saved template with this lead's info, then copy it.</p>

      <select className="input mb-3" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
        <option value="">Choose a template…</option>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>

      {filled && (
        <div className="space-y-2">
          {filled.subject && (
            <div className="rounded-lg border border-base-700/60 bg-base-850 px-3 py-2">
              <p className="text-xs uppercase tracking-wide text-base-500">Subject</p>
              <p className="text-sm text-base-200">{filled.subject}</p>
            </div>
          )}
          <div className="rounded-lg border border-base-700/60 bg-base-850 px-3 py-2">
            <p className="mb-1 text-xs uppercase tracking-wide text-base-500">Body</p>
            <p className="whitespace-pre-wrap text-sm text-base-200">{filled.body}</p>
          </div>
          <button className="btn-secondary w-full" onClick={handleCopy}>
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? 'Copied' : 'Copy to Clipboard'}
          </button>
        </div>
      )}

      {!filled && (
        <div className="flex items-center gap-2 text-xs text-base-500">
          <FileText size={14} />
          Manage templates in Settings.
        </div>
      )}
    </div>
  )
}
