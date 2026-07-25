import { getSupabaseAdmin } from './supabaseAdmin.js'
import { HttpError } from './http.js'

/** Resolves tag names to ids within a given organization scope, creating any that don't exist yet. */
export async function ensureTagIds(
  tagNames: string[],
  organizationId: string | null
): Promise<Array<{ id: string; name: string }>> {
  const supabase = getSupabaseAdmin()
  const cleanNames = [...new Set(tagNames.map((t) => t.trim()).filter(Boolean))]
  if (cleanNames.length === 0) return []

  let existQuery = supabase.from('tags').select('id, name').in('name', cleanNames)
  existQuery = organizationId === null ? existQuery.is('organization_id', null) : existQuery.eq('organization_id', organizationId)
  const { data: existing, error: existErr } = await existQuery
  if (existErr) throw new HttpError(500, existErr.message)

  const existingNames = new Set((existing ?? []).map((t) => t.name))
  const toCreate = cleanNames.filter((n) => !existingNames.has(n))

  let created: Array<{ id: string; name: string }> = []
  if (toCreate.length > 0) {
    const { data: createdRows, error: createErr } = await supabase
      .from('tags')
      .insert(toCreate.map((name) => ({ name, organization_id: organizationId })))
      .select('id, name')
    if (createErr) throw new HttpError(500, createErr.message)
    created = createdRows ?? []
  }

  return [...(existing ?? []), ...created]
}
