import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import { isAdminOrAbove, isSuperAdmin, requireSuperAdmin } from '../lib/permissions.js'
import { generateTempPassword } from '../lib/passwordGen.js'
import { notifySuperAdmins, notifyOrgAdmins } from '../lib/notifications.js'
import type { AuthedUser } from '../lib/auth.js'

const COLUMNS =
  'id, target_profile_id, target_email, target_role, organization_id, status, requested_at, resolved_at, resolved_by'

/** POST /password-reset-requests — public, unauthenticated. Always returns the
 * same generic response, whether or not a matching account exists, so this can
 * never be used to probe which emails are registered. A Super Admin target (or
 * an inactive account) never gets a row — there's no one to route it to. */
export async function createPasswordResetRequest(event: HandlerEvent) {
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
        .from('password_reset_requests')
        .insert({
          target_profile_id: target.id,
          target_email: target.email,
          target_role: target.role,
          organization_id: target.organization_id,
        })
        .select('id')
        .single()

      // Per the routing rules: an Admin target only the Super Admin can act on
      // (only Super Admin manages Admin accounts); a User target goes to
      // their own org's Admin(s).
      const notifyFields = {
        type: 'password_reset_request' as const,
        title: 'Password reset requested',
        message: `${target.email} requested a password reset.`,
        link_route: target.role === 'admin' ? '/password-reset-requests' : '/team',
        related_entity_id: created?.id ?? null,
        related_entity_type: 'password_reset_request',
      }
      if (target.role === 'admin') {
        await notifySuperAdmins(notifyFields)
      } else if (target.organization_id) {
        await notifyOrgAdmins(target.organization_id, notifyFields)
      }
    }
  }

  return json(200, {
    message: "If an account exists with this email, a request has been sent to your admin. They'll provide you a new password soon.",
  })
}

/** Admin sees only pending/resolved requests targeting Users in their own
 * organization; Super Admin sees every request platform-wide, including
 * every Admin-role request (grouped by organization for User-role ones). */
export async function listPasswordResetRequests(event: HandlerEvent, user: AuthedUser) {
  if (!isAdminOrAbove(user)) throw new HttpError(403, 'Admin access required')
  const supabase = getSupabaseAdmin()

  let query = supabase.from('password_reset_requests').select(COLUMNS).order('requested_at', { ascending: false })
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

/** The single source of truth for actually resetting a password — used by both
 * the request-resolve flow below and the direct "Reset Password" button on a
 * Team Management row (netlify/functions/routes/team.ts). Independently
 * re-verifies the caller is permitted against the target's live role/org on
 * every call, regardless of what the caller already checked. */
export async function performPasswordReset(targetProfileId: string, resolver: AuthedUser) {
  const supabase = getSupabaseAdmin()
  const { data: target, error } = await supabase
    .from('profiles')
    .select('id, email, nickname, role, organization_id, is_active')
    .eq('id', targetProfileId)
    .maybeSingle()
  if (error) throw new HttpError(500, error.message)
  if (!target) throw new HttpError(404, 'Account not found')

  if (target.role === 'super_admin') {
    throw new HttpError(403, 'A Super Admin password cannot be reset through this flow')
  }
  if (target.role === 'admin') {
    requireSuperAdmin(resolver)
  } else {
    if (!isAdminOrAbove(resolver)) throw new HttpError(403, 'You do not have permission to reset this password')
    if (!isSuperAdmin(resolver) && target.organization_id !== resolver.organization_id) {
      throw new HttpError(404, 'Account not found')
    }
  }

  const temporary_password = generateTempPassword()

  const { error: pwErr } = await supabase.auth.admin.updateUserById(target.id, { password: temporary_password })
  if (pwErr) throw new HttpError(500, pwErr.message)

  const { error: flagErr } = await supabase.from('profiles').update({ force_password_change: true }).eq('id', target.id)
  if (flagErr) throw new HttpError(500, flagErr.message)

  // Superseded by this reset — clear out any other pending requests for the
  // same account so they don't linger as actionable after the fact.
  await supabase
    .from('password_reset_requests')
    .update({ status: 'resolved', resolved_at: new Date().toISOString(), resolved_by: resolver.id })
    .eq('target_profile_id', target.id)
    .eq('status', 'pending')

  return { email: target.email, nickname: target.nickname || target.email, temporary_password }
}

export async function resolvePasswordResetRequest(id: string, event: HandlerEvent, user: AuthedUser) {
  if (!isAdminOrAbove(user)) throw new HttpError(403, 'Admin access required')
  const supabase = getSupabaseAdmin()

  const { data: reqRow, error } = await supabase.from('password_reset_requests').select(COLUMNS).eq('id', id).maybeSingle()
  if (error) throw new HttpError(500, error.message)
  if (!reqRow) throw new HttpError(404, 'Request not found')
  if (reqRow.status !== 'pending') throw new HttpError(400, 'This request has already been resolved')

  if (!isSuperAdmin(user) && (reqRow.target_role !== 'user' || reqRow.organization_id !== user.organization_id)) {
    throw new HttpError(404, 'Request not found')
  }

  const result = await performPasswordReset(reqRow.target_profile_id, user)

  const { data: updated, error: reqErr } = await supabase.from('password_reset_requests').select(COLUMNS).eq('id', id).single()
  if (reqErr) throw new HttpError(500, reqErr.message)

  return json(200, { request: updated, admin: result })
}
