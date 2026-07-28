import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import { requireSuperAdmin } from '../lib/permissions.js'
import type { AuthedUser } from '../lib/auth.js'

const MAX_PREVIEW_LENGTH = 500
const COLUMNS = 'id, organization_id, profile_id, channel, message_preview, created_at'

/** Logs a Help-widget click — organization/profile are derived from the
 * caller's own session, never trusted from the request body. Any
 * authenticated Admin/User (or Super Admin, harmlessly) can log their own
 * click; only the Super Admin can ever read this table back (see RLS). */
export async function createSupportContact(event: HandlerEvent, user: AuthedUser) {
  const body = JSON.parse(event.body || '{}')
  const channel = body.channel
  if (channel !== 'whatsapp' && channel !== 'email') {
    throw new HttpError(400, "channel must be 'whatsapp' or 'email'")
  }

  const messagePreview =
    typeof body.message_preview === 'string' ? body.message_preview.trim().slice(0, MAX_PREVIEW_LENGTH) || null : null

  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('support_contacts').insert({
    organization_id: user.organization_id,
    profile_id: user.id,
    channel,
    message_preview: messagePreview,
  })
  if (error) throw new HttpError(500, error.message)

  return json(201, { success: true })
}

/** Super Admin only — a simple chronological log, not a paginated/filterable
 * inbox, since this is "at a glance" visibility per the spec, not a ticketing UI. */
export async function listSupportContacts(user: AuthedUser) {
  requireSuperAdmin(user)
  const supabase = getSupabaseAdmin()

  const { data, error } = await supabase.from('support_contacts').select(COLUMNS).order('created_at', { ascending: false }).limit(500)
  if (error) throw new HttpError(500, error.message)
  const rows = data ?? []

  const orgIds = [...new Set(rows.map((r) => r.organization_id).filter(Boolean))] as string[]
  const profileIds = [...new Set(rows.map((r) => r.profile_id).filter(Boolean))] as string[]

  const [{ data: orgs }, { data: profiles }] = await Promise.all([
    orgIds.length > 0
      ? supabase.from('organizations').select('id, name').in('id', orgIds)
      : Promise.resolve({ data: [] as any[] }),
    profileIds.length > 0
      ? supabase.from('profiles').select('id, nickname, email').in('id', profileIds)
      : Promise.resolve({ data: [] as any[] }),
  ])

  const orgNameById = new Map((orgs ?? []).map((o: any) => [o.id, o.name]))
  const profileById = new Map((profiles ?? []).map((p: any) => [p.id, p]))

  return json(200, {
    contacts: rows.map((r) => ({
      ...r,
      organization_name: r.organization_id ? orgNameById.get(r.organization_id) ?? null : null,
      requester_nickname: r.profile_id ? profileById.get(r.profile_id)?.nickname ?? null : null,
      requester_email: r.profile_id ? profileById.get(r.profile_id)?.email ?? null : null,
    })),
  })
}
