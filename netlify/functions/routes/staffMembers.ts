import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import { requireSuperAdmin, requireSuperAdminOrStaff, requireAal2IfEnrolled } from '../lib/permissions.js'
import { logAuditEvent } from '../lib/auditLog.js'
import type { AuthedUser } from '../lib/auth.js'

const BAN_DURATION = '876000h'
const COLUMNS = 'id, email, nickname, is_active, created_at'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Staff can VIEW this list (per spec — a Staff member can see who their
 * fellow Staff are) but only a Super Admin can add/deactivate/delete —
 * enforced per-function below, not here. */
export async function listStaffMembers(user: AuthedUser) {
  requireSuperAdminOrStaff(user)
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('profiles').select(COLUMNS).eq('role', 'staff').order('created_at', { ascending: true })
  if (error) throw new HttpError(500, error.message)
  return json(200, { staff: data ?? [] })
}

/** Body: { email, password, nickname }. Super Admin only — Staff cannot add
 * other Staff members. Mirrors the exact createUser + email_confirm: true +
 * force_password_change pattern already established for Admin/User/Affiliate
 * account creation, with no separate email-invite flow: the Super Admin sets
 * the initial password directly and hands it to the new Staff member. */
export async function createStaffMember(event: HandlerEvent, user: AuthedUser) {
  requireSuperAdmin(user)
  await requireAal2IfEnrolled(user)
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')

  const email = (body.email ?? '').trim()
  const password = body.password ?? ''
  const nickname = (body.nickname ?? '').trim()

  if (!email) throw new HttpError(400, 'email is required')
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Enter a valid email address')
  if (!password || password.length < 8) throw new HttpError(400, 'password must be at least 8 characters')
  if (!nickname) throw new HttpError(400, 'nickname is required')

  const { data: created, error: createErr } = await supabase.auth.admin.createUser({ email, password, email_confirm: true })
  if (createErr) throw new HttpError(400, createErr.message)

  const { error: profileErr } = await supabase
    .from('profiles')
    .update({ nickname, role: 'staff', organization_id: null, force_password_change: true })
    .eq('id', created.user.id)
  if (profileErr) {
    await supabase.auth.admin.deleteUser(created.user.id)
    throw new HttpError(500, profileErr.message)
  }

  await logAuditEvent('staff_account_created', user, event, {
    organizationId: null,
    targetProfileId: created.user.id,
    metadata: { email, nickname },
  })

  return json(201, { id: created.user.id, email, nickname, is_active: true, created_at: new Date().toISOString() })
}

/** Body: { status: 'active' | 'suspended' }. Super Admin only. */
export async function updateStaffStatus(id: string, event: HandlerEvent, user: AuthedUser) {
  requireSuperAdmin(user)
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')
  if (!['active', 'suspended'].includes(body.status)) throw new HttpError(400, "status must be 'active' or 'suspended'")

  const { data: staff, error: fetchErr } = await supabase.from('profiles').select('id, nickname').eq('id', id).eq('role', 'staff').maybeSingle()
  if (fetchErr) throw new HttpError(500, fetchErr.message)
  if (!staff) throw new HttpError(404, 'Staff member not found')

  const isActive = body.status === 'active'
  const { data, error } = await supabase.from('profiles').update({ is_active: isActive }).eq('id', id).select(COLUMNS).single()
  if (error) throw new HttpError(500, error.message)
  await supabase.auth.admin.updateUserById(id, { ban_duration: isActive ? 'none' : BAN_DURATION })

  await logAuditEvent(isActive ? 'staff_account_reactivated' : 'staff_account_deactivated', user, event, {
    organizationId: null,
    targetProfileId: id,
    metadata: { nickname: staff.nickname },
  })

  return json(200, data)
}

/** Super Admin only — permanently deletes the Staff member's Auth user,
 * which cascades to delete their profiles row (profiles.id references
 * auth.users(id) on delete cascade), exactly like Organization member deletion. */
export async function deleteStaffMember(id: string, event: HandlerEvent, user: AuthedUser) {
  requireSuperAdmin(user)
  const supabase = getSupabaseAdmin()

  const { data: staff, error: fetchErr } = await supabase.from('profiles').select('id, nickname, email').eq('id', id).eq('role', 'staff').maybeSingle()
  if (fetchErr) throw new HttpError(500, fetchErr.message)
  if (!staff) throw new HttpError(404, 'Staff member not found')

  await logAuditEvent('staff_account_deleted', user, event, {
    organizationId: null,
    targetProfileId: id,
    metadata: { nickname: staff.nickname, email: staff.email },
  })

  const { error } = await supabase.auth.admin.deleteUser(id)
  if (error) throw new HttpError(500, error.message)

  return json(200, { success: true })
}
