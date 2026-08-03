import type { HandlerEvent } from '@netlify/functions'
import { createHash } from 'node:crypto'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import { requireSuperAdmin, requireAal2IfEnrolled, resolveOrganizationId } from '../lib/permissions.js'
import { getOrCreateOrgReferralSettingsRow } from '../lib/orgReferralSettings.js'
import { getClientIp } from '../lib/auditLog.js'
import type { AuthedUser } from '../lib/auth.js'

export async function getOrgReferralSettings(event: HandlerEvent, user: AuthedUser) {
  requireSuperAdmin(user)
  const settings = await getOrCreateOrgReferralSettingsRow()
  return json(200, settings)
}

export async function updateOrgReferralSettings(event: HandlerEvent, user: AuthedUser) {
  requireSuperAdmin(user)
  await requireAal2IfEnrolled(user)
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')
  const row = await getOrCreateOrgReferralSettingsRow()
  const update: Record<string, any> = {}

  if ('org_referral_program_enabled' in body) update.org_referral_program_enabled = Boolean(body.org_referral_program_enabled)
  if ('org_referral_reward_months' in body) {
    const n = Number(body.org_referral_reward_months)
    if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'Reward months must be a positive whole number')
    update.org_referral_reward_months = n
  }
  if ('org_referral_max_rewards' in body) {
    update.org_referral_max_rewards = body.org_referral_max_rewards != null ? Number(body.org_referral_max_rewards) : null
  }
  if ('org_referral_terms' in body) update.org_referral_terms = (body.org_referral_terms ?? '').trim() || null

  if (Object.keys(update).length === 0) throw new HttpError(400, 'Nothing to update')

  const { data, error } = await supabase
    .from('platform_settings')
    .update(update)
    .eq('id', row.id)
    .select('id, org_referral_program_enabled, org_referral_reward_months, org_referral_max_rewards, org_referral_terms')
    .single()
  if (error) throw new HttpError(500, error.message)
  return json(200, data)
}

/** Any authenticated Admin/User (or a Super Admin drilled into a specific
 * Organization) — their own org's referral code, program terms, and a
 * simple stats/history view. Never reveals another Organization's data. */
export async function getMyReferralInfo(event: HandlerEvent, user: AuthedUser) {
  const orgId = resolveOrganizationId(user, event)
  if (!orgId) throw new HttpError(400, 'This account is not linked to an organization')
  const supabase = getSupabaseAdmin()

  const [{ data: org, error: orgErr }, settings] = await Promise.all([
    supabase.from('organizations').select('org_referral_code').eq('id', orgId).maybeSingle(),
    getOrCreateOrgReferralSettingsRow(),
  ])
  if (orgErr) throw new HttpError(500, orgErr.message)
  if (!org) throw new HttpError(404, 'Organization not found')

  const { data: referrals, error: referralsErr } = await supabase
    .from('signup_requests')
    .select('id, organization_name, status, requested_at')
    .eq('referred_by_organization_id', orgId)
    .order('requested_at', { ascending: false })
  if (referralsErr) throw new HttpError(500, referralsErr.message)

  // "Reward earned" is attributed per-referral via the REFERRED organization's
  // own referral_reward_granted_at (set at the moment its first payment
  // triggered this org's reward) — matched back to each signup_request by
  // organization name + requested date, the same identity a signup_request
  // becomes an organizations row under.
  const { data: convertedOrgs, error: convertedErr } = await supabase
    .from('organizations')
    .select('name, created_at, referral_reward_granted_at')
    .eq('referred_by_organization_id', orgId)
  if (convertedErr) throw new HttpError(500, convertedErr.message)

  const { count: rewardCount, error: rewardCountErr } = await supabase
    .from('billing_history')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('is_referral_reward', true)
  if (rewardCountErr) throw new HttpError(500, rewardCountErr.message)

  const convertedCount = (convertedOrgs ?? []).length
  const monthsEarned = (rewardCount ?? 0) * settings.org_referral_reward_months

  return json(200, {
    org_referral_code: org.org_referral_code,
    program_enabled: settings.org_referral_program_enabled,
    reward_months: settings.org_referral_reward_months,
    terms: settings.org_referral_terms,
    stats: {
      total_referred: (referrals ?? []).length,
      converted: convertedCount,
      months_earned: monthsEarned,
    },
    referrals: (referrals ?? []).map((r) => ({
      id: r.id,
      organization_name: r.organization_name,
      status: r.status,
      requested_at: r.requested_at,
      reward_earned: (convertedOrgs ?? []).some((o) => o.name === r.organization_name && Boolean(o.referral_reward_granted_at)),
    })),
  })
}

function hashIp(ip: string | null): string | null {
  if (!ip) return null
  const pepper = process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'leads-crm'
  return createHash('sha256').update(`${pepper}:${ip}`).digest('hex')
}

/** Public — logged on every Request Access page load with a valid ?org_ref=,
 * mirroring logReferralClick (Affiliate Program) exactly but against
 * org_referral_clicks/organizations instead of referral_clicks/affiliates. */
export async function logOrgReferralClick(event: HandlerEvent) {
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')
  const orgReferralCode = (body.org_referral_code ?? '').trim()
  if (!orgReferralCode) throw new HttpError(400, 'org_referral_code is required')

  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .eq('org_referral_code', orgReferralCode)
    .eq('status', 'active')
    .maybeSingle()

  if (org) {
    await supabase.from('org_referral_clicks').insert({
      organization_id: org.id,
      ip_hash: hashIp(getClientIp(event)),
      user_agent: event.headers['user-agent'] || event.headers['User-Agent'] || null,
    })
  }

  return json(200, { success: true })
}
