import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from './supabaseAdmin.js'

export type Role = 'super_admin' | 'admin' | 'user'

export interface AuthedUser {
  id: string
  email: string
  role: Role
  nickname: string | null
  is_active: boolean
  organization_id: string | null
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
    .select('role, nickname, is_active, organization_id')
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
  }
}

export class AuthError extends Error {}
