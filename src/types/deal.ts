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
  value: number
  currency: string
  stage_id: string | null
  probability: number
  expected_close_date: string | null
  actual_close_date: string | null
  outcome_reason: string | null
  notes: string | null
  owner_id: string | null
  created_at: string
  updated_at: string
  lead: DealLeadRef | null
}

export interface KanbanDeal {
  id: string
  name: string
  value: number
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

export const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'INR'] as const
export type Currency = (typeof CURRENCIES)[number]

export interface RevenueTotals {
  openPipelineValue: number
  weightedPipelineValue: number
  closedWonRevenue: number
  closedLostValue: number
  winRate: number
  avgDealSize: number
  avgSalesCycleDays: number
  openDealsCount: number
  closedWonCount: number
  closedLostCount: number
}

export interface RevenueSummary {
  totals: RevenueTotals
  closedRange: 'all' | 'month' | 'quarter' | 'year'
  funnel: Array<{ stage: string; count: number; value: number }>
  trend: Array<{ month: string; revenue: number }>
  lossReasonBreakdown: Array<{ label: string; count: number }>
  dealsClosingThisMonth: Array<{
    id: string
    name: string
    company_name: string
    value: number
    currency: string
    expected_close_date: string
    is_overdue: boolean
  }>
}
