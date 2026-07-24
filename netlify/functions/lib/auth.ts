import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from './supabaseAdmin.js'

export interface AuthedUser {
  id: string
  email: string
}

/**
 * Verifies the bearer token on every request server-side via Supabase Auth.
 * There is no session state in the function itself (stateless/serverless-safe) —
 * the JWT issued by Supabase Auth is the only source of truth.
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

  return { id: data.user.id, email: data.user.email ?? '' }
}

export class AuthError extends Error {}
