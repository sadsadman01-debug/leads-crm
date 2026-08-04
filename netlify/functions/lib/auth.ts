import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from './supabaseAdmin.js'
import { normalizePermissions, type UserPermissions } from './userPermissions.js'
import { getOrCreateBillingSettingsRow } from './billingSettings.js'
import { insertAuditLog, getClientIp } from './auditLog.js'

export type Role = 'super_admin' | 'admin' | 'user' | 'affiliate' | 'staff'

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
    .select(
      // organizations!profiles_organization_id_fkey disambiguates the embed —
      // organizations also has a created_by FK back to profiles, so PostgREST
      // can't infer which relationship to embed without this being explicit.
      'role, nickname, is_active, organization_id, permissions, force_password_change, organizations!profiles_organization_id_fkey ( subscription_end_date, billing_cycle, monthly_price_usd, annual_total_usd, name )'
    )
    .eq('id', data.user.id)
    .single()

  if (profileError || !profile) {
    throw new AuthError('Profile not found')
  }
  if (!profile.is_active) {
    throw new AuthError('This account has been deactivated')
  }

  // The Super Admin belongs to no Organization and is entirely exempt — they
  // need full access to see and manually reactivate expired tenants.
  const org = (profile as any).organizations as
    | { subscription_end_date: string | null; billing_cycle: 'monthly' | 'annual'; monthly_price_usd: number | null; annual_total_usd: number | null; name: string }
    | null
  if (profile.role !== 'super_admin' && org?.subscription_end_date) {
    const settings = await getOrCreateBillingSettingsRow()
    const cutoff = new Date(org.subscription_end_date)
    cutoff.setDate(cutoff.getDate() + settings.grace_period_days)
    if (new Date() > cutoff) {
      await insertAuditLog({
        eventType: 'subscription_expired',
        actorProfileId: data.user.id,
        actorRole: profile.role,
        organizationId: profile.organization_id,
        metadata: { organizationName: org.name, subscriptionEndDate: org.subscription_end_date },
        ipAddress: getClientIp(event),
      })
      throw new SubscriptionExpiredError({
        subscription_end_date: org.subscription_end_date,
        billing_cycle: org.billing_cycle,
        monthly_price_usd: org.monthly_price_usd,
        annual_total_usd: org.annual_total_usd,
        payment_instructions: settings.payment_instructions,
      })
    }
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

export interface SubscriptionExpiredDetails {
  subscription_end_date: string
  billing_cycle: 'monthly' | 'annual'
  monthly_price_usd: number | null
  annual_total_usd: number | null
  payment_instructions: string | null
}

/** Thrown by requireUser for any non-Super-Admin account whose Organization's
 * subscription_end_date (plus any configured grace period) has passed —
 * caught in api.ts and surfaced as a distinct 402 response so the frontend
 * can redirect to the dedicated "Subscription Expired" screen instead of
 * treating this like a generic auth failure. */
export class SubscriptionExpiredError extends Error {
  details: SubscriptionExpiredDetails
  constructor(details: SubscriptionExpiredDetails) {
    super('This organization\'s subscription has expired')
    this.details = details
  }
}
