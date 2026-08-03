import type { HandlerEvent } from '@netlify/functions'
import crypto from 'crypto'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import { requireSuperAdmin, requireAal2IfEnrolled, resolveOrganizationId } from '../lib/permissions.js'
import { logAuditEvent } from '../lib/auditLog.js'
import { addBillingPeriod, type BillingCycle } from '../lib/billingSettings.js'
import { generateUniquePaymentReferenceCode } from '../lib/paymentReferenceCode.js'
import type { AuthedUser } from '../lib/auth.js'

const COLUMNS = 'id, organization_id, payment_reference_code, payment_token, amount_bdt, extends_subscription_by, status, requested_at, confirmed_at, confirmed_by'

/** Any authenticated Admin/User of the organization — creates a brand new
 * renewal payment instance (its own reference code + payment_token, never
 * reused across renewals, even repeat ones for the same Organization) and
 * hands back the payment_token so the caller can be sent straight to the
 * Payment Instructions page for it. */
export async function createRenewalPaymentRequest(event: HandlerEvent, user: AuthedUser) {
  const supabase = getSupabaseAdmin()
  const orgId = resolveOrganizationId(user, event)
  if (!orgId) throw new HttpError(400, 'This account is not linked to an organization')

  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('id, name, monthly_price_usd, annual_total_usd, billing_cycle')
    .eq('id', orgId)
    .maybeSingle()
  if (orgErr) throw new HttpError(500, orgErr.message)
  if (!org) throw new HttpError(404, 'Organization not found')

  const billingCycle = org.billing_cycle as BillingCycle
  const amount_bdt = billingCycle === 'annual' ? org.annual_total_usd : org.monthly_price_usd
  const extends_subscription_by = billingCycle === 'annual' ? '1 year' : '1 month'
  const payment_reference_code = await generateUniquePaymentReferenceCode('renewal_payment_requests')

  const { data, error } = await supabase
    .from('renewal_payment_requests')
    .insert({
      organization_id: orgId,
      payment_reference_code,
      // Same URL-security reasoning as signup_requests.payment_token — a
      // long, unguessable, application-generated value distinct from the
      // short human-typable reference code above.
      payment_token: crypto.randomUUID(),
      amount_bdt,
      extends_subscription_by,
    })
    .select(COLUMNS)
    .single()
  if (error) throw new HttpError(500, error.message)

  await logAuditEvent('renewal_payment_requested', user, event, {
    organizationId: orgId,
    metadata: { organizationName: org.name, amountBdt: amount_bdt, referenceCode: payment_reference_code },
  })

  return json(201, data)
}

/** Any authenticated Admin/User — their own organization's current pending
 * renewal (if any), so its reference code stays visible on the Billing
 * settings page in case they need it again before completing payment. */
export async function getMyPendingRenewal(event: HandlerEvent, user: AuthedUser) {
  const supabase = getSupabaseAdmin()
  const orgId = resolveOrganizationId(user, event)
  if (!orgId) return json(200, { renewal: null })

  const { data, error } = await supabase
    .from('renewal_payment_requests')
    .select(COLUMNS)
    .eq('organization_id', orgId)
    .eq('status', 'pending')
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new HttpError(500, error.message)
  return json(200, { renewal: data ?? null })
}

/** Public — reachable from the /pay page before any session exists, looked
 * up by payment_token (never id), mirroring getPublicSignupRequestForPayment
 * exactly for the renewal case. */
export async function getPublicRenewalForPayment(token: string) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('renewal_payment_requests')
    .select('status, amount_bdt, payment_reference_code, organization_id')
    .eq('payment_token', token)
    .maybeSingle()
  if (error) throw new HttpError(500, error.message)
  if (!data) throw new HttpError(404, 'Renewal payment request not found')

  const { data: org } = await supabase.from('organizations').select('name').eq('id', data.organization_id).maybeSingle()

  return json(200, {
    status: data.status,
    amount_bdt: data.amount_bdt,
    payment_reference_code: data.payment_reference_code,
    organization_name: org?.name ?? null,
  })
}

