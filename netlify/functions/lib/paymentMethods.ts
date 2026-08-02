export const PAYMENT_METHODS = ['bkash', 'nagad', 'rocket', 'bank_transfer', 'payoneer', 'crypto', 'other'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]
