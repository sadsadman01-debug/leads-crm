import type { HandlerEvent } from '@netlify/functions'
import crypto from 'crypto'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import { requireSuperAdminOrStaff, requireAal2IfEnrolled } from '../lib/permissions.js'
import { generateTempPassword } from '../lib/passwordGen.js'
import { notifySuperAdmins, notifyOrgAdmins } from '../lib/notifications.js'
import { getOrCreateOrgReferralSettingsRow } from '../lib/orgReferralSettings.js'
import { insertAuditLog, logAuditEvent, getClientIp } from '../lib/auditLog.js'
import { getOrCreateBillingSettingsRow, computeCurrentPricingTier, computeAnnualTotal, addBillingPeriod, type BillingSettingsRow } from '../lib/billingSettings.js'
import { ALLOWED_SIGNUP_COUNTRIES } from '../lib/allowedSignupCountries.js'
import { PAYMENT_METHODS } from '../lib/paymentMethods.js'
import { checkPromoCode } from '../lib/promoCodes.js'
import { generateUniqueOrgReferralCode } from '../lib/orgReferralCode.js'
import { generateUniquePaymentReferenceCode } from '../lib/paymentReferenceCode.js'
import type { AuthedUser } from '../lib/auth.js'

const COLUMNS =
  'id, organization_name, contact_name, email, phone, message, city, country, zip_code, status, requested_at, reviewed_at, reviewed_by, rejection_reason, pricing_tier, monthly_price_usd, payment_status, billing_cycle, annual_total_usd, referred_by_affiliate_id, referred_by_organization_id, promo_code_id, promo_code_text, original_price_bdt, discount_amount_bdt, final_price_bdt, payment_method, payment_token, payment_reference_code'

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

/** POST /signup-requests — public, unauthenticated. Only ever inserts an
 * "awaiting_payment" row; never creates an Auth account or an Organization.
 * Pricing/promo/payment_token are all computed and locked in right now
 * (unchanged from before) — only the initial status differs: the request
 * isn't a genuine reviewable application yet, isn't shown in the Super
 * Admin's Pending tab, and doesn't count as an "Application Submitted" for
 * stats until the applicant actually confirms a payment method (see
 * submitPaymentMethodSelection, which performs the awaiting_payment ->
 * pending transition and fires the notification/audit log this used to
 * fire immediately on submission). */
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

  // original_price_bdt/final_price_bdt are the single correct "amount due for
  // THIS request" figure that every other screen (Payment Instructions, the
  // Approve flow, Earnings) reads directly rather than re-deriving per
  // cycle — so they must be in the scale of whichever cycle was actually
  // selected: the annual total (which already bundles its own 20% discount
  // via computeAnnualTotal) for annual, the monthly rate for monthly. A promo
  // code only ever discounts the monthly rate — annual's bundled discount
  // doesn't stack with it, matching the Request Access form's own "discount
  // applies to the monthly rate only" messaging — so promo_code_id/text are
  // still recorded for an annual signup (it still counts toward the code's
  // usage limit), but discount_amount_bdt/final_price_bdt are only ever
  // adjusted away from the sticker price when billing_cycle is monthly.
  const original_price_bdt = billing_cycle === 'annual' ? (annual_total_usd as number) : monthly_price_usd
  let promo_code_id: string | null = null
  let promo_code_text: string | null = null
  let discount_amount_bdt = 0
  let final_price_bdt = original_price_bdt
  const promoCodeInput = (body.promo_code ?? '').trim()
  if (promoCodeInput) {
    const resolved = await resolvePromoDiscount(promoCodeInput, monthly_price_usd, billingSettings, pricing_tier === 'early_bird')
    if (resolved) {
      promo_code_id = resolved.promo_code_id
      promo_code_text = resolved.promo_code_text
      if (billing_cycle === 'monthly') {
        discount_amount_bdt = resolved.discount_amount_bdt
        final_price_bdt = resolved.final_price_bdt
      }
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

  // Business Referral Program — entirely separate from the Affiliate Program
  // above (different link parameter, different table, different reward).
  // Mutually exclusive with referred_by_affiliate_id in practice, but stored
  // independently regardless.
  let referred_by_organization_id: string | null = null
  const orgRefCode = (body.org_ref ?? '').trim()
  if (orgRefCode) {
    const { data: referringOrg } = await supabase
      .from('organizations')
      .select('id')
      .eq('org_referral_code', orgRefCode)
      .eq('status', 'active')
      .maybeSingle()
    referred_by_organization_id = referringOrg?.id ?? null
  }

  // Distinct from payment_token below: this is the short, human-typable code
  // the payer includes as a reference/note when actually sending money, so
  // the Super Admin can match it against their own bKash/bank statement.
  const payment_reference_code = await generateUniquePaymentReferenceCode('signup_requests')

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
      status: 'awaiting_payment',
      pricing_tier,
      monthly_price_usd,
      billing_cycle,
      annual_total_usd,
      referred_by_affiliate_id,
      referred_by_organization_id,
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
      payment_reference_code,
    })
    .select(COLUMNS)
    .single()

  if (error) throw new HttpError(500, error.message)

  return json(201, data)
}

