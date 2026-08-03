export type PromoCodeDiscountType = 'flat' | 'percent'

export interface PromoCode {
  id: string
  code: string
  discount_type: PromoCodeDiscountType
  discount_value: number
  is_active: boolean
  times_used: number
  max_uses: number | null
  expires_at: string | null
  created_at: string
  created_by: string | null
}

export function formatPromoDiscount(discountType: PromoCodeDiscountType, discountValue: number): string {
  return discountType === 'percent' ? `${discountValue}% off` : `৳${discountValue} off`
}

/** Automatic exhaustion — distinct from the manually-controlled Active/Inactive
 * toggle, so the Super Admin can see at a glance why a code stopped working
 * even though they never flipped it off. */
export type PromoCodeAutoStatus = 'limit_reached' | 'expired' | null

export function getPromoCodeAutoStatus(promo: Pick<PromoCode, 'times_used' | 'max_uses' | 'expires_at'>): PromoCodeAutoStatus {
  if (promo.max_uses != null && promo.times_used >= promo.max_uses) return 'limit_reached'
  if (promo.expires_at != null && new Date() > new Date(promo.expires_at)) return 'expired'
  return null
}
