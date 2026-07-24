import { getSupabaseAdmin } from './supabaseAdmin.js'
import { HttpError } from './http.js'

/** Resolves tag names to ids, creating any that don't exist yet. */
export async function ensureTagIds(tagNames: string[]): Promise<Array<{ id: string; name: string }>> {
  const supabase = getSupabaseAdmin()
  const cleanNames = [...new Set(tagNames.map((t) => t.trim()).filter(Boolean))]
  if (cleanNames.length === 0) return []

  const { data: existing, error: existErr } = await supabase.from('tags').select('id, name').in('name', cleanNames)
  if (existErr) throw new HttpError(500, existErr.message)

  const existingNames = new Set((existing ?? []).map((t) => t.name))
  const toCreate = cleanNames.filter((n) => !existingNames.has(n))

  let created: Array<{ id: string; name: string }> = []
  if (toCreate.length > 0) {
    const { data: createdRows, error: createErr } = await supabase
      .from('tags')
      .insert(toCreate.map((name) => ({ name })))
      .select('id, name')
    if (createErr) throw new HttpError(500, createErr.message)
    created = createdRows ?? []
  }

  return [...(existing ?? []), ...created]
}
