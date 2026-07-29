import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import { requireSuperAdmin, requireAal2IfEnrolled, resolveOrganizationId } from '../lib/permissions.js'
import {
  getOrCreateBillingSettingsRow,
  computeCurrentPricingTier,
  computeAnnualTotal,
  parseBenefitsList,
  addBillingPeriod,
  type BillingCycle,
} from '../lib/billingSettings.js'
import { logAuditEvent } from '../lib/auditLog.js'
import type { AuthedUser } from '../lib/auth.js'

const DUE_SOON_DAYS = 5

/** Public — reachable from the Login/Request Access pages before any session
 * exists, so the requester sees the price they'll actually be locked into. */
export async function getPublicPricing() {
  const settings = await getOrCreateBillingSettingsRow()
  const tier = await computeCurrentPricingTier(settings)
  return json(200, {
    ...tier,
    payment_instructions: settings.payment_instructions,
    // Only meaningful while Early Bird spots remain — the frontend hides the
    // promotional banner entirely once spots_remaining is 0.
    promotional_benefits: tier.spots_remaining > 0 ? parseBenefitsList(settings.promotional_banner_text) : [],
  })
}

export async function getBillingSettings(event: HandlerEvent, user: AuthedUser) {
  requireSuperAdmin(user)
  const settings = await getOrCreateBillingSettingsRow()
  return json(200, settings)
}

export async function updateBillingSettings(event: HandlerEvent, user: AuthedUser) {
  requireSuperAdmin(user)
  await requireAal2IfEnrolled(user)
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')
  const row = await getOrCreateBillingSettingsRow()
  const update: Record<string, any> = {}

  if ('payment_instructions' in body) {
    if (body.payment_instructions !== null && typeof body.payment_instructions !== 'string') {
      throw new HttpError(400, 'payment_instructions must be a string or null')
    }
    update.payment_instructions = body.payment_instructions === null ? null : body.payment_instructions.trim() || null
  }
  if ('promotional_banner_text' in body) {
    if (body.promotional_banner_text !== null && typeof body.promotional_banner_text !== 'string') {
      throw new HttpError(400, 'promotional_banner_text must be a string or null')
    }
    update.promotional_banner_text = body.promotional_banner_text === null ? null : body.promotional_banner_text.trim() || null
  }
  if ('early_bird_threshold' in body) {
    const n = Number(body.early_bird_threshold)
    if (!Number.isInteger(n) || n < 0) throw new HttpError(400, 'early_bird_threshold must be a non-negative integer')
    update.early_bird_threshold = n
  }
  if ('early_bird_price_usd' in body) {
    const n = Number(body.early_bird_price_usd)
    if (!Number.isFinite(n) || n < 0) throw new HttpError(400, 'early_bird_price_usd must be a non-negative number')
    update.early_bird_price_usd = n
  }
  if ('standard_price_usd' in body) {
    const n = Number(body.standard_price_usd)
    if (!Number.isFinite(n) || n < 0) throw new HttpError(400, 'standard_price_usd must be a non-negative number')
    update.standard_price_usd = n
  }
  if ('grace_period_days' in body) {
    const n = Number(body.grace_period_days)
    if (!Number.isInteger(n) || n < 0) throw new HttpError(400, 'grace_period_days must be a non-negative integer')
    update.grace_period_days = n
  }
  if (Object.keys(update).length === 0) throw new HttpError(400, 'Nothing to update')

  const { data, error } = await supabase
    .from('platform_settings')
    .update(update)
    .eq('id', row.id)
    .select(
      'id, payment_instructions, early_bird_threshold, early_bird_price_usd, standard_price_usd, promotional_banner_text, grace_period_days'
    )
    .single()
  if (error) throw new HttpError(500, error.message)

  return json(200, data)
}

function computeBillingStatus(subscriptionEndDate: string | null): 'pending' | 'overdue' | 'due_soon' | 'paid' {
  if (!subscriptionEndDate) return 'pending'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(subscriptionEndDate)
  const diffDays = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return 'overdue'
  if (diffDays <= DUE_SOON_DAYS) return 'due_soon'
  return 'paid'
}

const STATUS_RANK: Record<string, number> = { overdue: 0, due_soon: 1, pending: 2, paid: 3 }

/** Every Organization with its billing status — Overdue and Due Soon
 * surfaced first, each group then soonest-due first. */
