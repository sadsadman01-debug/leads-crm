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
import { getOrCreateAffiliateSettingsRow } from '../lib/affiliateSettings.js'
import { PAYMENT_METHODS } from '../lib/paymentMethods.js'
import type { AuthedUser } from '../lib/auth.js'

const DUE_SOON_DAYS = 5

/** Public — reachable from the Login/Request Access pages before any session
 * exists, so the requester sees the price they'll actually be locked into. */
export async function getPublicPricing() {
  const settings = await getOrCreateBillingSettingsRow()
  const tier = await computeCurrentPricingTier(settings)
  const standardPrice = Number(settings.standard_price_usd)
  return json(200, {
    ...tier,
    // Always the current Standard rate, regardless of which tier applies —
    // lets the Request Access form show "was $X, now $Y" savings while
    // Early Bird is active.
    standard_price_usd: standardPrice,
    standard_annual_total_usd: computeAnnualTotal(standardPrice),
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

/** 'cancelled' is decided by the caller (whenever subscription_cancelled_at is
 * set) and always wins over the date-based computation below — a cancelled
 * Organization is never shown as Overdue/Due Soon (they're not expected to
 * renew), even though its subscription_end_date keeps enforcing access
 * exactly as before until it naturally passes. */
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

const STATUS_RANK: Record<string, number> = { overdue: 0, due_soon: 1, pending: 2, paid: 3, cancelled: 4 }

/** Every Organization with its billing status — Overdue and Due Soon
 * surfaced first, each group then soonest-due first. Cancelled Organizations
 * sort last, since there's nothing actionable left to chase. */
export async function listBilling(event: HandlerEvent, user: AuthedUser) {
  requireSuperAdmin(user)
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('organizations')
    .select(
      'id, name, status, pricing_tier, monthly_price_usd, billing_cycle, annual_total_usd, payment_status, subscription_end_date, payment_method, subscription_cancelled_at'
    )
    .order('created_at', { ascending: true })
  if (error) throw new HttpError(500, error.message)

  const rows = (data ?? []).map((org) => ({
    ...org,
    billing_status: org.subscription_cancelled_at ? ('cancelled' as const) : computeBillingStatus(org.subscription_end_date),
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

/** Called from recordPayment whenever the paying Organization has a
 * referred_by_affiliate_id — generates a first_payment or recurring
 * commission per the Affiliate Program Settings' rates/duration cap. A
 * commission-generation failure never blocks the payment itself from being
 * recorded (best-effort side effect, same convention as notifications). */
async function maybeGenerateAffiliateCommission(
  org: { id: string; name: string; referred_by_affiliate_id: string; affiliate_recurring_commissions_paid: number },
  paymentAmount: number,
  isFirstPayment: boolean,
  user: AuthedUser,
  event: HandlerEvent
) {
  try {
    const supabase = getSupabaseAdmin()
    const settings = await getOrCreateAffiliateSettingsRow()
    if (!settings.affiliate_program_enabled) return

    if (isFirstPayment) {
      const pct = Number(settings.affiliate_first_payment_commission_pct)
      const commissionAmount = Math.round(paymentAmount * (pct / 100) * 100) / 100
      await supabase.from('affiliate_commissions').insert({
        affiliate_id: org.referred_by_affiliate_id,
        organization_id: org.id,
        commission_type: 'first_payment',
        commission_amount_usd: commissionAmount,
        source_payment_amount_usd: paymentAmount,
      })
      await logAuditEvent('affiliate_commission_generated', user, event, {
        organizationId: org.id,
        metadata: { affiliateId: org.referred_by_affiliate_id, commissionType: 'first_payment', commissionAmount, paymentAmount },
      })
      return
    }

    if (
      settings.affiliate_recurring_duration_type === 'capped' &&
      settings.affiliate_recurring_duration_count != null &&
      org.affiliate_recurring_commissions_paid >= settings.affiliate_recurring_duration_count
    ) {
      return // Recurring commission window has already been exhausted for this Organization.
    }

    const pct = Number(settings.affiliate_recurring_commission_pct)
    const commissionAmount = Math.round(paymentAmount * (pct / 100) * 100) / 100
    await supabase.from('affiliate_commissions').insert({
      affiliate_id: org.referred_by_affiliate_id,
      organization_id: org.id,
      commission_type: 'recurring',
      commission_amount_usd: commissionAmount,
      source_payment_amount_usd: paymentAmount,
    })
    await supabase
      .from('organizations')
      .update({ affiliate_recurring_commissions_paid: org.affiliate_recurring_commissions_paid + 1 })
      .eq('id', org.id)
    await logAuditEvent('affiliate_commission_generated', user, event, {
      organizationId: org.id,
      metadata: { affiliateId: org.referred_by_affiliate_id, commissionType: 'recurring', commissionAmount, paymentAmount },
    })
  } catch (err) {
    console.error('Failed to generate affiliate commission', err)
  }
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
  if (!PAYMENT_METHODS.includes(body.payment_method)) {
    throw new HttpError(400, `payment_method must be one of ${PAYMENT_METHODS.join(', ')}`)
  }
  const payment_method = body.payment_method as (typeof PAYMENT_METHODS)[number]

  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('id, name, payment_status, billing_cycle, subscription_end_date, referred_by_affiliate_id, affiliate_recurring_commissions_paid')
    .eq('id', organizationId)
    .maybeSingle()
  if (orgErr) throw new HttpError(500, orgErr.message)
  if (!org) throw new HttpError(404, 'Organization not found')

  const { count: priorPaymentsCount, error: countErr } = await supabase
    .from('billing_history')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
  if (countErr) throw new HttpError(500, countErr.message)
  const isFirstPayment = (priorPaymentsCount ?? 0) === 0

  const { error: insErr } = await supabase
    .from('billing_history')
    .insert({ organization_id: organizationId, amount_usd: amount, paid_at: paidAt, recorded_by: user.id, notes, payment_method })
  if (insErr) throw new HttpError(500, insErr.message)

  if (org.referred_by_affiliate_id) {
    await maybeGenerateAffiliateCommission(org as any, amount, isFirstPayment, user, event)
  }

  const baseDate = extendFrom === 'current_expiry' && org.subscription_end_date ? org.subscription_end_date : paidAt
  const newSubscriptionEndDate = addBillingPeriod(baseDate, org.billing_cycle as BillingCycle)

  const update: Record<string, any> = { subscription_end_date: newSubscriptionEndDate, payment_method }
  if (org.payment_status !== 'received') update.payment_status = 'received'

  const wasExpired = Boolean(org.subscription_end_date) && new Date(org.subscription_end_date) < new Date()

  const { data: updated, error: updateErr } = await supabase
    .from('organizations')
    .update(update)
    .eq('id', organizationId)
    .select('id, name, pricing_tier, monthly_price_usd, billing_cycle, annual_total_usd, payment_status, subscription_end_date, payment_method')
    .single()
  if (updateErr) throw new HttpError(500, updateErr.message)

  await logAuditEvent('payment_recorded', user, event, {
    organizationId,
    metadata: {
      organizationName: org.name,
      amountUsd: amount,
      paidAt,
      extendFrom,
      paymentMethod: payment_method,
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

/** Super Admin only — a single Organization's complete financial relationship
 * at a glance: every payment, every refund, and its cancellation request (if
 * any), merged into one chronological timeline. */
export async function getOrganizationBillingHistory(organizationId: string, user: AuthedUser) {
  requireSuperAdmin(user)
  const supabase = getSupabaseAdmin()

  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('id, name, subscription_cancelled_at')
    .eq('id', organizationId)
    .maybeSingle()
  if (orgErr) throw new HttpError(500, orgErr.message)
  if (!org) throw new HttpError(404, 'Organization not found')

  const [{ data: payments, error: paymentsErr }, { data: refunds, error: refundsErr }, { data: cancellationRequests, error: crErr }] =
    await Promise.all([
      supabase
        .from('billing_history')
        .select('id, amount_usd, paid_at, payment_method, notes')
        .eq('organization_id', organizationId)
        .order('paid_at', { ascending: false }),
      supabase
        .from('refunds')
        .select('id, billing_history_id, amount_bdt, refund_date, reason')
        .eq('organization_id', organizationId)
        .order('refund_date', { ascending: false }),
      supabase
        .from('cancellation_requests')
        .select('id, reason, additional_comments, requested_at, status, resolved_at')
        .eq('organization_id', organizationId)
        .order('requested_at', { ascending: false }),
    ])
  if (paymentsErr) throw new HttpError(500, paymentsErr.message)
  if (refundsErr) throw new HttpError(500, refundsErr.message)
  if (crErr) throw new HttpError(500, crErr.message)

  const timeline = [
    ...(payments ?? []).map((p) => ({
      type: 'payment' as const,
      date: p.paid_at,
      amount_bdt: Number(p.amount_usd),
      payment_method: p.payment_method,
      notes: p.notes,
      id: p.id,
    })),
    ...(refunds ?? []).map((r) => ({
      type: 'refund' as const,
      date: r.refund_date,
      amount_bdt: -Number(r.amount_bdt),
      billing_history_id: r.billing_history_id,
      reason: r.reason,
      id: r.id,
    })),
    ...(cancellationRequests ?? []).map((c) => ({
      type: 'cancellation_request' as const,
      date: c.requested_at,
      reason: c.reason,
      additional_comments: c.additional_comments,
      status: c.status,
      resolved_at: c.resolved_at,
      id: c.id,
    })),
  ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))

  return json(200, {
    organization: { id: org.id, name: org.name, subscription_cancelled_at: org.subscription_cancelled_at },
    payments: payments ?? [],
    timeline,
  })
}
