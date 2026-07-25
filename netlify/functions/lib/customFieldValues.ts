import { getSupabaseAdmin } from './supabaseAdmin.js'
import { HttpError } from './http.js'

export interface CustomFieldDefRow {
  id: string
  label: string
  field_type: string
  applies_to: string
  required: boolean
}

export async function loadActiveDefinitions(
  organizationId: string | null,
  appliesTo: 'leads' | 'deals'
): Promise<CustomFieldDefRow[]> {
  const supabase = getSupabaseAdmin()
  let query = supabase
    .from('custom_field_definitions')
    .select('id, label, field_type, applies_to, required')
    .eq('is_active', true)
    .in('applies_to', [appliesTo, 'both'])
  query = organizationId === null ? query.is('organization_id', null) : query.eq('organization_id', organizationId)
  const { data, error } = await query
  if (error) throw new HttpError(500, error.message)
  return data ?? []
}

export function requireRequiredFieldsFilled(definitions: CustomFieldDefRow[], values: Record<string, any>) {
  for (const def of definitions) {
    if (!def.required) continue
    const value = values[def.id]
    const isEmpty = value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)
    if (isEmpty) throw new HttpError(400, `"${def.label}" is required`)
  }
}

function formatValueForMessage(value: any): string {
  if (Array.isArray(value)) return value.join(', ') || '(cleared)'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (value === null || value === undefined || value === '') return '(cleared)'
  return String(value)
}

/** Merges incoming custom field values into existing ones — only accepts keys
 * matching a known active definition id, silently ignoring anything else
 * rather than trusting arbitrary client-supplied keys. Returns the merged
 * object plus human-readable change messages for the activity timeline. */
export function mergeCustomFieldValues(
  existing: Record<string, any>,
  incoming: Record<string, any>,
  definitions: CustomFieldDefRow[]
): { merged: Record<string, any>; messages: string[] } {
  const byId = new Map(definitions.map((d) => [d.id, d]))
  const merged = { ...existing }
  const messages: string[] = []

  for (const [fieldId, value] of Object.entries(incoming)) {
    const def = byId.get(fieldId)
    if (!def) continue
    if (JSON.stringify(merged[fieldId] ?? null) === JSON.stringify(value ?? null)) continue
    merged[fieldId] = value
    messages.push(`Custom field '${def.label}' updated to '${formatValueForMessage(value)}'`)
  }

  return { merged, messages }
}
