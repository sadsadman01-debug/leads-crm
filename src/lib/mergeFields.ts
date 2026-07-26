import type { Lead } from '@/types/lead'

export interface MergeContext {
  industryName?: string
  assignedToName?: string
  customFieldDefs?: Array<{ id: string; label: string }>
}

export interface MergeFieldOption {
  tag: string
  label: string
}

/** The fixed set of standard merge fields, in the order shown in "Insert Placeholder" menus. */
export const STANDARD_MERGE_FIELDS: MergeFieldOption[] = [
  { tag: 'company_name', label: 'Company Name' },
  { tag: 'contact_name', label: 'Contact Person Name' },
  { tag: 'website', label: 'Website' },
  { tag: 'address', label: 'Address' },
  { tag: 'phone', label: 'Phone' },
  { tag: 'email', label: 'Email' },
  { tag: 'industry', label: 'Industry' },
  { tag: 'lead_source', label: 'Lead Source' },
  { tag: 'assigned_to', label: 'Assigned To' },
]

const FRIENDLY_LABELS: Record<string, string> = Object.fromEntries(
  STANDARD_MERGE_FIELDS.map((f) => [f.tag, f.label])
)

function formatValue(raw: any): string {
  if (raw === null || raw === undefined || raw === '') return ''
  if (Array.isArray(raw)) return raw.join(', ')
  if (typeof raw === 'boolean') return raw ? 'Yes' : 'No'
  return String(raw)
}

function resolveStandardField(key: string, lead: Lead, context: MergeContext): string | undefined {
  switch (key) {
    case 'company_name':
      return lead.company_name ?? ''
    case 'contact_name':
      return lead.contact_name ?? ''
    case 'website':
      return lead.website ?? ''
    case 'address':
      return lead.address ?? ''
    case 'phone':
      return lead.phone ?? ''
    case 'email':
      return lead.email ?? ''
    case 'industry':
      return context.industryName ?? ''
    case 'lead_source':
      return lead.lead_source ?? ''
    case 'assigned_to':
      return context.assignedToName ?? ''
    default:
      return undefined
  }
}

/**
 * Single shared substitution function used everywhere a template is previewed
 * (Lead Detail's Template Preview panel today; anywhere else in the future).
 * Unrecognized placeholders are left untouched rather than blanked, so a typo
 * doesn't silently disappear. Empty-but-recognized fields substitute to ''
 * and are reported back via `emptyFields` for a non-blocking warning in the UI.
 */
export function fillTemplate(text: string, lead: Lead, context: MergeContext = {}): { text: string; emptyFields: string[] } {
  const emptyFields = new Set<string>()

  const filled = text.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (match, rawKey: string) => {
    const key = rawKey.trim()

    if (key.startsWith('custom.')) {
      const label = key.slice('custom.'.length).trim()
      const def = (context.customFieldDefs ?? []).find((d) => d.label.toLowerCase() === label.toLowerCase())
      if (!def) return match
      const value = formatValue(lead.custom_fields?.[def.id])
      if (!value) emptyFields.add(label)
      return value
    }

    const value = resolveStandardField(key, lead, context)
    if (value === undefined) return match
    if (!value) emptyFields.add(FRIENDLY_LABELS[key] ?? key)
    return value
  })

  return { text: filled, emptyFields: [...emptyFields] }
}
