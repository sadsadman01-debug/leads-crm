import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import { requireSuperAdmin } from '../lib/permissions.js'
import { logAuditEvent } from '../lib/auditLog.js'
import type { AuthedUser } from '../lib/auth.js'

const COLUMNS = 'id, code, discount_type, discount_value, is_active, times_used, created_at, created_by'

function validateDiscount(discountType: string, discountValue: any): { discount_type: 'flat' | 'percent'; discount_value: number } {
  if (!['flat', 'percent'].includes(discountType)) throw new HttpError(400, "discount_type must be 'flat' or 'percent'")
  const value = Number(discountValue)
  if (!Number.isFinite(value) || value <= 0) throw new HttpError(400, 'discount_value must be a positive number')
  if (discountType === 'percent' && value > 100) throw new HttpError(400, 'A percentage discount cannot exceed 100')
  return { discount_type: discountType as 'flat' | 'percent', discount_value: value }
}

export async function listPromoCodes(user: AuthedUser) {
  requireSuperAdmin(user)
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('promo_codes').select(COLUMNS).order('created_at', { ascending: false })
  if (error) throw new HttpError(500, error.message)
  return json(200, { promo_codes: data ?? [] })
}

/** Body: { code, discount_type, discount_value }. Codes are always stored
 * uppercase so lookups (here and at signup) are naturally case-insensitive. */
export async function createPromoCode(event: HandlerEvent, user: AuthedUser) {
  requireSuperAdmin(user)
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')

  const code = (body.code ?? '').trim().toUpperCase()
  if (!code) throw new HttpError(400, 'code is required')
  const { discount_type, discount_value } = validateDiscount(body.discount_type, body.discount_value)

  const { data, error } = await supabase
    .from('promo_codes')
    .insert({ code, discount_type, discount_value, created_by: user.id })
    .select(COLUMNS)
    .single()

  if (error) {
    if ((error as any).code === '23505') throw new HttpError(400, `A promo code "${code}" already exists`)
    throw new HttpError(500, error.message)
  }

  await logAuditEvent('promo_code_created', user, event, { metadata: { code, discount_type, discount_value } })
  return json(201, data)
}

/** Body: { discount_type?, discount_value?, is_active? } — the same endpoint
 * backs both the "edit discount" form and the Active/Inactive row toggle. */
export async function updatePromoCode(id: string, event: HandlerEvent, user: AuthedUser) {
  requireSuperAdmin(user)
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')

  const { data: existing, error: fetchErr } = await supabase.from('promo_codes').select('discount_type, discount_value').eq('id', id).maybeSingle()
  if (fetchErr) throw new HttpError(500, fetchErr.message)
  if (!existing) throw new HttpError(404, 'Promo code not found')

  const update: Record<string, any> = {}
  if ('discount_type' in body || 'discount_value' in body) {
    const { discount_type, discount_value } = validateDiscount(
      body.discount_type ?? existing.discount_type,
      body.discount_value ?? existing.discount_value
    )
    update.discount_type = discount_type
    update.discount_value = discount_value
  }
  if ('is_active' in body) update.is_active = Boolean(body.is_active)

  if (Object.keys(update).length === 0) throw new HttpError(400, 'Nothing to update')

  const { data, error } = await supabase.from('promo_codes').update(update).eq('id', id).select(COLUMNS).single()
  if (error) throw new HttpError(500, error.message)

  await logAuditEvent('promo_code_updated', user, event, { metadata: { promoCodeId: id, ...update } })
  return json(200, data)
}

/** Never blocked by prior usage — deleting only stops FUTURE use.
 * signup_requests.promo_code_id / organizations.promo_code_id are
 * ON DELETE SET NULL, and promo_code_text preserves what was actually
 * applied historically, so already-locked-in discounts are unaffected. */
export async function deletePromoCode(id: string, event: HandlerEvent, user: AuthedUser) {
  requireSuperAdmin(user)
  const supabase = getSupabaseAdmin()

  const { data: existing, error: fetchErr } = await supabase.from('promo_codes').select('code').eq('id', id).maybeSingle()
  if (fetchErr) throw new HttpError(500, fetchErr.message)
  if (!existing) throw new HttpError(404, 'Promo code not found')

  const { error } = await supabase.from('promo_codes').delete().eq('id', id)
  if (error) throw new HttpError(500, error.message)

  await logAuditEvent('promo_code_deleted', user, event, { metadata: { promoCodeId: id, code: existing.code } })
  return json(200, { success: true })
}

/** Public — reachable from the Request Access form's "Apply" button before
 * any session exists. Body: { code }. Never trust the discount numbers this
 * returns for the final submission — createSignupRequest re-validates and
 * recomputes the discount server-side independently. */
export async function validatePromoCode(event: HandlerEvent) {
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')
  const code = (body.code ?? '').trim().toUpperCase()
  if (!code) throw new HttpError(400, 'code is required')

  const { data, error } = await supabase
    .from('promo_codes')
    .select('id, code, discount_type, discount_value, is_active')
    .eq('code', code)
    .maybeSingle()
  if (error) throw new HttpError(500, error.message)
  if (!data || !data.is_active) throw new HttpError(400, 'This promo code is invalid or no longer active')

  return json(200, { id: data.id, code: data.code, discount_type: data.discount_type, discount_value: data.discount_value })
}
