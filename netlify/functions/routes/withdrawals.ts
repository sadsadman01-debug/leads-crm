import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import { requireSuperAdmin, requireAal2IfEnrolled } from '../lib/permissions.js'
import { getAffiliateForUser } from './affiliates.js'
import { getAffiliateBalances } from '../lib/affiliateBalances.js'
import { getOrCreateAffiliateSettingsRow } from '../lib/affiliateSettings.js'
import { logAuditEvent } from '../lib/auditLog.js'
import type { AuthedUser } from '../lib/auth.js'

const REQUEST_COLUMNS =
  'id, affiliate_id, amount_usd, payout_method_id, status, requested_at, reviewed_at, reviewed_by, rejection_reason, actual_amount_sent_usd, notes'

/** Body: { amount_usd, payout_method_id }. The actual balance check happens
 * atomically inside the request_affiliate_withdrawal Postgres function
 * (row-locked on the affiliate) — this is the only race-safe way to prevent
 * two rapid submissions both passing against a stale balance. */
export async function createWithdrawal(event: HandlerEvent, user: AuthedUser) {
  const affiliate = await getAffiliateForUser(user)
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')

  const amount = Number(body.amount_usd)
  if (!Number.isFinite(amount) || amount <= 0) throw new HttpError(400, 'amount_usd must be a positive number')
  if (!body.payout_method_id) throw new HttpError(400, 'payout_method_id is required')

  const { data: method, error: methodErr } = await supabase
    .from('payout_methods')
    .select('id, affiliate_id')
    .eq('id', body.payout_method_id)
    .maybeSingle()
  if (methodErr) throw new HttpError(500, methodErr.message)
  if (!method || method.affiliate_id !== affiliate.id) throw new HttpError(404, 'Payout method not found')

  const settings = await getOrCreateAffiliateSettingsRow()
  if (settings.affiliate_min_withdrawal_usd && amount < Number(settings.affiliate_min_withdrawal_usd)) {
    throw new HttpError(400, `Minimum withdrawal amount is $${settings.affiliate_min_withdrawal_usd}`)
  }

  const { data, error } = await supabase.rpc('request_affiliate_withdrawal', {
    p_affiliate_id: affiliate.id,
    p_amount_usd: amount,
    p_payout_method_id: body.payout_method_id,
  })
  if (error) throw new HttpError(400, error.message)

  await logAuditEvent('withdrawal_requested', user, event, {
    metadata: { affiliateId: affiliate.id, affiliateName: affiliate.full_name, amountUsd: amount, payoutMethodId: body.payout_method_id },
  })

  return json(201, data)
}

export async function listMyWithdrawals(user: AuthedUser) {
  const affiliate = await getAffiliateForUser(user)
  const supabase = getSupabaseAdmin()
  const { data: rows, error } = await supabase
    .from('withdrawal_requests')
    .select(REQUEST_COLUMNS)
    .eq('affiliate_id', affiliate.id)
    .order('requested_at', { ascending: false })
  if (error) throw new HttpError(500, error.message)

  const methodIds = [...new Set((rows ?? []).map((r) => r.payout_method_id))]
  const { data: methods } =
    methodIds.length > 0 ? await supabase.from('payout_methods').select('id, method_type, label').in('id', methodIds) : { data: [] as any[] }
  const methodById = new Map((methods ?? []).map((m: any) => [m.id, m]))

  return json(200, {
    withdrawals: (rows ?? []).map((r) => ({ ...r, payout_method: methodById.get(r.payout_method_id) ?? null })),
  })
}

/** Super Admin only — every affiliate's requests, optionally filtered by status. */
export async function listWithdrawalRequests(event: HandlerEvent, user: AuthedUser) {
  requireSuperAdmin(user)
  const supabase = getSupabaseAdmin()
  const status = event.queryStringParameters?.status

  let query = supabase.from('withdrawal_requests').select(REQUEST_COLUMNS).order('requested_at', { ascending: false })
  if (status && status !== 'all') query = query.eq('status', status)
  const { data: rows, error } = await query
  if (error) throw new HttpError(500, error.message)

  const affiliateIds = [...new Set((rows ?? []).map((r) => r.affiliate_id))]
  const methodIds = [...new Set((rows ?? []).map((r) => r.payout_method_id))]
  const [{ data: affiliates }, { data: methods }] = await Promise.all([
    affiliateIds.length > 0
      ? supabase.from('affiliates').select('id, full_name, email, referral_code').in('id', affiliateIds)
      : Promise.resolve({ data: [] as any[] }),
    methodIds.length > 0 ? supabase.from('payout_methods').select('id, method_type, label').in('id', methodIds) : Promise.resolve({ data: [] as any[] }),
  ])
  const affiliateById = new Map((affiliates ?? []).map((a: any) => [a.id, a]))
  const methodById = new Map((methods ?? []).map((m: any) => [m.id, m]))

  return json(200, {
    withdrawals: (rows ?? []).map((r) => ({
      ...r,
      affiliate: affiliateById.get(r.affiliate_id) ?? null,
      payout_method: methodById.get(r.payout_method_id) ?? null,
    })),
  })
}

