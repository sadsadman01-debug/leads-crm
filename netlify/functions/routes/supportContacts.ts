import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import { requireSuperAdmin } from '../lib/permissions.js'
import type { AuthedUser } from '../lib/auth.js'

const MAX_PREVIEW_LENGTH = 500
const COLUMNS = 'id, organization_id, profile_id, message_preview, created_at, source'

// Unauthenticated endpoint throttle — at most this many pre-auth log rows
// from the same IP within the window. The actual mailto: link still opens
// client-side regardless; this only limits how much gets logged.
const PRE_AUTH_RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000
const PRE_AUTH_RATE_LIMIT_MAX = 5

function clampPreview(value: unknown): string | null {
  return typeof value === 'string' ? value.trim().slice(0, MAX_PREVIEW_LENGTH) || null : null
}

function getClientIp(event: HandlerEvent): string | null {
  const forwarded = event.headers['x-forwarded-for'] || event.headers['X-Forwarded-For']
  if (forwarded) return forwarded.split(',')[0].trim()
  return event.headers['x-nf-client-connection-ip'] || event.headers['client-ip'] || null
}

/** Logs a Help-widget "Send Email" click — organization/profile are derived
 * from the caller's own session, never trusted from the request body. Any
 * authenticated Admin/User (or Super Admin, harmlessly) can log their own
 * click; only the Super Admin can ever read this table back (see RLS). */
export async function createSupportContact(event: HandlerEvent, user: AuthedUser) {
  const body = JSON.parse(event.body || '{}')
  const messagePreview = clampPreview(body.message_preview)

  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('support_contacts').insert({
    organization_id: user.organization_id,
    profile_id: user.id,
    message_preview: messagePreview,
    source: 'in_app',
  })
  if (error) throw new HttpError(500, error.message)

  return json(201, { success: true })
}

/** Public — reachable from Login/Request Access/Forgot Password before any
 * session exists. No org/profile identity to attach, so both are null; a
 * lightweight per-IP throttle keeps this from being spammed since it's
 * unauthenticated. Always returns success even when throttled — the widget's
 * mailto: link opens client-side regardless of whether this log write lands. */
export async function createPublicSupportContact(event: HandlerEvent) {
  const body = JSON.parse(event.body || '{}')
  const messagePreview = clampPreview(body.message_preview)
  const ip = getClientIp(event)
  const supabase = getSupabaseAdmin()

  if (ip) {
    const since = new Date(Date.now() - PRE_AUTH_RATE_LIMIT_WINDOW_MS).toISOString()
    const { count } = await supabase
      .from('support_contacts')
      .select('id', { count: 'exact', head: true })
      .eq('source', 'pre_auth')
      .eq('request_ip', ip)
      .gte('created_at', since)
    if ((count ?? 0) >= PRE_AUTH_RATE_LIMIT_MAX) {
      return json(200, { success: true })
    }
  }

  const { error } = await supabase.from('support_contacts').insert({
    organization_id: null,
    profile_id: null,
    message_preview: messagePreview,
    source: 'pre_auth',
    request_ip: ip,
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
