import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import { requireSuperAdmin } from '../lib/permissions.js'
import type { AuthedUser } from '../lib/auth.js'

const MAX_MESSAGE_LENGTH = 500
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const COLUMNS = 'id, organization_id, profile_id, contact_email, message_preview, created_at, source'

// Unauthenticated endpoint throttle — at most this many pre-auth submissions
// from the same IP within the window, since it's reachable with no session.
const PRE_AUTH_RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000
const PRE_AUTH_RATE_LIMIT_MAX = 5

function parseSubmission(event: HandlerEvent): { email: string; message: string } {
  const body = JSON.parse(event.body || '{}')
  const email = String(body.email ?? '').trim()
  const message = String(body.message ?? '').trim().slice(0, MAX_MESSAGE_LENGTH)

  if (!email || !EMAIL_RE.test(email)) throw new HttpError(400, 'Enter a valid email address')
  if (!message) throw new HttpError(400, 'Describe what you need help with')

  return { email, message }
}

function getClientIp(event: HandlerEvent): string | null {
  const forwarded = event.headers['x-forwarded-for'] || event.headers['X-Forwarded-For']
  if (forwarded) return forwarded.split(',')[0].trim()
  return event.headers['x-nf-client-connection-ip'] || event.headers['client-ip'] || null
}

/** Submits the Help widget's in-app form — organization/profile are derived
 * from the caller's own session, never trusted from the request body. Any
 * authenticated Admin/User (or Super Admin, harmlessly) can submit their own;
 * only the Super Admin can ever read this table back (see RLS). */
export async function createSupportContact(event: HandlerEvent, user: AuthedUser) {
  const { email, message } = parseSubmission(event)

  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('support_contacts').insert({
    organization_id: user.organization_id,
    profile_id: user.id,
    contact_email: email,
    message_preview: message,
    source: 'in_app',
  })
  if (error) throw new HttpError(500, error.message)

  return json(201, { success: true })
}

/** Public — reachable from Login/Request Access/Forgot Password before any
 * session exists. No org/profile identity to attach, so both are null; a
 * lightweight per-IP throttle keeps this from being spammed since it's
 * unauthenticated. */
export async function createPublicSupportContact(event: HandlerEvent) {
  const { email, message } = parseSubmission(event)
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
      throw new HttpError(429, 'Too many requests — please try again later.')
    }
  }

  const { error } = await supabase.from('support_contacts').insert({
    organization_id: null,
    profile_id: null,
    contact_email: email,
    message_preview: message,
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

/** Super Admin only — permanently clears the entire log. This is purely a
 * visibility log (not a ticketing system), so there's nothing else that
 * references these rows and nothing to cascade. */
export async function deleteAllSupportContacts(user: AuthedUser) {
  requireSuperAdmin(user)
  const supabase = getSupabaseAdmin()

  // Supabase requires a filter on delete; this matches every row since id is
  // always a valid uuid.
  const { error } = await supabase.from('support_contacts').delete().not('id', 'is', null)
  if (error) throw new HttpError(500, error.message)

  return json(200, { success: true })
}