/** Super Admin only — full detail: complete UNMASKED payout method (the real
 * info needed to actually send money), plus the per-request status-change log. */
export async function getWithdrawalDetail(id: string, user: AuthedUser) {
  requireSuperAdmin(user)
  const supabase = getSupabaseAdmin()
  const { data: request, error } = await supabase.from('withdrawal_requests').select(REQUEST_COLUMNS).eq('id', id).maybeSingle()
  if (error) throw new HttpError(500, error.message)
  if (!request) throw new HttpError(404, 'Withdrawal request not found')

  const [{ data: affiliate }, { data: method }, { data: statusLog }] = await Promise.all([
    supabase.from('affiliates').select('id, full_name, email, referral_code').eq('id', request.affiliate_id).maybeSingle(),
    supabase.from('payout_methods').select('id, method_type, label, details').eq('id', request.payout_method_id).maybeSingle(),
    supabase.from('withdrawal_status_log').select('id, from_status, to_status, changed_by, changed_at, note').eq('withdrawal_request_id', id).order('changed_at', { ascending: true }),
  ])

  const changerIds = [...new Set((statusLog ?? []).map((s) => s.changed_by).filter(Boolean))] as string[]
  const { data: changers } =
    changerIds.length > 0 ? await supabase.from('profiles').select('id, nickname, email').in('id', changerIds) : { data: [] as any[] }
  const changerById = new Map((changers ?? []).map((c: any) => [c.id, c]))

  return json(200, {
    request,
    affiliate,
    payout_method: method,
    status_log: (statusLog ?? []).map((s) => ({
      ...s,
      changed_by_name: s.changed_by ? changerById.get(s.changed_by)?.nickname || changerById.get(s.changed_by)?.email || null : null,
    })),
  })
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ['processing', 'approved', 'rejected'],
  processing: ['approved', 'rejected'],
  approved: [],
  rejected: [],
}

/** Body: { status, actual_amount_sent_usd?, notes?, rejection_reason? }.
 * Rejecting needs no special "release the reserved amount" step — the
 * balance formula only counts pending/processing toward Pending Withdrawal,
 * so a rejected request simply stops counting the moment its status changes. */
export async function updateWithdrawalStatus(id: string, event: HandlerEvent, user: AuthedUser) {
  requireSuperAdmin(user)
  await requireAal2IfEnrolled(user)
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')

  const { data: request, error: fetchErr } = await supabase.from('withdrawal_requests').select(REQUEST_COLUMNS).eq('id', id).maybeSingle()
  if (fetchErr) throw new HttpError(500, fetchErr.message)
  if (!request) throw new HttpError(404, 'Withdrawal request not found')

  const nextStatus = body.status
  if (!VALID_TRANSITIONS[request.status]?.includes(nextStatus)) {
    throw new HttpError(400, `Cannot move a ${request.status} request to ${nextStatus}`)
  }

  const update: Record<string, any> = { status: nextStatus, reviewed_at: new Date().toISOString(), reviewed_by: user.id }
  if (nextStatus === 'approved') {
    update.actual_amount_sent_usd = body.actual_amount_sent_usd != null ? Number(body.actual_amount_sent_usd) : request.amount_usd
    update.notes = (body.notes ?? '').trim() || null
  } else if (nextStatus === 'rejected') {
    update.rejection_reason = (body.rejection_reason ?? '').trim() || null
  }

  const { data: updated, error } = await supabase.from('withdrawal_requests').update(update).eq('id', id).select(REQUEST_COLUMNS).single()
  if (error) throw new HttpError(500, error.message)

  await supabase.from('withdrawal_status_log').insert({
    withdrawal_request_id: id,
    from_status: request.status,
    to_status: nextStatus,
    changed_by: user.id,
    note: nextStatus === 'rejected' ? update.rejection_reason : nextStatus === 'approved' ? update.notes : null,
  })

  await logAuditEvent('withdrawal_status_changed', user, event, {
    metadata: { withdrawalRequestId: id, affiliateId: request.affiliate_id, from: request.status, to: nextStatus },
  })

  return json(200, updated)
}
