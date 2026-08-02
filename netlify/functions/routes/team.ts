import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import { requireAdminOrAbove, requireSuperAdmin, isSuperAdmin, resolveOrganizationId, scopeToOrg, requireAal2IfEnrolled } from '../lib/permissions.js'
import { DEFAULT_USER_PERMISSIONS, normalizePermissions } from '../lib/userPermissions.js'
import { performPasswordReset } from './passwordResetRequests.js'
import { logAuditEvent } from '../lib/auditLog.js'
import { getReviewStatus } from './productReviews.js'
import type { AuthedUser } from '../lib/auth.js'

const PROFILE_COLUMNS = 'id, email, nickname, role, is_active, created_at'
const PROFILE_COLUMNS_WITH_PERMISSIONS = `${PROFILE_COLUMNS}, permissions`

// Ban far enough in the future that a deactivated account's existing session
// (and any attempt to sign back in before its JWT expires) is rejected by
// Supabase Auth itself, not just by the app-level is_active check.
const BAN_DURATION = '876000h'

export async function getMyProfile(user: AuthedUser) {
  let organizationName: string | null = null
  if (user.organization_id) {
    const supabase = getSupabaseAdmin()
    const { data } = await supabase.from('organizations').select('name').eq('id', user.organization_id).maybeSingle()
    organizationName = data?.name ?? null
  }

  const reviewStatus = await getReviewStatus(user)

  return json(200, {
    id: user.id,
    email: user.email,
    nickname: user.nickname,
    role: user.role,
    is_active: user.is_active,
    organization_id: user.organization_id,
    organization_name: organizationName,
    permissions: user.permissions,
    force_password_change: user.force_password_change,
    review_due: reviewStatus.due,
    pending_review_number: reviewStatus.pendingReviewNumber,
  })
}

/** Self-service — the caller clears their own flag after successfully changing
 * their password via the Supabase Auth SDK client-side. No admin gate needed:
 * this only ever touches the caller's own row, and only ever sets it to false. */
export async function clearForcePasswordChange(user: AuthedUser) {
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('profiles').update({ force_password_change: false }).eq('id', user.id)
  if (error) throw new HttpError(500, error.message)
  return json(200, { success: true })
}

/** Lightweight roster for assignment dropdowns/filters — any authenticated
 * team member can see who exists in their own organization, without the
 * admin-only management fields. Never includes the Super Admin. */
export async function listRoster(event: HandlerEvent, user: AuthedUser) {
  const supabase = getSupabaseAdmin()
  const orgId = resolveOrganizationId(user, event)
  let query = supabase.from('profiles').select('id, nickname, email').eq('is_active', true).neq('role', 'super_admin')
  query = scopeToOrg(query as any, orgId) as any
  const { data, error } = await query.order('nickname', { ascending: true })
  if (error) throw new HttpError(500, error.message)
  return json(200, { members: data ?? [] })
}

export async function listTeamMembers(event: HandlerEvent, user: AuthedUser) {
  requireAdminOrAbove(user)
  const supabase = getSupabaseAdmin()
  const orgId = resolveOrganizationId(user, event)

  let query = supabase.from('profiles').select(PROFILE_COLUMNS_WITH_PERMISSIONS).neq('role', 'super_admin')
  query = scopeToOrg(query as any, orgId) as any
  const { data: profiles, error } = await query.order('created_at', { ascending: true })
  if (error) throw new HttpError(500, error.message)

  const { data: authList, error: authErr } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  if (authErr) throw new HttpError(500, authErr.message)
  const lastLoginById = new Map(authList.users.map((u) => [u.id, u.last_sign_in_at]))

  return json(200, {
    members: (profiles ?? []).map((p) => ({
      ...p,
      permissions: normalizePermissions(p.permissions),
      last_login_at: lastLoginById.get(p.id) ?? null,
    })),
  })
}

/** Admins (and a Super Admin drilled into a specific organization) can create
 * User accounts within that same organization. Creating Admin accounts is a
 * separate flow (organizations.ts) that also spins up a new organization —
 * this endpoint always forces role='user', never trusting the client. */
