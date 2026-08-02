export type PromoCodeDiscountType = 'flat' | 'percent'

export interface PromoCode {
  id: string
  code: string
  discount_type: PromoCodeDiscountType
  discount_value: number
  is_active: boolean
  times_used: number
  created_at: string
  created_by: string | null
}

export function formatPromoDiscount(discountType: PromoCodeDiscountType, discountValue: number): string {
  return discountType === 'percent' ? `${discountValue}% off` : `৳${discountValue} off`
}
