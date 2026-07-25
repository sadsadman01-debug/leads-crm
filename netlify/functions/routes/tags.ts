import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import { resolveOrganizationId, scopeToOrg } from '../lib/permissions.js'
import type { AuthedUser } from '../lib/auth.js'

export async function listTags(event: HandlerEvent, user: AuthedUser) {
  const supabase = getSupabaseAdmin()
  const orgId = resolveOrganizationId(user, event)
  let query = supabase.from('tags').select('id, name')
  query = scopeToOrg(query as any, orgId) as any
  const { data, error } = await query.order('name', { ascending: true })
  if (error) throw new HttpError(500, error.message)
  return json(200, { tags: data ?? [] })
}