export async function createTeamMember(event: HandlerEvent, user: AuthedUser) {
  requireAdminOrAbove(user)
  await requireAal2IfEnrolled(user)
  const supabase = getSupabaseAdmin()
  const orgId = resolveOrganizationId(user, event)
  if (orgId === null) throw new HttpError(400, 'Select an organization before adding a team member')
  const body = JSON.parse(event.body || '{}')

  const email = (body.email ?? '').trim()
  const password = body.password ?? ''
  const nickname = (body.nickname ?? '').trim()

  if (!email) throw new HttpError(400, 'email is required')
  if (!password || password.length < 8) throw new HttpError(400, 'password must be at least 8 characters')
  if (!nickname) throw new HttpError(400, 'nickname is required')

  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (createErr) throw new HttpError(400, createErr.message)

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .update({ nickname, role: 'user', organization_id: orgId })
    .eq('id', created.user.id)
    .select(PROFILE_COLUMNS)
    .single()

  if (profileErr) throw new HttpError(500, profileErr.message)

  await logAuditEvent('user_account_created', user, event, {
    organizationId: orgId,
    targetProfileId: created.user.id,
    metadata: { email, nickname },
  })

  return json(201, profile)
}

async function getTargetProfile(id: string, orgId: string | null) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('profiles')
    .select(`${PROFILE_COLUMNS_WITH_PERMISSIONS}, organization_id`)
    .eq('id', id)
    .maybeSingle()
  if (error) throw new HttpError(500, error.message)
  if (!data) throw new HttpError(404, 'Team member not found')
  if (data.role === 'super_admin' || data.organization_id !== orgId) throw new HttpError(404, 'Team member not found')
  return data
}

/** Proactive reset from Team Management — no forgot-password request needed.
 * An Admin may reset a User in their own organization; only a Super Admin may
 * reset an Admin (same rule enforced again, independently, inside
 * performPasswordReset itself — this check here is just the fast, org-scoped
 * "does this row exist for you at all" gate that every other team.ts route uses). */
export async function resetTeamMemberPassword(id: string, event: HandlerEvent, user: AuthedUser) {
  requireAdminOrAbove(user)
  await requireAal2IfEnrolled(user)
  const orgId = resolveOrganizationId(user, event)
  const target = await getTargetProfile(id, orgId)
  if (target.id === user.id) throw new HttpError(400, 'Use your own account settings to change your own password')
  if (target.role !== 'user' && !isSuperAdmin(user)) {
    throw new HttpError(403, "Only a Super Admin can reset an Admin account's password")
  }

  const result = await performPasswordReset(target.id, user)
  return json(200, { admin: result })
}

/** Body: a partial UserPermissions object — unspecified keys keep their current
 * value. Admin/Super Admin permissions are fixed and never configurable: this
 * endpoint 400s if the target isn't a plain User. */
export async function getTeamMemberPermissions(id: string, event: HandlerEvent, user: AuthedUser) {
  requireAdminOrAbove(user)
  const orgId = resolveOrganizationId(user, event)
  const target = await getTargetProfile(id, orgId)
  if (target.role !== 'user') throw new HttpError(400, 'Only User-role accounts have configurable permissions')
  return json(200, { permissions: normalizePermissions(target.permissions) })
}

export async function updateTeamMemberPermissions(id: string, event: HandlerEvent, user: AuthedUser) {
  requireAdminOrAbove(user)
  await requireAal2IfEnrolled(user)
  const supabase = getSupabaseAdmin()
  const orgId = resolveOrganizationId(user, event)
  const target = await getTargetProfile(id, orgId)
  if (target.role !== 'user') throw new HttpError(400, 'Only User-role accounts have configurable permissions')

  const body = JSON.parse(event.body || '{}')
  const reset = Boolean(body.reset)
  const next = reset
    ? { ...DEFAULT_USER_PERMISSIONS }
    : normalizePermissions({ ...normalizePermissions(target.permissions), ...(body.permissions ?? {}) })

  const { data, error } = await supabase
    .from('profiles')
    .update({ permissions: next })
    .eq('id', id)
    .select(PROFILE_COLUMNS_WITH_PERMISSIONS)
    .single()

  if (error) throw new HttpError(500, error.message)

  await logAuditEvent('permissions_changed', user, event, {
    organizationId: orgId,
    targetProfileId: id,
    metadata: { reset, permissions: next },
  })

  return json(200, { ...data, permissions: normalizePermissions(data.permissions) })
}

