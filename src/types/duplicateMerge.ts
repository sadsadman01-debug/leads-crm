import type { Lead } from './lead'
import type { Deal } from './deal'

export interface LeadDuplicateGroup {
  leads: Lead[]
  reasons: Array<'phone' | 'email' | 'company_name'>
}

export interface LeadDuplicatesResponse {
  groups: LeadDuplicateGroup[]
  truncated: boolean
}

export interface DealDuplicateGroup {
  deals: Deal[]
}

export interface DealDuplicatesResponse {
  groups: DealDuplicateGroup[]
  truncated: boolean
}

export interface MergeLeadsPayload {
  survivorId: string
  loserId: string
  fields?: Record<string, any>
  customFields?: Record<string, any>
  statusOverrides?: Record<string, boolean>
}

export interface MergeDealsPayload {
  survivorId: string
  loserId: string
  fields?: Record<string, any>
  customFields?: Record<string, any>
}

export type MergedLeadResult = Lead & { mergeSnapshotId: string }
export type MergedDealResult = Deal & { mergeSnapshotId: string }

export interface MergeSnapshotSummary {
  id: string
  record_type: 'lead' | 'deal'
  survivor_id: string
  loser_id: string
  loser_label: string | null
  merged_by_name: string | null
  merged_at: string
  restored_at: string | null
}
