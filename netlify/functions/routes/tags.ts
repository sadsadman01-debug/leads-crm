import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'

export async function listTags() {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('tags').select('id, name').order('name', { ascending: true })
  if (error) throw new HttpError(500, error.message)
  return json(200, { tags: data ?? [] })
}
