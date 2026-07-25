import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import { requireAdminOrAbove, requireSuperAdmin, isSuperAdmin } from '../lib/permissions.js'
import type { AuthedUser } from '../lib/auth.js'

const PROFILE_COLUMNS = 'id, email, nickname, role, is_active, created_at'

// Ban far enough in the future that a deactivated account's existing session
// (and any attempt to sign back in before its JWT expires) is rejected by
// Supabase Auth itself, not just by the app-level is_active check.
const BAN_DURATION = '876000h'

export async function getMyProfile(user: AuthedUser) {
  return json(200, {
    id: user.id,
    email: user.email,
    nickname: user.nickname,
    role: user.role,
    is_active: user.is_active,
  })
}

/** Lightweight roster for assignment dropdowns/filters — any authenticated
 * team member can see who exists, without the admin-only management fields. */
export async function listRoster() {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, nickname, email')
    .eq('is_active', true)
    .order('nickname', { ascending: true })
  if (error) throw new HttpError(500, error.message)
  return json(200, { members: data ?? [] })
}

export async function listTeamMembers(user: AuthedUser) {
  requireAdminOrAbove(user)
  const supabase = getSupabaseAdmin()

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .order('created_at', { ascending: true })
  if (error) throw new HttpError(500, error.message)

  const { data: authList, error: authErr } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  if (authErr) throw new HttpError(500, authErr.message)
  const lastLoginById = new Map(authList.users.map((u) => [u.id, u.last_sign_in_at]))

  return json(200, {
    members: (profiles ?? []).map((p) => ({ ...p, last_login_at: lastLoginById.get(p.id) ?? null })),
  })
}

export async function createTeamMember(event: HandlerEvent, user: AuthedUser) {
  requireAdminOrAbove(user)
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')

  const email = (body.email ?? '').trim()
  const password = body.password ?? ''
  const nickname = (body.nickname ?? '').trim()
  let role = body.role === 'admin' ? 'admin' : 'user'

  if (!email) throw new HttpError(400, 'email is required')
  if (!password || password.length < 8) throw new HttpError(400, 'password must be at least 8 characters')
  if (!nickname) throw new HttpError(400, 'nickname is required')

  // Admins may only create Users — an Admin-role request is silently downgraded
  // rather than trusted, since role is re-checked server-side, never from the client.
  if (!isSuperAdmin(user)) role = 'user'

  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (createErr) throw new HttpError(400, createErr.message)

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .update({ nickname, role })
    .eq('id', created.user.id)
    .select(PROFILE_COLUMNS)
    .single()

  if (profileErr) throw new HttpError(500, profileErr.message)
  return json(201, profile)
}

async function getTargetProfile(id: string) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', id).maybeSingle()
  if (error) throw new HttpError(500, error.message)
  if (!data) throw new HttpError(404, 'Team member not found')
  return data
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
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')
  const target = await getTargetProfile(id)

  if (target.role !== 'user' && !isSuperAdmin(user)) {
    throw new HttpError(403, 'Only a Super Admin can edit an Admin account')
  }
  if (target.role === 'super_admin') {
    throw new HttpError(403, 'The Super Admin account cannot be edited here')
  }
  if (target.id === user.id) {
    throw new HttpError(400, 'Use your own account settings to edit yourself')
  }

  const update: Record<string, any> = {}
  if ('nickname' in body) {
    const nickname = (body.nickname ?? '').trim()
    if (!nickname) throw new HttpError(400, 'nickname cannot be empty')
    update.nickname = nickname
  }
  if ('role' in body) {
    if (!isSuperAdmin(user)) throw new HttpError(403, 'Only a Super Admin can change roles')
    if (!['admin', 'user'].includes(body.role)) throw new HttpError(400, 'role must be "admin" or "user"')
    update.role = body.role
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
  return json(200, data)
}

/** Body: { confirm: string } — the frontend requires the admin to type the
 * member's email as a safety net; the actual authorization is the role check. */
export async function deleteTeamMember(id: string, event: HandlerEvent, user: AuthedUser) {
  requireSuperAdmin(user)
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')
  const target = await getTargetProfile(id)

  if (target.role === 'super_admin') throw new HttpError(400, 'The Super Admin account cannot be deleted')
  if (target.id === user.id) throw new HttpError(400, 'You cannot delete your own account')
  if ((body.confirm ?? '').trim().toLowerCase() !== target.email.toLowerCase()) {
    throw new HttpError(400, 'Confirmation text does not match this member\'s email')
  }

  // Orphaned leads/deals reassign to the Super Admin performing the deletion.
  await reassignRecords(id, user.id)

  const { error } = await supabase.auth.admin.deleteUser(id)
  if (error) throw new HttpError(500, error.message)

  return json(200, { success: true })
}
