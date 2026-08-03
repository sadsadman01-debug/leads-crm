export type RenewalPaymentStatus = 'pending' | 'confirmed'

export interface RenewalPaymentRequest {
  id: string
  organization_id: string
  /** Short, human-typable code the payer includes as a reference/note when
   * sending money — brand new for every renewal instance, never reused. */
  payment_reference_code: string
  /** Non-guessable token used ONLY for the public /pay link. */
  payment_token: string
  amount_bdt: number
  extends_subscription_by: '1 month' | '1 year'
  status: RenewalPaymentStatus
  requested_at: string
  confirmed_at: string | null
  confirmed_by: string | null
}

export interface RenewalPaymentWithOrg extends RenewalPaymentRequest {
  organization_name: string
}

export interface PublicRenewalPayment {
  status: RenewalPaymentStatus
  amount_bdt: number
  payment_reference_code: string
  organization_name: string | null
}
