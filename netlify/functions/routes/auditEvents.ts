import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import { insertAuditLog, logAuditEvent, getClientIp, type AuditEventType } from '../lib/auditLog.js'
import type { AuthedUser } from '../lib/auth.js'

const AUTH_EVENT_TYPES = new Set<AuditEventType>(['login_success', 'login_failure'])
const SECURITY_EVENT_TYPES = new Set<AuditEventType>(['logout', 'mfa_enabled', 'mfa_disabled', 'password_changed'])

/** POST /auth-events — public, unauthenticated. Reached from the Login page
 * immediately after `supabase.auth.signInWithPassword()` resolves, whether it
 * succeeded or failed — a failed attempt has no session, so this can't be an
 * authenticated endpoint. Best-effort lookup by email to snapshot the actor's
 * identity/role/org at the time; a non-matching email just logs with a null actor. */
export async function logAuthEvent(event: HandlerEvent) {
  const body = JSON.parse(event.body || '{}')
  const eventType = body.event_type
  const email = (body.email ?? '').trim()
  if (!AUTH_EVENT_TYPES.has(eventType)) throw new HttpError(400, 'Invalid event_type')

  let actorProfileId: string | null = null
  let actorRole: string | null = null
  let organizationId: string | null = null

  if (email) {
    const supabase = getSupabaseAdmin()
    const { data: target } = await supabase
      .from('profiles')
      .select('id, role, organization_id')
      .ilike('email', email)
      .maybeSingle()
    if (target) {
      actorProfileId = target.id
      actorRole = target.role
      organizationId = target.organization_id
    }
  }

  await insertAuditLog({
    eventType,
    actorProfileId,
    actorRole,
    organizationId,
    metadata: { email: email || null },
    ipAddress: getClientIp(event),
  })

  return json(200, { success: true })
}

/** POST /security-events — authenticated. Covers events that happen entirely
 * client-side via the Supabase Auth SDK (logout, MFA enroll/unenroll) and
 * never otherwise touch this backend — the frontend calls this right after
 * the SDK call itself succeeds. */
export async function logSecurityEvent(event: HandlerEvent, user: AuthedUser) {
  const body = JSON.parse(event.body || '{}')
  const eventType = body.event_type
  if (!SECURITY_EVENT_TYPES.has(eventType)) throw new HttpError(400, 'Invalid event_type')

  await logAuditEvent(eventType, user, event)
  return json(200, { success: true })
}
