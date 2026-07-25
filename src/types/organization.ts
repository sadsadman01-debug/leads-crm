export interface Organization {
  id: string
  name: string
  status: 'active' | 'suspended'
  created_at: string
}

export interface OrganizationSummary extends Organization {
  admin: { id: string; email: string; nickname: string | null } | null
  userCount: number
  leadCount: number
  dealCount: number
  openPipelineValue: number
}
