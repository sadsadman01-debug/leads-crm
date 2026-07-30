import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import { requireSuperAdmin, requireAal2IfEnrolled } from '../lib/permissions.js'
import { generateTempPassword } from '../lib/passwordGen.js'
import { notifySuperAdmins } from '../lib/notifications.js'
import { insertAuditLog, logAuditEvent, getClientIp } from '../lib/auditLog.js'
import { getOrCreateBillingSettingsRow, computeCurrentPricingTier, computeAnnualTotal, addBillingPeriod } from '../lib/billingSettings.js'
import type { AuthedUser } from '../lib/auth.js'

const COLUMNS =
  'id, organization_name, contact_name, email, phone, message, status, requested_at, reviewed_at, reviewed_by, rejection_reason, pricing_tier, monthly_price_usd, payment_status, billing_cycle, annual_total_usd, referred_by_affiliate_id'

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

  if (!organization_name) throw new HttpError(400, 'Organization name is required')
  if (!contact_name) throw new HttpError(400, 'Contact name is required')
  if (!email) throw new HttpError(400, 'Email is required')
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Enter a valid email address')

  // Locked in NOW, not at approval time, so a review delay never changes the
  // price a requester was shown when they submitted.
  const billingSettings = await getOrCreateBillingSettingsRow()
  const { pricing_tier, monthly_price_usd } = await computeCurrentPricingTier(billingSettings)
  const billing_cycle = body.billing_cycle === 'annual' ? 'annual' : 'monthly'
  const annual_total_usd = billing_cycle === 'annual' ? computeAnnualTotal(monthly_price_usd) : null

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
      status: 'pending',
      pricing_tier,
      monthly_price_usd,
      billing_cycle,
      annual_total_usd,
      referred_by_affiliate_id,
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
      pricing_tier: request.pricing_tier,
      monthly_price_usd: request.monthly_price_usd,
      billing_cycle: request.billing_cycle,
      annual_total_usd: request.annual_total_usd,
      payment_status: finalPaymentStatus,
      first_payment_confirmed_at: firstPaymentConfirmedAt,
      subscription_end_date: subscriptionEndDate,
      referred_by_affiliate_id: request.referred_by_affiliate_id,
    })
    .select('id, name, pricing_tier, monthly_price_usd, billing_cycle, annual_total_usd, payment_status, subscription_end_date, referred_by_affiliate_id')
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
