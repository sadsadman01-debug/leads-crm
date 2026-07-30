import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import { getAffiliateForUser } from './affiliates.js'
import type { AuthedUser } from '../lib/auth.js'

const COLUMNS = 'id, affiliate_id, method_type, label, details, is_default, created_at'

const MFS_PROVIDERS = ['bKash', 'Nagad', 'Rocket', 'Upay', 'Other']
const CRYPTO_NETWORKS = ['USDT (TRC20)', 'USDT (ERC20)', 'USDT (BEP20)', 'Bitcoin (BTC)', 'Ethereum (ETH)', 'Other']

/** Exactly the fields specified per method type — nothing extra, nothing
 * omitted. Throws with a specific message on the first missing/invalid field. */
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

export async function listMyPayoutMethods(user: AuthedUser) {
  const affiliate = await getAffiliateForUser(user)
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('payout_methods')
    .select(COLUMNS)
    .eq('affiliate_id', affiliate.id)
    .order('created_at', { ascending: true })
  if (error) throw new HttpError(500, error.message)
  return json(200, { methods: data ?? [] })
}

/** Body: { method_type, label, details, is_default? } */
export async function createPayoutMethod(event: HandlerEvent, user: AuthedUser) {
  const affiliate = await getAffiliateForUser(user)
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')

  const label = (body.label ?? '').trim()
  if (!label) throw new HttpError(400, 'Label is required')
  if (!['mfs', 'bank_account', 'crypto'].includes(body.method_type)) throw new HttpError(400, 'Invalid method_type')
  const details = validateDetails(body.method_type, body.details ?? {})

  if (body.is_default) {
    await supabase.from('payout_methods').update({ is_default: false }).eq('affiliate_id', affiliate.id)
  }

  const { data, error } = await supabase
    .from('payout_methods')
    .insert({ affiliate_id: affiliate.id, method_type: body.method_type, label, details, is_default: Boolean(body.is_default) })
    .select(COLUMNS)
    .single()
  if (error) throw new HttpError(500, error.message)
  return json(201, data)
}

async function getOwnMethodOrThrow(id: string, affiliateId: string) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('payout_methods').select(COLUMNS).eq('id', id).maybeSingle()
  if (error) throw new HttpError(500, error.message)
  if (!data || data.affiliate_id !== affiliateId) throw new HttpError(404, 'Payout method not found')
  return data
}

export async function updatePayoutMethod(id: string, event: HandlerEvent, user: AuthedUser) {
  const affiliate = await getAffiliateForUser(user)
  const existing = await getOwnMethodOrThrow(id, affiliate.id)
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')

  const update: Record<string, any> = {}
  if ('label' in body) {
    const label = (body.label ?? '').trim()
    if (!label) throw new HttpError(400, 'Label cannot be empty')
    update.label = label
  }
  if ('details' in body) {
    update.details = validateDetails(existing.method_type, body.details ?? {})
  }
  if ('is_default' in body && body.is_default) {
    await supabase.from('payout_methods').update({ is_default: false }).eq('affiliate_id', affiliate.id)
    update.is_default = true
  } else if ('is_default' in body) {
    update.is_default = false
  }
  if (Object.keys(update).length === 0) throw new HttpError(400, 'Nothing to update')

  const { data, error } = await supabase.from('payout_methods').update(update).eq('id', id).select(COLUMNS).single()
  if (error) throw new HttpError(500, error.message)
  return json(200, data)
}

export async function deletePayoutMethod(id: string, user: AuthedUser) {
  const affiliate = await getAffiliateForUser(user)
  await getOwnMethodOrThrow(id, affiliate.id)
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('payout_methods').delete().eq('id', id)
  if (error) throw new HttpError(500, error.message)
  return json(200, { success: true })
}