/** Super Admin only — every pending renewal, most recently requested first,
 * with the referring Organization's name resolved for display. */
export async function listPendingRenewalPayments(user: AuthedUser) {
  requireSuperAdmin(user)
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('renewal_payment_requests')
    .select(COLUMNS)
    .eq('status', 'pending')
    .order('requested_at', { ascending: false })
  if (error) throw new HttpError(500, error.message)

  const orgIds = [...new Set((data ?? []).map((r) => r.organization_id))]
  const { data: orgs } = orgIds.length > 0 ? await supabase.from('organizations').select('id, name').in('id', orgIds) : { data: [] as any[] }
  const nameById = new Map((orgs ?? []).map((o: any) => [o.id, o.name]))

  return json(200, {
    renewals: (data ?? []).map((r) => ({ ...r, organization_name: nameById.get(r.organization_id) ?? 'Unknown Organization' })),
  })
}

/** Body: { payment_verified: true } — the same manual-attestation pattern as
 * signup approval: the Super Admin has checked their own bKash/bank
 * statement for a transaction containing this exact reference code before
 * ticking this. Extends subscription_end_date by exactly one billing period
 * (reusing addBillingPeriod, the same helper recordPayment uses) and logs a
 * billing_history entry carrying the reference code forward for traceability. */
export async function confirmRenewalPayment(id: string, event: HandlerEvent, user: AuthedUser) {
  requireSuperAdmin(user)
  await requireAal2IfEnrolled(user)
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')
  if (body.payment_verified !== true) {
    throw new HttpError(400, 'You must confirm you have verified the payment reference code before confirming.')
  }

  const { data: renewal, error: fetchErr } = await supabase.from('renewal_payment_requests').select(COLUMNS).eq('id', id).maybeSingle()
  if (fetchErr) throw new HttpError(500, fetchErr.message)
  if (!renewal) throw new HttpError(404, 'Renewal payment request not found')
  if (renewal.status !== 'pending') throw new HttpError(400, 'This renewal has already been confirmed')

  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('id, name, billing_cycle, subscription_end_date, payment_status')
    .eq('id', renewal.organization_id)
    .maybeSingle()
  if (orgErr) throw new HttpError(500, orgErr.message)
  if (!org) throw new HttpError(404, 'Organization not found')

  const baseDate = org.subscription_end_date && new Date(org.subscription_end_date) > new Date() ? org.subscription_end_date : new Date().toISOString().slice(0, 10)
  const newSubscriptionEndDate = addBillingPeriod(baseDate, org.billing_cycle as BillingCycle)
  const paidAt = new Date().toISOString().slice(0, 10)

  const update: Record<string, any> = { subscription_end_date: newSubscriptionEndDate }
  if (org.payment_status !== 'received') update.payment_status = 'received'
  const { error: updateOrgErr } = await supabase.from('organizations').update(update).eq('id', org.id)
  if (updateOrgErr) throw new HttpError(500, updateOrgErr.message)

  await supabase.from('billing_history').insert({
    organization_id: org.id,
    amount_usd: renewal.amount_bdt,
    paid_at: paidAt,
    recorded_by: user.id,
    notes: `Renewal payment (reference ${renewal.payment_reference_code})`,
    payment_reference_code: renewal.payment_reference_code,
  })

  const { data: updated, error: updateErr } = await supabase
    .from('renewal_payment_requests')
    .update({ status: 'confirmed', confirmed_at: new Date().toISOString(), confirmed_by: user.id })
    .eq('id', id)
    .select(COLUMNS)
    .single()
  if (updateErr) throw new HttpError(500, updateErr.message)

  await logAuditEvent('renewal_payment_confirmed', user, event, {
    organizationId: org.id,
    metadata: {
      organizationName: org.name,
      referenceCode: renewal.payment_reference_code,
      amountBdt: renewal.amount_bdt,
      newSubscriptionEndDate,
    },
  })

  return json(200, updated)
}
