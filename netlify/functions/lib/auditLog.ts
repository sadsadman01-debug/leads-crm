import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from './supabaseAdmin.js'
import type { AuthedUser } from './auth.js'

export type AuditEventType =
  | 'login_success'
  | 'login_failure'
  | 'logout'
  | 'signup_request_submitted'
  | 'signup_request_approved'
  | 'signup_request_rejected'
  | 'admin_account_created'
  | 'user_account_created'
  | 'team_member_deactivated'
  | 'team_member_reactivated'
  | 'team_member_deleted'
  | 'permissions_changed'
  | 'password_reset_request_submitted'
  | 'password_reset_request_resolved'
  | 'mfa_reset_request_submitted'
  | 'mfa_reset_request_resolved'
  | 'mfa_enabled'
  | 'mfa_disabled'
  | 'organization_created'
  | 'organization_suspended'
  | 'organization_reactivated'
  | 'organization_deleted'
  | 'organization_branding_changed'
  | 'platform_branding_changed'
  | 'data_export_triggered'
  | 'bulk_leads_deleted'

interface InsertAuditLogParams {
  eventType: AuditEventType
  actorProfileId?: string | null
  actorRole?: string | null
  organizationId?: string | null
  targetProfileId?: string | null
  metadata?: Record<string, unknown>
  ipAddress?: string | null
}

/** Best-effort — a logging failure must never break the action it's
 * recording, so errors are swallowed (and reported to the function log)
 * rather than thrown back into the caller's request. */
export async function insertAuditLog(params: InsertAuditLogParams): Promise<void> {
  try {
    const supabase = getSupabaseAdmin()
    const { error } = await supabase.from('audit_log').insert({
      event_type: params.eventType,
      actor_profile_id: params.actorProfileId ?? null,
      actor_role: params.actorRole ?? null,
      organization_id: params.organizationId ?? null,
      target_profile_id: params.targetProfileId ?? null,
      metadata: params.metadata ?? {},
      ip_address: params.ipAddress ?? null,
    })
    if (error) console.error('Failed to write audit log entry', error)
  } catch (err) {
    console.error('Failed to write audit log entry', err)
  }
}

/** Best-effort client IP extraction — Netlify and Vercel both set this header on every request. */
export function getClientIp(event: HandlerEvent): string | null {
  const header = event.headers['x-forwarded-for'] || event.headers['X-Forwarded-For']
  if (!header) return null
  return header.split(',')[0].trim() || null
}

/** Convenience wrapper for the common case: an authenticated user performing
 * an action, defaulting the organization scope to their own. */
export function logAuditEvent(
  eventType: AuditEventType,
  actor: AuthedUser,
  event: HandlerEvent,
  opts: { organizationId?: string | null; targetProfileId?: string | null; metadata?: Record<string, unknown> } = {}
): Promise<void> {
  return insertAuditLog({
    eventType,
    actorProfileId: actor.id,
    actorRole: actor.role,
    organizationId: opts.organizationId !== undefined ? opts.organizationId : actor.organization_id,
    targetProfileId: opts.targetProfileId ?? null,
    metadata: opts.metadata ?? {},
    ipAddress: getClientIp(event),
  })
}