export async function listBilling(event: HandlerEvent, user: AuthedUser) {
  requireSuperAdmin(user)
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('organizations')
    .select('id, name, status, pricing_tier, monthly_price_usd, billing_cycle, annual_total_usd, payment_status, subscription_end_date')
    .order('created_at', { ascending: true })
  if (error) throw new HttpError(500, error.message)

  const rows = (data ?? []).map((org) => ({
    ...org,
    billing_status: computeBillingStatus(org.subscription_end_date),
  }))

  rows.sort((a, b) => {
    const rankDiff = STATUS_RANK[a.billing_status] - STATUS_RANK[b.billing_status]
    if (rankDiff !== 0) return rankDiff
    if (!a.subscription_end_date) return 0
    if (!b.subscription_end_date) return -1
    return new Date(a.subscription_end_date).getTime() - new Date(b.subscription_end_date).getTime()
  })

  return json(200, { organizations: rows })
}

/** Body: { amount_usd, paid_at, notes?, extend_from: 'current_expiry' | 'payment_date' }
 * — inserts a billing_history row and advances subscription_end_date by
 * exactly one billing period (1 month or 1 year, per that Organization's
 * billing_cycle), from whichever base date the Super Admin picked. */
export async function recordPayment(organizationId: string, event: HandlerEvent, user: AuthedUser) {
  requireSuperAdmin(user)
  await requireAal2IfEnrolled(user)
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')

  const amount = Number(body.amount_usd)
  if (!Number.isFinite(amount) || amount < 0) throw new HttpError(400, 'amount_usd must be a non-negative number')
  const paidAt = body.paid_at || new Date().toISOString().slice(0, 10)
  const notes = (body.notes ?? '').trim() || null
  const extendFrom = body.extend_from === 'current_expiry' ? 'current_expiry' : 'payment_date'

  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('id, name, payment_status, billing_cycle, subscription_end_date')
    .eq('id', organizationId)
    .maybeSingle()
  if (orgErr) throw new HttpError(500, orgErr.message)
  if (!org) throw new HttpError(404, 'Organization not found')

  const { error: insErr } = await supabase
    .from('billing_history')
    .insert({ organization_id: organizationId, amount_usd: amount, paid_at: paidAt, recorded_by: user.id, notes })
  if (insErr) throw new HttpError(500, insErr.message)

  const baseDate = extendFrom === 'current_expiry' && org.subscription_end_date ? org.subscription_end_date : paidAt
  const newSubscriptionEndDate = addBillingPeriod(baseDate, org.billing_cycle as BillingCycle)

  const update: Record<string, any> = { subscription_end_date: newSubscriptionEndDate }
  if (org.payment_status !== 'received') update.payment_status = 'received'

  const wasExpired = Boolean(org.subscription_end_date) && new Date(org.subscription_end_date) < new Date()

  const { data: updated, error: updateErr } = await supabase
    .from('organizations')
    .update(update)
    .eq('id', organizationId)
    .select('id, name, pricing_tier, monthly_price_usd, billing_cycle, annual_total_usd, payment_status, subscription_end_date')
    .single()
  if (updateErr) throw new HttpError(500, updateErr.message)

  await logAuditEvent('payment_recorded', user, event, {
    organizationId,
    metadata: {
      organizationName: org.name,
      amountUsd: amount,
      paidAt,
      extendFrom,
      previousSubscriptionEndDate: org.subscription_end_date,
      newSubscriptionEndDate,
      restoredFromExpiry: wasExpired,
    },
  })

  return json(200, updated)
}

/** Any authenticated Admin/User — scoped to their own organization only.
 * Serves three surfaces: the read-only Settings billing note, the Dashboard
 * subscription widget (while still active), and — since this call itself
 * gets blocked with a 402 by requireUser once the subscription has actually
 * expired — the "Subscription Expired" screen reads its own display data
 * straight off that same 402's error payload. */
export async function getMyOrgBilling(event: HandlerEvent, user: AuthedUser) {
  const supabase = getSupabaseAdmin()
  const orgId = resolveOrganizationId(user, event)
  if (orgId === null) {
    return json(200, {
      pricing_tier: null,
      monthly_price_usd: null,
      billing_cycle: null,
      annual_total_usd: null,
      subscription_end_date: null,
      payment_instructions: null,
    })
  }

  const { data, error } = await supabase
    .from('organizations')
    .select('pricing_tier, monthly_price_usd, billing_cycle, annual_total_usd, subscription_end_date')
    .eq('id', orgId)
    .maybeSingle()
  if (error) throw new HttpError(500, error.message)
  if (!data) throw new HttpError(404, 'Organization not found')

  const settings = await getOrCreateBillingSettingsRow()
  return json(200, { ...data, payment_instructions: settings.payment_instructions })
}