export async function listSignupRequests(user: AuthedUser) {
  requireSuperAdminOrStaff(user)
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

/** Business Referral Program reward — mirrors maybeGenerateAffiliateCommission's
 * best-effort/never-blocks-the-main-flow shape exactly, but grants free
 * subscription MONTHS to the referring Organization instead of a cash
 * commission. Only fires once, on the referred Organization's actual first
 * payment (finalPaymentStatus === 'received'), and only ever touches the
 * REFERRING Organization's own subscription_end_date/billing_history. */
async function maybeGrantOrgReferralReward(params: {
  referredOrgId: string
  referredOrgName: string
  referringOrgId: string
  newAdminEmail: string
  user: AuthedUser
  event: HandlerEvent
}) {
  try {
    const supabase = getSupabaseAdmin()
    const { referredOrgId, referredOrgName, referringOrgId, newAdminEmail, user, event } = params

    const settingsRow = await getOrCreateOrgReferralSettingsRow()
    if (!settingsRow.org_referral_program_enabled) return

    const { data: referringOrg } = await supabase
      .from('organizations')
      .select('id, name, subscription_end_date, billing_cycle')
      .eq('id', referringOrgId)
      .maybeSingle()
    if (!referringOrg) return

    // Basic self-referral prevention — not sophisticated fraud detection,
    // just catches the obvious case of someone referring their own business.
    const { data: referringAdmin } = await supabase
      .from('profiles')
      .select('email')
      .eq('organization_id', referringOrgId)
      .eq('role', 'admin')
      .maybeSingle()
    const sameEmail = referringAdmin?.email && referringAdmin.email.trim().toLowerCase() === newAdminEmail.trim().toLowerCase()
    const sameName = referringOrg.name.trim().toLowerCase() === referredOrgName.trim().toLowerCase()
    if (sameEmail || sameName) {
      await logAuditEvent('org_referral_reward_skipped', user, event, {
        organizationId: referringOrgId,
        metadata: { reason: 'self_referral_suspected', referringOrgName: referringOrg.name, referredOrgName },
      })
      return
    }

    if (settingsRow.org_referral_max_rewards != null) {
      const { count } = await supabase
        .from('billing_history')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', referringOrgId)
        .eq('is_referral_reward', true)
      if ((count ?? 0) >= settingsRow.org_referral_max_rewards) {
        await logAuditEvent('org_referral_reward_skipped', user, event, {
          organizationId: referringOrgId,
          metadata: { reason: 'max_rewards_reached', referringOrgName: referringOrg.name },
        })
        return
      }
    }

    const rewardMonths = settingsRow.org_referral_reward_months
    const baseDate =
      referringOrg.subscription_end_date && new Date(referringOrg.subscription_end_date) > new Date()
        ? referringOrg.subscription_end_date
        : new Date().toISOString().slice(0, 10)
    let newExpiry = new Date(baseDate)
    newExpiry.setMonth(newExpiry.getMonth() + rewardMonths)
    const newSubscriptionEndDate = newExpiry.toISOString().slice(0, 10)

    await supabase.from('organizations').update({ subscription_end_date: newSubscriptionEndDate }).eq('id', referringOrgId)
    await supabase.from('billing_history').insert({
      organization_id: referringOrgId,
      amount_usd: 0,
      paid_at: new Date().toISOString().slice(0, 10),
      recorded_by: user.id,
      notes: `Referral reward: ${rewardMonths} free month(s) for referring ${referredOrgName}`,
      is_referral_reward: true,
    })
    await supabase.from('organizations').update({ referral_reward_granted_at: new Date().toISOString() }).eq('id', referredOrgId)

    await notifyOrgAdmins(referringOrgId, {
      type: 'org_referral_reward',
      title: '🎉 You earned a free month!',
      message: `${referredOrgName} became a paying customer — you've earned ${rewardMonths} free month${rewardMonths === 1 ? '' : 's'}!`,
      link_route: '/settings',
      related_entity_id: referredOrgId,
      related_entity_type: 'organization',
    })

    await logAuditEvent('org_referral_reward_granted', user, event, {
      organizationId: referringOrgId,
      metadata: { referredOrgId, referredOrgName, rewardMonths, newSubscriptionEndDate },
    })
  } catch (err) {
    console.error('Failed to grant org referral reward', err)
  }
}

/** Atomically (best-effort, with rollback on failure) creates the Organization,
 * an auto-confirmed Auth account with a securely generated temporary password,
 * and the Admin profile flagged force_password_change — then marks the request
 * approved. The temporary password is returned once, in this response only;
 * it is never stored anywhere and never sent by this app via email. */
export async function approveSignupRequest(id: string, event: HandlerEvent, user: AuthedUser) {
  requireSuperAdminOrStaff(user)
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
  // The UI gates the Approve button on this same checkbox, but the backend
  // enforces it independently too — there is no automated bank/MFS
  // verification anywhere in this app, so this manual attestation is the
  // only actual confirmation step that a payment was received.
  if (body.payment_verified !== true) {
    throw new HttpError(400, 'You must confirm you have verified the payment reference code before approving.')
  }

  const temporaryPassword = generateTempPassword()
  const now = new Date()
  const firstPaymentConfirmedAt = now.toISOString()
  const subscriptionEndDate = addBillingPeriod(now.toISOString().slice(0, 10), request.billing_cycle)
  const orgReferralCode = await generateUniqueOrgReferralCode()

  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .insert({
      name: request.organization_name,
      created_by: user.id,
      status: 'active',
      org_referral_code: orgReferralCode,
      referred_by_organization_id: request.referred_by_organization_id,
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

  // First billing_history record — final_price_bdt is already the correct
  // amount due for this request's own billing_cycle (see createSignupRequest),
  // so it's used directly rather than re-deriving per cycle here. The
  // fallback only matters for rows that somehow predate that field being set.
  const firstPaymentAmount =
    request.final_price_bdt ?? (request.billing_cycle === 'annual' ? request.annual_total_usd : request.monthly_price_usd)
  await supabase.from('billing_history').insert({
    organization_id: org.id,
    amount_usd: firstPaymentAmount,
    paid_at: firstPaymentConfirmedAt.slice(0, 10),
    recorded_by: user.id,
    payment_method,
    payment_reference_code: request.payment_reference_code,
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

  // Business Referral Program reward — only for a genuinely confirmed first
  // payment (not 'pending'/'waived', which isn't actually money received).
  if (request.referred_by_organization_id && finalPaymentStatus === 'received') {
    await maybeGrantOrgReferralReward({
      referredOrgId: org.id,
      referredOrgName: request.organization_name,
      referringOrgId: request.referred_by_organization_id,
      newAdminEmail: request.email,
      user,
      event,
    })
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
  requireSuperAdminOrStaff(user)
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
  requireSuperAdminOrStaff(user)
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
    .select('organization_name, status, final_price_bdt, billing_cycle, payment_method, payment_reference_code')
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
 * payment_token (never id). Body: { payment_account_id }. This is what
 * performs the awaiting_payment -> pending transition — only now does the
 * request become a genuine reviewable application (visible in the Super
 * Admin's Pending tab, counted as an "Application Submitted"), which is why
 * the new-signup-request notification/audit log fire here instead of at
 * initial submission. Only valid from "awaiting_payment" — never on a
 * request already pending/approved/rejected, so this can never re-fire the
 * notification or tamper with an already-progressed request's record. Never
 * marks the request as paid/approved itself; that still requires the Super
 * Admin's manual review. */
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
  if (request.status !== 'awaiting_payment') {
    throw new HttpError(400, 'This request is no longer awaiting payment confirmation.')
  }

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
    .update({ payment_method, status: 'pending' })
    .eq('id', request.id)
    .select('payment_method, status')
    .single()
  if (error) throw new HttpError(500, error.message)

  await notifySuperAdmins({
    type: 'signup_request',
    title: 'New signup request',
    message: `${request.organization_name} (${request.contact_name}) requested access.`,
    link_route: '/signup-requests',
    related_entity_id: request.id,
    related_entity_type: 'signup_request',
  })

  await insertAuditLog({
    eventType: 'signup_request_submitted',
    metadata: { organization_name: request.organization_name, contact_name: request.contact_name, email: request.email },
    ipAddress: ip,
  })

  return json(200, data)
}
