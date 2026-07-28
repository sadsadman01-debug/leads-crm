import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import { isAdminOrAbove, isSuperAdmin, requireSuperAdmin, requireAal2IfEnrolled } from '../lib/permissions.js'
import { notifySuperAdmins, notifyOrgAdmins } from '../lib/notifications.js'
import { insertAuditLog, getClientIp } from '../lib/auditLog.js'
import type { AuthedUser } from '../lib/auth.js'

const COLUMNS =
  'id, target_profile_id, target_email, target_role, organization_id, status, requested_at, resolved_at, resolved_by'

/** POST /mfa-reset-requests — public, unauthenticated, reached from the Login
 * page's MFA challenge screen. Same shape and same email-enumeration
 * protection as createPasswordResetRequest: always the same generic response. */
export async function createMfaResetRequest(event: HandlerEvent) {
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')
  const email = (body.email ?? '').trim()

  if (email) {
    const { data: target } = await supabase
      .from('profiles')
      .select('id, email, role, organization_id, is_active')
      .ilike('email', email)
      .maybeSingle()

    if (target && target.is_active && (target.role === 'admin' || target.role === 'user')) {
      const { data: created } = await supabase
        .from('mfa_reset_requests')
        .insert({
          target_profile_id: target.id,
          target_email: target.email,
          target_role: target.role,
          organization_id: target.organization_id,
        })
        .select('id')
        .single()

      // Same routing rule as password resets: an Admin target only the Super
      // Admin can act on; a User target goes to their own org's Admin(s).
      const notifyFields = {
        type: 'mfa_reset_request' as const,
        title: 'Two-factor authentication reset requested',
        message: `${target.email} is locked out of their authenticator app and requested a 2FA reset.`,
        link_route: target.role === 'admin' ? '/mfa-reset-requests' : '/team',
        related_entity_id: created?.id ?? null,
        related_entity_type: 'mfa_reset_request',
      }
      if (target.role === 'admin') {
        await notifySuperAdmins(notifyFields)
      } else if (target.organization_id) {
        await notifyOrgAdmins(target.organization_id, notifyFields)
      }

      await insertAuditLog({
        eventType: 'mfa_reset_request_submitted',
        targetProfileId: target.id,
        actorRole: target.role,
        organizationId: target.organization_id,
        metadata: { email: target.email },
        ipAddress: getClientIp(event),
      })
    }
  }

  return json(200, {
    message: "If an account exists with this email, a request has been sent to your admin. They'll help you regain access soon.",
  })
}

/** Admin sees only pending/resolved requests targeting Users in their own
 * organization; Super Admin sees every request platform-wide. */
export async function listMfaResetRequests(event: HandlerEvent, user: AuthedUser) {
  if (!isAdminOrAbove(user)) throw new HttpError(403, 'Admin access required')
  const supabase = getSupabaseAdmin()

  let query = supabase.from('mfa_reset_requests').select(COLUMNS).order('requested_at', { ascending: false })
  if (!isSuperAdmin(user)) {
    query = query.eq('target_role', 'user').eq('organization_id', user.organization_id)
  }

  const { data, error } = await query
  if (error) throw new HttpError(500, error.message)
  const rows = data ?? []

  const profileIds = [...new Set(rows.map((r) => r.target_profile_id))]
  const orgIds = [...new Set(rows.map((r) => r.organization_id).filter(Boolean))] as string[]

  const [{ data: profiles }, { data: orgs }] = await Promise.all([
    profileIds.length > 0
      ? supabase.from('profiles').select('id, nickname').in('id', profileIds)
      : Promise.resolve({ data: [] as any[] }),
    orgIds.length > 0
      ? supabase.from('organizations').select('id, name').in('id', orgIds)
      : Promise.resolve({ data: [] as any[] }),
  ])

  const nicknameById = new Map((profiles ?? []).map((p: any) => [p.id, p.nickname]))
  const orgNameById = new Map((orgs ?? []).map((o: any) => [o.id, o.name]))

  return json(200, {
    requests: rows.map((r) => ({
      ...r,
      target_nickname: nicknameById.get(r.target_profile_id) ?? null,
      organization_name: r.organization_id ? orgNameById.get(r.organization_id) ?? null : null,
    })),
  })
}

/** The single source of truth for actually clearing a locked-out account's
 * 2FA — removes every MFA factor on the target's Supabase Auth user via the
 * Service Role key, so they can log in with just email+password again and
 * re-enroll a new authenticator from Settings → Security afterward. */
export async function performMfaReset(targetProfileId: string, resolver: AuthedUser) {
  const supabase = getSupabaseAdmin()
  const { data: target, error } = await supabase
    .from('profiles')
    .select('id, email, nickname, role, organization_id, is_active')
    .eq('id', targetProfileId)
    .maybeSingle()
  if (error) throw new HttpError(500, error.message)
  if (!target) throw new HttpError(404, 'Account not found')

  if (target.role === 'super_admin') {
    throw new HttpError(403, "A Super Admin's two-factor authentication cannot be reset through this flow")
  }
  if (target.role === 'admin') {
    requireSuperAdmin(resolver)
  } else {
    if (!isAdminOrAbove(resolver)) throw new HttpError(403, 'You do not have permission to reset this account’s two-factor authentication')
    if (!isSuperAdmin(resolver) && target.organization_id !== resolver.organization_id) {
      throw new HttpError(404, 'Account not found')
    }
  }

  const { data: factorsData, error: factorsErr } = await supabase.auth.admin.mfa.listFactors({ userId: target.id })
  if (factorsErr) throw new HttpError(500, factorsErr.message)

  for (const factor of factorsData?.factors ?? []) {
    const { error: deleteErr } = await supabase.auth.admin.mfa.deleteFactor({ id: factor.id, userId: target.id })
    if (deleteErr) throw new HttpError(500, deleteErr.message)
  }

  // Superseded by this reset — clear out any other pending requests for the
  // same account so they don't linger as actionable after the fact.
  await supabase
    .from('mfa_reset_requests')
    .update({ status: 'resolved', resolved_at: new Date().toISOString(), resolved_by: resolver.id })
    .eq('target_profile_id', target.id)
    .eq('status', 'pending')

  await insertAuditLog({
    eventType: 'mfa_reset_request_resolved',
    actorProfileId: resolver.id,
    actorRole: resolver.role,
    organizationId: target.organization_id,
    targetProfileId: target.id,
    metadata: { email: target.email },
  })

  return { email: target.email, nickname: target.nickname || target.email }
}

export async function resolveMfaResetRequest(id: string, event: HandlerEvent, user: AuthedUser) {
  if (!isAdminOrAbove(user)) throw new HttpError(403, 'Admin access required')
  await requireAal2IfEnrolled(user)
  const supabase = getSupabaseAdmin()

  const { data: reqRow, error } = await supabase.from('mfa_reset_requests').select(COLUMNS).eq('id', id).maybeSingle()
  if (error) throw new HttpError(500, error.message)
  if (!reqRow) throw new HttpError(404, 'Request not found')
  if (reqRow.status !== 'pending') throw new HttpError(400, 'This request has already been resolved')

  if (!isSuperAdmin(user) && (reqRow.target_role !== 'user' || reqRow.organization_id !== user.organization_id)) {
    throw new HttpError(404, 'Request not found')
  }

  const result = await performMfaReset(reqRow.target_profile_id, user)

  const { data: updated, error: reqErr } = await supabase.from('mfa_reset_requests').select(COLUMNS).eq('id', id).single()
  if (reqErr) throw new HttpError(500, reqErr.message)

  return json(200, { request: updated, account: result })
}
