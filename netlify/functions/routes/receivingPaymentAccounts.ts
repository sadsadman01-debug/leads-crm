import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import { requireSuperAdmin } from '../lib/permissions.js'
import type { AuthedUser } from '../lib/auth.js'

/** Accounts the Super Admin personally receives customer payments into — the
 * reverse direction of payout_methods (which pays Affiliates OUT). Same
 * method-type/details shape, reused deliberately: it's the identical
 * "multiple payment method types with method-specific fields" concept. */

const COLUMNS = 'id, method_type, label, details, is_active, display_order, created_at'

const MFS_PROVIDERS = ['bKash', 'Nagad', 'Rocket', 'Upay', 'Other']
const CRYPTO_NETWORKS = ['USDT (TRC20)', 'USDT (ERC20)', 'USDT (BEP20)', 'Bitcoin (BTC)', 'Ethereum (ETH)', 'Other']

/** Exactly the fields specified per method type — mirrors payoutMethods.ts's
 * own validateDetails exactly, since the shape is identical by design. */
function validateDetails(methodType: string, details: any): Record<string, any> {
  if (methodType === 'mfs') {
    const provider = (details.provider ?? '').trim()
    const account_number = (details.account_number ?? '').trim()
    const account_holder_name = (details.account_holder_name ?? '').trim() || null
    if (!MFS_PROVIDERS.includes(provider)) throw new HttpError(400, 'A valid MFS provider is required')
    if (!account_number) throw new HttpError(400, 'Account/Phone Number is required')
    return { provider, account_number, account_holder_name }
  }

  if (methodType === 'bank_account') {
    const account_holder_name = (details.account_holder_name ?? '').trim()
    const bank_name = (details.bank_name ?? '').trim()
    const branch_name = (details.branch_name ?? '').trim()
    const account_number = (details.account_number ?? '').trim()
    const routing_number = (details.routing_number ?? '').trim()
    if (!account_holder_name) throw new HttpError(400, 'Account Holder Name is required')
    if (!bank_name) throw new HttpError(400, 'Bank Name is required')
    if (!branch_name) throw new HttpError(400, 'Branch Name is required')
    if (!account_number || account_number.length > 17 || !/^\d+$/.test(account_number)) {
      throw new HttpError(400, 'Account Number must be numeric, up to 17 digits')
    }
    if (!/^\d{9}$/.test(routing_number)) throw new HttpError(400, 'Routing Number must be exactly 9 digits')
    return { account_holder_name, bank_name, branch_name, account_number, routing_number }
  }

  if (methodType === 'crypto') {
    const network = (details.network ?? '').trim()
    const wallet_address = (details.wallet_address ?? '').trim()
    if (!CRYPTO_NETWORKS.includes(network)) throw new HttpError(400, 'A valid Cryptocurrency/Network is required')
    if (wallet_address.length < 8 || wallet_address.length > 128) {
      throw new HttpError(400, 'Wallet Address looks too short or too long to be valid')
    }
    return { network, wallet_address }
  }

  throw new HttpError(400, 'Unknown method_type')
}

export async function listPaymentAccounts(user: AuthedUser) {
  requireSuperAdmin(user)
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('receiving_payment_accounts').select(COLUMNS).order('display_order', { ascending: true })
  if (error) throw new HttpError(500, error.message)
  return json(200, { accounts: data ?? [] })
}

/** Public — reachable from the /pay page before any session exists. Only
 * active accounts, in display order, since inactive ones simply shouldn't
 * appear to a payer at all. */
export async function getPublicPaymentAccounts() {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('receiving_payment_accounts')
    .select('id, method_type, label, details')
    .eq('is_active', true)
    .order('display_order', { ascending: true })
  if (error) throw new HttpError(500, error.message)
  return json(200, { accounts: data ?? [] })
}

/** Body: { method_type, label, details, is_active? } — new accounts are
 * appended after the current highest display_order. */
export async function createPaymentAccount(event: HandlerEvent, user: AuthedUser) {
  requireSuperAdmin(user)
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')

  const label = (body.label ?? '').trim()
  if (!label) throw new HttpError(400, 'Label is required')
  if (!['mfs', 'bank_account', 'crypto'].includes(body.method_type)) throw new HttpError(400, 'Invalid method_type')
  const details = validateDetails(body.method_type, body.details ?? {})

  const { data: last } = await supabase
    .from('receiving_payment_accounts')
    .select('display_order')
    .order('display_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const display_order = (last?.display_order ?? -1) + 1

  const { data, error } = await supabase
    .from('receiving_payment_accounts')
    .insert({ method_type: body.method_type, label, details, is_active: body.is_active !== false, display_order })
    .select(COLUMNS)
    .single()
  if (error) throw new HttpError(500, error.message)
  return json(201, data)
}

async function getAccountOrThrow(id: string) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('receiving_payment_accounts').select(COLUMNS).eq('id', id).maybeSingle()
  if (error) throw new HttpError(500, error.message)
  if (!data) throw new HttpError(404, 'Payment account not found')
  return data
}

/** Body: { label?, details?, is_active? } — the same endpoint backs the edit
 * form and the Active/Inactive toggle. */
export async function updatePaymentAccount(id: string, event: HandlerEvent, user: AuthedUser) {
  requireSuperAdmin(user)
  const existing = await getAccountOrThrow(id)
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')

  const update: Record<string, any> = {}
  if ('label' in body) {
    const label = (body.label ?? '').trim()
    if (!label) throw new HttpError(400, 'Label cannot be empty')
    update.label = label
  }
  if ('details' in body) update.details = validateDetails(existing.method_type, body.details ?? {})
  if ('is_active' in body) update.is_active = Boolean(body.is_active)
  if (Object.keys(update).length === 0) throw new HttpError(400, 'Nothing to update')

  const { data, error } = await supabase.from('receiving_payment_accounts').update(update).eq('id', id).select(COLUMNS).single()
  if (error) throw new HttpError(500, error.message)
  return json(200, data)
}

export async function deletePaymentAccount(id: string, user: AuthedUser) {
  requireSuperAdmin(user)
  await getAccountOrThrow(id)
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('receiving_payment_accounts').delete().eq('id', id)
  if (error) throw new HttpError(500, error.message)
  return json(200, { success: true })
}

/** Body: { orderedIds: string[] } — every account id, in the new desired
 * order. Two-pass update (push everything to a high, guaranteed-unique range
 * first) avoids any accidental collision mid-reassignment, same technique
 * used by deal-stage/pipeline-stage reordering. */
export async function reorderPaymentAccounts(event: HandlerEvent, user: AuthedUser) {
  requireSuperAdmin(user)
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')
  const orderedIds = body.orderedIds

  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    throw new HttpError(400, 'orderedIds must be a non-empty array')
  }

  const { count: ownedCount, error: ownedErr } = await supabase
    .from('receiving_payment_accounts')
    .select('id', { count: 'exact', head: true })
    .in('id', orderedIds)
  if (ownedErr) throw new HttpError(500, ownedErr.message)
  if (ownedCount !== orderedIds.length) throw new HttpError(400, 'One or more accounts were not found')

  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase.from('receiving_payment_accounts').update({ display_order: 10000 + i }).eq('id', orderedIds[i])
    if (error) throw new HttpError(500, error.message)
  }
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase.from('receiving_payment_accounts').update({ display_order: i }).eq('id', orderedIds[i])
    if (error) throw new HttpError(500, error.message)
  }

  return json(200, { success: true })
}
