import type { HandlerEvent } from '@netlify/functions'
import crypto from 'crypto'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import { requireSuperAdmin, requireAal2IfEnrolled } from '../lib/permissions.js'
import { generateTempPassword } from '../lib/passwordGen.js'
import { notifySuperAdmins } from '../lib/notifications.js'
import { insertAuditLog, logAuditEvent, getClientIp } from '../lib/auditLog.js'
import { getOrCreateBillingSettingsRow, computeCurrentPricingTier, computeAnnualTotal, addBillingPeriod, type BillingSettingsRow } from '../lib/billingSettings.js'
import { ALLOWED_SIGNUP_COUNTRIES } from '../lib/allowedSignupCountries.js'
import { PAYMENT_METHODS } from '../lib/paymentMethods.js'
import { checkPromoCode } from '../lib/promoCodes.js'
import type { AuthedUser } from '../lib/auth.js'

const COLUMNS =
  'id, organization_name, contact_name, email, phone, message, city, country, zip_code, status, requested_at, reviewed_at, reviewed_by, rejection_reason, pricing_tier, monthly_price_usd, payment_status, billing_cycle, annual_total_usd, referred_by_affiliate_id, promo_code_id, promo_code_text, original_price_bdt, discount_amount_bdt, final_price_bdt, payment_method, payment_token'

/** Re-runs the exact same eligibility check the "Apply" button used (active /
 * usage limit / expiry / Early Bird) and computes the discount against
 * `originalPrice`. Never throws for an ineligible code — if it became invalid
 * between Apply and submission (expired, hit its limit, code changed, tier
 * flipped), the caller decides whether that should block submission (it
 * doesn't; it's simply not applied). Percent discounts round to the nearest
 * Taka; the final price is floored at 0. */
