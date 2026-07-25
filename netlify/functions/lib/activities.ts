import { getSupabaseAdmin } from './supabaseAdmin.js'
import { HttpError } from './http.js'

/** Fire-and-forget style helper — call sites await it so a logging failure surfaces
 * as a 500 rather than silently dropping timeline entries, but it never blocks on
 * anything beyond a single insert. */
export async function logActivity(leadId: string, type: string, message: string, userId?: string) {
  const supabase = getSupabaseAdmin()
  const { error } = await supabase
    .from('lead_activities')
    .insert({ lead_id: leadId, type, message, created_by: userId ?? null })
  if (error) throw new HttpError(500, error.message)
}

export async function logActivities(rows: Array<{ leadId: string; type: string; message: string; userId?: string }>) {
  if (rows.length === 0) return
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('lead_activities').insert(
    rows.map((r) => ({ lead_id: r.leadId, type: r.type, message: r.message, created_by: r.userId ?? null }))
  )
  if (error) throw new HttpError(500, error.message)
}
