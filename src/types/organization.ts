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
  pricing_tier: 'early_bird' | 'standard' | null
  monthly_price_usd: number | null
  payment_status: 'pending' | 'received' | 'waived' | null
  next_payment_due_date: string | null
}

export interface BrandPaletteColor {
  id: string
  label: string
  hex: string
}

export interface OrgBranding {
  logo_url: string | null
  accent_color: string | null
  display_name: string | null
  palette: BrandPaletteColor[]
}

export interface PlatformBranding {
  logo_url: string | null
  accent_color: string | null
  platform_name: string | null
  support_email: string | null
  audit_log_retention_days: number | null
  palette: BrandPaletteColor[]
}