async function resolvePromoDiscount(codeInput: string, originalPrice: number, settings: BillingSettingsRow, isEarlyBird: boolean) {
  const code = codeInput.trim()
  if (!code) return null

  const result = await checkPromoCode(code, settings, isEarlyBird)
  if (!result.ok) return null
  const { promo } = result

  const rawDiscount = promo.discount_type === 'percent' ? originalPrice * (promo.discount_value / 100) : promo.discount_value
  const discount_amount_bdt = Math.min(Math.round(rawDiscount), originalPrice)
  const final_price_bdt = Math.max(originalPrice - discount_amount_bdt, 0)

  return { promo_code_id: promo.id, promo_code_text: promo.code, discount_amount_bdt, final_price_bdt }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** POST /signup-requests — public, unauthenticated. Only ever inserts a
 * pending row; never creates an Auth account or an Organization. */
export async function createSignupRequest(event: HandlerEvent) {
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')

  const organization_name = (body.organization_name ?? '').trim()
  const contact_name = (body.contact_name ?? '').trim()
  const email = (body.email ?? '').trim()
  const phone = (body.phone ?? '').trim() || null
  const message = (body.message ?? '').trim() || null
  const city = (body.city ?? '').trim()
  const country = (body.country ?? '').trim()
  const zip_code = (body.zip_code ?? '').trim()

  if (!organization_name) throw new HttpError(400, 'Organization name is required')
  if (!contact_name) throw new HttpError(400, 'Contact name is required')
  if (!email) throw new HttpError(400, 'Email is required')
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Enter a valid email address')
  if (!city) throw new HttpError(400, 'City is required')
  if (!country) throw new HttpError(400, 'Country is required')
  if (!zip_code) throw new HttpError(400, 'ZIP/Postal Code is required')
  if (!ALLOWED_SIGNUP_COUNTRIES.includes(country)) {
    throw new HttpError(
      400,
      `Leadify is currently only available in ${ALLOWED_SIGNUP_COUNTRIES.join(', ')}. We'll be expanding to more countries soon — thank you for your interest!`
    )
  }

  // Locked in NOW, not at approval time, so a review delay never changes the
  // price a requester was shown when they submitted.
  const billingSettings = await getOrCreateBillingSettingsRow()
  const { pricing_tier, monthly_price_usd } = await computeCurrentPricingTier(billingSettings)
  const billing_cycle = body.billing_cycle === 'annual' ? 'annual' : 'monthly'
  const annual_total_usd = billing_cycle === 'annual' ? computeAnnualTotal(monthly_price_usd) : null

  // Discount is always computed against the monthly rate, matching the
  // literal wording of the spec — an annual signup's annual_total_usd is
  // unaffected by the promo code.
  const original_price_bdt = monthly_price_usd
  let promo_code_id: string | null = null
  let promo_code_text: string | null = null
  let discount_amount_bdt = 0
  let final_price_bdt = original_price_bdt
  const promoCodeInput = (body.promo_code ?? '').trim()
  if (promoCodeInput) {
    const resolved = await resolvePromoDiscount(promoCodeInput, original_price_bdt, billingSettings, pricing_tier === 'early_bird')
    if (resolved) {
      promo_code_id = resolved.promo_code_id
      promo_code_text = resolved.promo_code_text
      discount_amount_bdt = resolved.discount_amount_bdt
      final_price_bdt = resolved.final_price_bdt
    }
  }

  // Silent referral capture — a stale/invalid code just leaves this null,
  // never surfaced as an error to the requester.
  let referred_by_affiliate_id: string | null = null
  const refCode = (body.ref ?? '').trim()
  if (refCode) {
    const { data: affiliate } = await supabase.from('affiliates').select('id').eq('referral_code', refCode).eq('status', 'active').maybeSingle()
    referred_by_affiliate_id = affiliate?.id ?? null
  }

  const { data, error } = await supabase
    .from('signup_requests')
    .insert({
      organization_name,
      contact_name,
      email,
      phone,
      message,
      city,
      country,
      zip_code,
      status: 'pending',
      pricing_tier,
      monthly_price_usd,
      billing_cycle,
      annual_total_usd,
      referred_by_affiliate_id,
      promo_code_id,
      promo_code_text,
      original_price_bdt,
      discount_amount_bdt,
      final_price_bdt,
      // Generated explicitly here (not left to the column default) so the
      // /pay page's identifying parameter is always a cryptographically
      // secure, application-generated value — never sequential, never
      // derivable from the request's own internal id/email/timestamp.
      payment_token: crypto.randomUUID(),
    })
    .select(COLUMNS)
    .single()

  if (error) throw new HttpError(500, error.message)

  await notifySuperAdmins({
    type: 'signup_request',
    title: 'New signup request',
    message: `${organization_name} (${contact_name}) requested access.`,
    link_route: '/signup-requests',
    related_entity_id: data.id,
    related_entity_type: 'signup_request',
  })

  await insertAuditLog({
    eventType: 'signup_request_submitted',
    metadata: { organization_name, contact_name, email },
    ipAddress: getClientIp(event),
  })

  return json(201, data)
}

export async function listSignupRequests(user: AuthedUser) {
  requireSuperAdmin(user)
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('signup_requests').select(COLUMNS).order('requested_at', { ascending: false })
  if (error) throw new HttpError(500, error.message)

  const affiliateIds = [...new Set((data ?? []).map((r) => r.referred_by_affiliate_id).filter(Boolean))] as string[]
  const { data: affiliates } =
    affiliateIds.length > 0 ? await supabase.from('affiliates').select('id, full_name').in('id', affiliateIds) : { data: [] as any[] }
  const affiliateNameById = new Map((affiliates ?? []).map((a: any) => [a.id, a.full_name]))

  return json(200, {
    requests: (data ?? []).map((r) => ({
      ...r,
      referred_by_affiliate_name: r.referred_by_affiliate_id ? affiliateNameById.get(r.referred_by_affiliate_id) ?? null : null,
    })),
  })
}

async function getRequestOrThrow(id: string) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('signup_requests').select(COLUMNS).eq('id', id).maybeSingle()
  if (error) throw new HttpError(500, error.message)
  if (!data) throw new HttpError(404, 'Signup request not found')
  return data
}

