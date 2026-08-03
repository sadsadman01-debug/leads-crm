export interface Refund {
  id: string
  organization_id: string
  billing_history_id: string | null
  amount_bdt: number
  refund_date: string
  reason: string | null
  recorded_by: string | null
  created_at: string
}

export interface OrganizationBillingHistoryPayment {
  id: string
  amount_usd: number
  paid_at: string
  payment_method: string | null
  notes: string | null
  payment_reference_code: string | null
}

export type OrganizationBillingTimelineEntry =
  | {
      type: 'payment'
      id: string
      date: string
      amount_bdt: number
      payment_method: string | null
      notes: string | null
      payment_reference_code: string | null
    }
  | {
      type: 'refund'
      id: string
      date: string
      amount_bdt: number
      billing_history_id: string | null
      reason: string | null
    }
  | {
      type: 'cancellation_request'
      id: string
      date: string
      reason: string
      additional_comments: string | null
      status: 'pending' | 'acknowledged'
      resolved_at: string | null
    }

export interface OrganizationBillingHistory {
  organization: { id: string; name: string; subscription_cancelled_at: string | null }
  payments: OrganizationBillingHistoryPayment[]
  timeline: OrganizationBillingTimelineEntry[]
}
