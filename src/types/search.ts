export interface SearchLeadResult {
  id: string
  company_name: string
  contact_name: string | null
  email: string | null
  phone: string | null
  stage_id: string | null
}

export interface SearchDealResult {
  id: string
  name: string
  value: number | null
  currency: string
  stage_id: string | null
  lead_id: string
  lead: { company_name: string } | null
}

export interface SearchTeamMemberResult {
  id: string
  nickname: string | null
  email: string
  role: 'super_admin' | 'admin' | 'user'
}

export interface GlobalSearchResponse {
  query: string
  leads: { results: SearchLeadResult[]; total: number }
  deals: { results: SearchDealResult[]; total: number }
  teamMembers: { results: SearchTeamMemberResult[]; total: number }
}