/** Looked up by the dedicated public `payment_token` — never the internal
 * `id` — so the /pay page's URL parameter can never be used to enumerate or
 * target an arbitrary request by guessing/incrementing a database key. */
async function getRequestByPaymentTokenOrThrow(token: string) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('signup_requests').select(COLUMNS).eq('payment_token', token).maybeSingle()
  if (error) throw new HttpError(500, error.message)
  if (!data) throw new HttpError(404, 'Signup request not found')
  return data
}

/** Atomically (best-effort, with rollback on failure) creates the Organization,
 * an auto-confirmed Auth account with a securely generated temporary password,
 * and the Admin profile flagged force_password_change — then marks the request
 * approved. The temporary password is returned once, in this response only;
 * it is never stored anywhere and never sent by this app via email. */
export async function approveSignupRequest(id: string, event: HandlerEvent, user: AuthedUser) {
  requireSuperAdmin(user)
  await requireAal2IfEnrolled(user)
  const supabase = getSupabaseAdmin()
  const request = await getRequestOrThrow(id)
  if (request.status !== 'pending') throw new HttpError(400, 'This request has already been reviewed')

  const body = JSON.parse(event.body || '{}')
  // The Payment Status shown in the approval confirmation modal is whatever
  // is already set on the request — this lets the Super Admin finalize a
  // last-second change (e.g. Pending -> Received) in the same action.
  const finalPaymentStatus = ['pending', 'received', 'waived'].includes(body.payment_status)
    ? body.payment_status
    : request.payment_status

  if (!PAYMENT_METHODS.includes(body.payment_method)) {
    throw new HttpError(400, `payment_method must be one of ${PAYMENT_METHODS.join(', ')}`)
  }
  const payment_method = body.payment_method as (typeof PAYMENT_METHODS)[number]

  const temporaryPassword = generateTempPassword()
  const now = new Date()
  const firstPaymentConfirmedAt = now.toISOString()
  const subscriptionEndDate = addBillingPeriod(now.toISOString().slice(0, 10), request.billing_cycle)

  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .insert({
      name: request.organization_name,
      created_by: user.id,
      status: 'active',
      city: request.city,
      country: request.country,
      zip_code: request.zip_code,
      pricing_tier: request.pricing_tier,
      monthly_price_usd: request.monthly_price_usd,
      billing_cycle: request.billing_cycle,
      annual_total_usd: request.annual_total_usd,
      payment_status: finalPaymentStatus,
      first_payment_confirmed_at: firstPaymentConfirmedAt,
      subscription_end_date: subscriptionEndDate,
      referred_by_affiliate_id: request.referred_by_affiliate_id,
      promo_code_id: request.promo_code_id,
      promo_code_text: request.promo_code_text,
      original_price_bdt: request.original_price_bdt,
      discount_amount_bdt: request.discount_amount_bdt,
      final_price_bdt: request.final_price_bdt,
      payment_method,
    })
    .select(
      'id, name, city, country, zip_code, pricing_tier, monthly_price_usd, billing_cycle, annual_total_usd, payment_status, subscription_end_date, referred_by_affiliate_id, promo_code_id, promo_code_text, original_price_bdt, discount_amount_bdt, final_price_bdt, payment_method'
    )
    .single()
  if (orgErr) throw new HttpError(500, orgErr.message)

  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email: request.email,
    password: temporaryPassword,
    email_confirm: true,
  })
  if (createErr) {
    await supabase.from('organizations').delete().eq('id', org.id)
    throw new HttpError(400, createErr.message)
  }

  const { error: profileErr } = await supabase
    .from('profiles')
    .update({
      nickname: request.contact_name,
      role: 'admin',
      organization_id: org.id,
      force_password_change: true,
    })
    .eq('id', created.user.id)

  if (profileErr) {
    await supabase.auth.admin.deleteUser(created.user.id)
    await supabase.from('organizations').delete().eq('id', org.id)
    throw new HttpError(500, profileErr.message)
  }

  const { data: updatedRequest, error: reqErr } = await supabase
    .from('signup_requests')
    .update({ status: 'approved', reviewed_at: new Date().toISOString(), reviewed_by: user.id, payment_status: finalPaymentStatus })
    .eq('id', id)
    .select(COLUMNS)
    .single()
  if (reqErr) throw new HttpError(500, reqErr.message)

  // First billing_history record — the promo discount only ever applies to
  // the monthly rate, same reasoning as annual_total_usd being unaffected above.
  const firstPaymentAmount = request.billing_cycle === 'annual' ? request.annual_total_usd : request.final_price_bdt ?? request.monthly_price_usd
  await supabase.from('billing_history').insert({
    organization_id: org.id,
    amount_usd: firstPaymentAmount,
    paid_at: firstPaymentConfirmedAt.slice(0, 10),
    recorded_by: user.id,
    payment_method,
  })

  // Increment times_used exactly once, only on approval (never on rejection).
  if (request.promo_code_id) {
    const { data: promo } = await supabase.from('promo_codes').select('times_used').eq('id', request.promo_code_id).maybeSingle()
    if (promo) {
      await supabase
        .from('promo_codes')
        .update({ times_used: promo.times_used + 1 })
        .eq('id', request.promo_code_id)
    }
  }

  await logAuditEvent('signup_request_approved', user, event, {
    organizationId: org.id,
    targetProfileId: created.user.id,
    metadata: { organization_name: request.organization_name, email: request.email },
  })
  await logAuditEvent('admin_account_created', user, event, {
    organizationId: org.id,
    targetProfileId: created.user.id,
    metadata: { email: request.email, nickname: request.contact_name },
  })

  return json(200, {
    request: updatedRequest,
    organization: org,
    admin: { email: request.email, nickname: request.contact_name, temporary_password: temporaryPassword },
  })
}

