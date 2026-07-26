import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from './supabaseAdmin.js'
import { normalizePermissions, type UserPermissions } from './userPermissions.js'

export type Role = 'super_admin' | 'admin' | 'user'

export interface AuthedUser {
  id: string
  email: string
  role: Role
  nickname: string | null
  is_active: boolean
  organization_id: string | null
  /** Always populated (defaulted) even for admins/super admins — they simply
   * never consult it, since every permission check short-circuits on role first. */
  permissions: UserPermissions
  force_password_change: boolean
  /** Authenticator Assurance Level read straight off the access token's own
   * claims — 'aal2' means this specific session completed an MFA challenge.
   * `supabase.auth.getUser()` doesn't surface this, so it's decoded manually
   * from the JWT payload (signature already verified by getUser() above). */
  aal: 'aal1' | 'aal2'
}

/** Decodes (does not verify — the token was already verified via
 * `supabase.auth.getUser()` immediately before this is called) the JWT payload
 * to read the `aal` claim Supabase Auth includes on every access token. */
function decodeAal(token: string): 'aal1' | 'aal2' {
  try {
    const payload = token.split('.')[1]
    const json = Buffer.from(payload, 'base64url').toString('utf8')
    const claims = JSON.parse(json)
    return claims.aal === 'aal2' ? 'aal2' : 'aal1'
  } catch {
    return 'aal1'
  }
}

/**
 * Verifies the bearer token on every request server-side via Supabase Auth, then
 * loads the caller's role/nickname/active-status from profiles. There is no
 * session state in the function itself (stateless/serverless-safe) — the JWT
 * issued by Supabase Auth plus this profile row are the only source of truth
 * for who's calling and what they're allowed to do.
 */
export async function requireUser(event: HandlerEvent): Promise<AuthedUser> {
  const authHeader = event.headers['authorization'] || event.headers['Authorization']
  const token = authHeader?.replace(/^Bearer\s+/i, '')
  if (!token) {
    throw new AuthError('Missing Authorization header')
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) {
    throw new AuthError('Invalid or expired session')
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, nickname, is_active, organization_id, permissions, force_password_change')
    .eq('id', data.user.id)
    .single()

  if (profileError || !profile) {
    throw new AuthError('Profile not found')
  }
  if (!profile.is_active) {
    throw new AuthError('This account has been deactivated')
  }

  return {
    id: data.user.id,
    email: data.user.email ?? '',
    role: profile.role,
    nickname: profile.nickname,
    is_active: profile.is_active,
    organization_id: profile.organization_id,
    permissions: normalizePermissions(profile.permissions),
    force_password_change: Boolean(profile.force_password_change),
    aal: decodeAal(token),
  }
}

export class AuthError extends Error {}
