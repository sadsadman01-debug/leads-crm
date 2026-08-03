import type { PayoutMethodType, MfsDetails, BankAccountDetails, CryptoDetails } from './affiliate'

// Same three method types Affiliate Payout Methods already use — this is the
// reverse direction (receiving customer payments IN, not paying affiliates
// OUT), but the "multiple method types with method-specific fields" shape is
// identical, so the type is reused rather than redefined.
export type PaymentAccountMethodType = PayoutMethodType

export interface ReceivingPaymentAccount {
  id: string
  method_type: PaymentAccountMethodType
  label: string
  details: Record<string, any>
  is_active: boolean
  display_order: number
  created_at: string
}

/** What the public /pay page gets — no is_active/display_order/created_at,
 * since only currently-active accounts are ever returned to it at all. */
export interface PublicPaymentAccount {
  id: string
  method_type: PaymentAccountMethodType
  label: string
  details: Record<string, any>
}

export type { MfsDetails, BankAccountDetails, CryptoDetails }