async function reassignRecords(fromId: string, toId: string | null) {
  const supabase = getSupabaseAdmin()
  const { error: leadsErr } = await supabase.from('leads').update({ assigned_to: toId }).eq('assigned_to', fromId)
  if (leadsErr) throw new HttpError(500, leadsErr.message)
  const { error: dealsErr } = await supabase.from('deals').update({ owner_id: toId }).eq('owner_id', fromId)
  if (dealsErr) throw new HttpError(500, dealsErr.message)
}

/** Body: { nickname?, role?, is_active?, reassignTo? }
 * reassignTo only applies when is_active is being set to false: the target's
 * currently-assigned leads/deals move to reassignTo (or are unassigned if omitted). */
export async function updateTeamMember(id: string, event: HandlerEvent, user: AuthedUser) {
  requireAdminOrAbove(user)
  await requireAal2IfEnrolled(user)
  const supabase = getSupabaseAdmin()
  const orgId = resolveOrganizationId(user, event)
  const body = JSON.parse(event.body || '{}')
  const target = await getTargetProfile(id, orgId)

  if (target.role !== 'user' && !isSuperAdmin(user)) {
    throw new HttpError(403, 'Only a Super Admin can edit an Admin account')
  }
  if (target.id === user.id) {
    throw new HttpError(400, 'Use your own account settings to edit yourself')
  }

  // Role changes aren't supported here: each organization has exactly one Admin
  // (its owner, set at organization-creation time) — promoting/demoting would
  // either create a second Admin or leave the organization without one.
  const update: Record<string, any> = {}
  if ('nickname' in body) {
    const nickname = (body.nickname ?? '').trim()
    if (!nickname) throw new HttpError(400, 'nickname cannot be empty')
    update.nickname = nickname
  }
  if ('is_active' in body) {
    const isActive = Boolean(body.is_active)
    update.is_active = isActive

    const { error: banErr } = await supabase.auth.admin.updateUserById(id, {
      ban_duration: isActive ? 'none' : BAN_DURATION,
    })
    if (banErr) throw new HttpError(500, banErr.message)

    if (!isActive) {
      const reassignTo = body.reassignTo || null
      await reassignRecords(id, reassignTo)
    }
  }

  if (Object.keys(update).length === 0) throw new HttpError(400, 'Nothing to update')

  const { data, error } = await supabase
    .from('profiles')
    .update(update)
    .eq('id', id)
    .select(PROFILE_COLUMNS)
    .single()

  if (error) throw new HttpError(500, error.message)

  if ('is_active' in update) {
    await logAuditEvent(update.is_active ? 'team_member_reactivated' : 'team_member_deactivated', user, event, {
      organizationId: orgId,
      targetProfileId: id,
      metadata: { email: target.email, nickname: target.nickname },
    })
  }

  return json(200, data)
}

/** Body: { confirm: string } — the frontend requires the admin to type the
 * member's email as a safety net; the actual authorization is the role check. */
export async function deleteTeamMember(id: string, event: HandlerEvent, user: AuthedUser) {
  requireSuperAdmin(user)
  await requireAal2IfEnrolled(user)
  const supabase = getSupabaseAdmin()
  const orgId = resolveOrganizationId(user, event)
  const body = JSON.parse(event.body || '{}')
  const target = await getTargetProfile(id, orgId)

  if (target.id === user.id) throw new HttpError(400, 'You cannot delete your own account')
  if ((body.confirm ?? '').trim().toLowerCase() !== target.email.toLowerCase()) {
    throw new HttpError(400, 'Confirmation text does not match this member\'s email')
  }

  // Orphaned leads/deals reassign to the Super Admin performing the deletion.
  await reassignRecords(id, user.id)

  const { error } = await supabase.auth.admin.deleteUser(id)
  if (error) throw new HttpError(500, error.message)

  await logAuditEvent('team_member_deleted', user, event, {
    organizationId: orgId,
    metadata: { email: target.email, nickname: target.nickname },
  })

  return json(200, { success: true })
}