/** Body: { rejection_reason?: string } — an internal-only note, never sent anywhere. */
export async function rejectSignupRequest(id: string, event: HandlerEvent, user: AuthedUser) {
  requireSuperAdmin(user)
  await requireAal2IfEnrolled(user)
  const request = await getRequestOrThrow(id)
  if (request.status !== 'pending') throw new HttpError(400, 'This request has already been reviewed')

  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')
  const rejection_reason = (body.rejection_reason ?? '').trim() || null

  const { data, error } = await supabase
    .from('signup_requests')
    .update({ status: 'rejected', reviewed_at: new Date().toISOString(), reviewed_by: user.id, rejection_reason })
    .eq('id', id)
    .select(COLUMNS)
    .single()
  if (error) throw new HttpError(500, error.message)

  await logAuditEvent('signup_request_rejected', user, event, {
    metadata: { organization_name: request.organization_name, email: request.email, rejection_reason },
  })

  return json(200, data)
}

/** Body: { payment_status: 'pending' | 'received' | 'waived' } — settable any
 * time before (or as part of) approval, so the Super Admin can mark payment
 * confirmed once it actually arrives, without having to approve immediately. */
export async function updateSignupRequestPaymentStatus(id: string, event: HandlerEvent, user: AuthedUser) {
  requireSuperAdmin(user)
  const supabase = getSupabaseAdmin()
  const request = await getRequestOrThrow(id)
  const body = JSON.parse(event.body || '{}')

  if (!['pending', 'received', 'waived'].includes(body.payment_status)) {
    throw new HttpError(400, "payment_status must be 'pending', 'received', or 'waived'")
  }

  const { data, error } = await supabase
    .from('signup_requests')
    .update({ payment_status: body.payment_status })
    .eq('id', id)
    .select(COLUMNS)
    .single()
  if (error) throw new HttpError(500, error.message)

  await logAuditEvent('payment_status_changed', user, event, {
    metadata: { organization_name: request.organization_name, from: request.payment_status, to: body.payment_status },
  })

  return json(200, data)
}

