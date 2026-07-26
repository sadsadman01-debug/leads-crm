export interface DealStage {
  id: string
  name: string
  position: number
  default_probability: number
  is_closed: boolean
  is_won: boolean
}

export interface WinLossReason {
  id: string
  label: string
}

export interface DealLeadRef {
  id: string
  company_name: string
  industry_id: string | null
}

export interface Deal {
  id: string
  lead_id: string
  name: string
  /** Null when the viewer lacks "Can view Deal monetary values" — see value_masked. */
  value: number | null
  value_masked?: boolean
  currency: string
  stage_id: string | null
  probability: number
  expected_close_date: string | null
  actual_close_date: string | null
  outcome_reason: string | null
  notes: string | null
  owner_id: string | null
  custom_fields: Record<string, any>
  created_at: string
  updated_at: string
  lead: DealLeadRef | null
}

export interface KanbanDeal {
  id: string
  name: string
  value: number | null
  value_masked?: boolean
  currency: string
  stage_id: string | null
  probability: number
  expected_close_date: string | null
  lead_id: string
  owner_id: string | null
  company_name: string
}

export interface DealListResponse {
  deals: Deal[]
  page: number
  pageSize: number
  total: number
}

export interface DealFilters {
  leadId?: string
  stageId?: string
  industryId?: string
  search?: string
  assignedTo?: string
}

export const CURRENCIES = [
  'USD', 'BDT', 'EUR', 'GBP', 'INR', 'AUD', 'CAD', 'AED', 'SGD',
  'JPY', 'CNY', 'CHF', 'NZD', 'ZAR', 'BRL',
] as const
export type Currency = (typeof CURRENCIES)[number]

export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', BDT: '৳', EUR: '€', GBP: '£', INR: '₹', AUD: 'A$', CAD: 'C$',
  AED: 'د.إ', SGD: 'S$', JPY: '¥', CNY: '¥', CHF: 'CHF', NZD: 'NZ$', ZAR: 'R', BRL: 'R$',
}

export function currencyLabel(code: string): string {
  const symbol = CURRENCY_SYMBOLS[code]
  return symbol ? `${code} (${symbol})` : code
}

export interface RevenueTotals {
  openPipelineValue: number | null
  weightedPipelineValue: number | null
  closedWonRevenue: number | null
  closedLostValue: number | null
  winRate: number
  avgDealSize: number | null
  avgSalesCycleDays: number
  openDealsCount: number
  closedWonCount: number
  closedLostCount: number
}

export interface RevenueSummary {
  totals: RevenueTotals
  values_masked?: boolean
  closedRange: 'all' | 'month' | 'quarter' | 'year'
  funnel: Array<{ stage: string; count: number; value: number | null }>
  trend: Array<{ month: string; revenue: number | null }>
  lossReasonBreakdown: Array<{ label: string; count: number }>
  dealsClosingThisMonth: Array<{
    id: string
    name: string
    company_name: string
    value: number | null
    currency: string
    expected_close_date: string
    is_overdue: boolean
  }>
  displayCurrency: string
  ratesUpdatedAt: string
}
