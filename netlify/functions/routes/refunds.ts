import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import { requireSuperAdmin, requireAal2IfEnrolled } from '../lib/permissions.js'
import { logAuditEvent } from '../lib/auditLog.js'
import type { AuthedUser } from '../lib/auth.js'

const COLUMNS = 'id, organization_id, billing_history_id, amount_bdt, refund_date, reason, recorded_by, created_at'

/** Body: { amount_bdt, refund_date, reason?, billing_history_id?, new_subscription_end_date? }
 * Logs a manually-processed refund (money already sent back outside the app)
 * for record-keeping and the Earnings Dashboard's Net Revenue figure.
 * `new_subscription_end_date`, if given, replaces the Organization's current
 * subscription_end_date — entirely optional and left to the Super Admin's
 * judgment; omitting it just logs the refund without touching access,
 * matching the app's manual-everything philosophy. */
export async function recordRefund(organizationId: string, event: HandlerEvent, user: AuthedUser) {
  requireSuperAdmin(user)
  await requireAal2IfEnrolled(user)
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')

  const amount_bdt = Number(body.amount_bdt)
  if (!Number.isFinite(amount_bdt) || amount_bdt <= 0) throw new HttpError(400, 'amount_bdt must be a positive number')
  const refund_date = body.refund_date || new Date().toISOString().slice(0, 10)
  const reason = (body.reason ?? '').trim() || null
  const billing_history_id = body.billing_history_id || null

  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('id, name, subscription_end_date')
    .eq('id', organizationId)
    .maybeSingle()
  if (orgErr) throw new HttpError(500, orgErr.message)
  if (!org) throw new HttpError(404, 'Organization not found')

  if (billing_history_id) {
    const { data: paymentRow, error: paymentErr } = await supabase
      .from('billing_history')
      .select('id')
      .eq('id', billing_history_id)
      .eq('organization_id', organizationId)
      .maybeSingle()
    if (paymentErr) throw new HttpError(500, paymentErr.message)
    if (!paymentRow) throw new HttpError(400, 'That payment does not belong to this organization')
  }

  const { data, error } = await supabase
    .from('refunds')
    .insert({ organization_id: organizationId, billing_history_id, amount_bdt, refund_date, reason, recorded_by: user.id })
    .select(COLUMNS)
    .single()
  if (error) throw new HttpError(500, error.message)

  let newSubscriptionEndDate: string | null = null
  if (body.new_subscription_end_date) {
    newSubscriptionEndDate = body.new_subscription_end_date
    const { error: updateErr } = await supabase
      .from('organizations')
      .update({ subscription_end_date: newSubscriptionEndDate })
      .eq('id', organizationId)
    if (updateErr) throw new HttpError(500, updateErr.message)
  }

  await logAuditEvent('refund_recorded', user, event, {
    organizationId,
    metadata: {
      organizationName: org.name,
      amountBdt: amount_bdt,
      refundDate: refund_date,
      billingHistoryId: billing_history_id,
      previousSubscriptionEndDate: org.subscription_end_date,
      newSubscriptionEndDate,
    },
  })

  return json(201, { ...data, subscription_end_date: newSubscriptionEndDate ?? org.subscription_end_date })
}