/** Public — reachable from the /pay page before any session exists. Looked up
 * by payment_token (never id — see getRequestByPaymentTokenOrThrow). Returns
 * only what's needed to show payment instructions (never email/phone/message,
 * even though this is the requester's own data — no auth exists here to
 * prove that, so this endpoint is treated as fully public-readable). */
export async function getPublicSignupRequestForPayment(token: string) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('signup_requests')
    .select('organization_name, status, final_price_bdt, billing_cycle, payment_method')
    .eq('payment_token', token)
    .maybeSingle()
  if (error) throw new HttpError(500, error.message)
  if (!data) throw new HttpError(404, 'Signup request not found')
  return json(200, data)
}

/** Maps a Receiving Payment Account's method_type (+ MFS provider) onto the
 * signup_requests.payment_method enum — 'mfs' isn't itself a valid value
 * there (it needs the specific provider: bkash/nagad/rocket), and any MFS
 * provider outside that trio (Upay, a freeform "Other") falls back to 'other'. */
function paymentMethodFromAccount(account: { method_type: string; details: any }): (typeof PAYMENT_METHODS)[number] {
  if (account.method_type === 'bank_account') return 'bank_transfer'
  if (account.method_type === 'crypto') return 'crypto'
  const provider = (account.details?.provider ?? '').toLowerCase()
  if (provider === 'bkash') return 'bkash'
  if (provider === 'nagad') return 'nagad'
  if (provider === 'rocket') return 'rocket'
  return 'other'
}

// Unauthenticated endpoint throttle — the token itself is already
// effectively unguessable (crypto.randomUUID(), 122 bits of randomness), but
// this still caps automated abuse/guessing attempts against the token space,
// same DB-backed per-IP-and-window pattern used for support_contacts'
// pre-auth submissions and password-reset-requests.
const PAYMENT_METHOD_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000
const PAYMENT_METHOD_RATE_LIMIT_MAX = 10

/** Public — the /pay page's "I've Completed My Payment" action. Looked up by
 * payment_token (never id). Body: { payment_account_id }. Only pre-fills
 * payment_method on a genuinely pending request — never on one already
 * approved/rejected, so this can never tamper with a resolved request's
 * record. Never marks the request as paid/approved itself; that still
 * requires the Super Admin's manual review. */
export async function submitPaymentMethodSelection(token: string, event: HandlerEvent) {
  const supabase = getSupabaseAdmin()
  const ip = getClientIp(event)

  if (ip) {
    const since = new Date(Date.now() - PAYMENT_METHOD_RATE_LIMIT_WINDOW_MS).toISOString()
    const { count } = await supabase
      .from('payment_method_submission_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('ip', ip)
      .gte('created_at', since)
    if ((count ?? 0) >= PAYMENT_METHOD_RATE_LIMIT_MAX) {
      throw new HttpError(429, 'Too many requests — please try again later.')
    }
    await supabase.from('payment_method_submission_attempts').insert({ ip })
  }

  const body = JSON.parse(event.body || '{}')
  const paymentAccountId = (body.payment_account_id ?? '').trim()
  if (!paymentAccountId) throw new HttpError(400, 'payment_account_id is required')

  const request = await getRequestByPaymentTokenOrThrow(token)
  if (request.status !== 'pending') throw new HttpError(400, 'This request has already been reviewed and can no longer be updated')

  const { data: account, error: accountErr } = await supabase
    .from('receiving_payment_accounts')
    .select('method_type, details, is_active')
    .eq('id', paymentAccountId)
    .maybeSingle()
  if (accountErr) throw new HttpError(500, accountErr.message)
  if (!account || !account.is_active) throw new HttpError(400, 'That payment method is no longer available — please pick another.')

  const payment_method = paymentMethodFromAccount(account)

  const { data, error } = await supabase
    .from('signup_requests')
    .update({ payment_method })
    .eq('id', request.id)
    .select('payment_method')
    .single()
  if (error) throw new HttpError(500, error.message)

  return json(200, data)
}
