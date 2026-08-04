export interface TeamActivityEntry {
  id: string
  type: string
  message: string
  created_at: string
  created_by: string | null
  lead_id: string
  company_name: string | null
  actor_name: string | null
  is_win: boolean
}

export type TeamActivityTypeFilter = '' | 'leads' | 'deals' | 'wins'

export interface TeamActivityFilters {
  memberId?: string
  activityType?: TeamActivityTypeFilter
  dateFrom?: string
  dateTo?: string
  page?: number
  pageSize?: number
}

export interface TeamActivityListResponse {
  activities: TeamActivityEntry[]
  total: number
  page: number
  pageSize: number
}
