import { supabase } from './supabase'
import type {
  AppSettings,
  DashboardSummary,
  Industry,
  KanbanLead,
  Lead,
  LeadActivity,
  LeadFilters,
  LeadListResponse,
  LeadStatus,
  PipelineStage,
  Tag,
  Template,
  TemplateType,
} from '@/types/lead'
import type {
  Deal,
  DealFilters,
  DealListResponse,
  DealStage,
  KanbanDeal,
  RevenueSummary,
  WinLossReason,
} from '@/types/deal'
import type { TeamMember, Role, UserPermissions } from '@/types/team'
import type { Organization, OrganizationSummary, OrgBranding, PlatformBranding } from '@/types/organization'
import type { CustomFieldDefinition, AppliesTo, FieldType } from '@/types/customField'
import type { SavedReport, ReportRunResult, ReportType, ChartType, ReportFilters } from '@/types/report'
import type { SignupRequest, ApproveSignupRequestResult } from '@/types/signupRequest'
import type { PasswordResetRequest, PasswordResetResult } from '@/types/passwordResetRequest'
import type { AppNotification, NotificationListResponse } from '@/types/notification'
import type { OnboardingStatus } from '@/types/onboarding'
import { withOrgScope } from './orgScope'

class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new ApiError(401, 'Not authenticated')
  return { Authorization: `Bearer ${token}` }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = {
    'Content-Type': 'application/json',
    ...(await authHeader()),
    ...(options.headers ?? {}),
  }

  const res = await fetch(`/api${withOrgScope(path)}`, { ...options, headers })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(res.status, body.error ?? `Request failed with status ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

/** For the handful of endpoints reachable before login (currently just the
 * public "Request Access" submission) — no session exists yet, so this skips
 * authHeader() (which throws without one) and the org-scope query param. */
async function requestPublic<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = { 'Content-Type': 'application/json', ...(options.headers ?? {}) }
  const res = await fetch(`/api${path}`, { ...options, headers })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(res.status, body.error ?? `Request failed with status ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export interface ListLeadsParams {
  search?: string
  page?: number
  pageSize?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  filters?: LeadFilters
}

function buildListQuery(params: ListLeadsParams): URLSearchParams {
  const qs = new URLSearchParams()
  if (params.search) qs.set('search', params.search)
  if (params.page) qs.set('page', String(params.page))
  if (params.pageSize) qs.set('pageSize', String(params.pageSize))
  if (params.sortBy) qs.set('sortBy', params.sortBy)
  if (params.sortOrder) qs.set('sortOrder', params.sortOrder)
  if (params.filters && Object.keys(params.filters).length > 0) {
    qs.set('filters', JSON.stringify(params.filters))
  }
  return qs
}

export function isFiltersEmpty(filters?: LeadFilters): boolean {
  if (!filters) return true
  return Object.values(filters).every(
    (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)
  )
}

export const leadsApi = {
  list: (params: ListLeadsParams = {}) => request<LeadListResponse>(`/leads?${buildListQuery(params).toString()}`),

  get: (id: string) => request<Lead>(`/leads/${id}`),

  create: (payload: Partial<Lead> & { tags?: string[] }) =>
    request<Lead>('/leads', { method: 'POST', body: JSON.stringify(payload) }),

  update: (id: string, payload: Partial<Lead> & { tags?: string[] }) =>
    request<Lead>(`/leads/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),

  remove: (id: string) => request<{ success: true }>(`/leads/${id}`, { method: 'DELETE' }),

  checkDuplicate: (payload: { company_name?: string; phone?: string; email?: string; excludeId?: string }) =>
    request<{ matches: Array<Pick<Lead, 'id' | 'company_name' | 'phone' | 'email'>> }>(
      '/leads/check-duplicate',
      { method: 'POST', body: JSON.stringify(payload) }
    ),

  updateStatus: (id: string, payload: Partial<LeadStatus>) =>
    request<LeadStatus>(`/leads/${id}/status`, { method: 'PATCH', body: JSON.stringify(payload) }),

  updateStage: (id: string, stageId: string) =>
    request<Lead>(`/leads/${id}/stage`, { method: 'PATCH', body: JSON.stringify({ stage_id: stageId }) }),

  kanban: (industryId?: string, assignedTo?: string) => {
    const qs = new URLSearchParams()
    if (industryId) qs.set('industryId', industryId)
    if (assignedTo) qs.set('assignedTo', assignedTo)
    const suffix = qs.toString()
    return request<{ leads: KanbanLead[]; truncated: boolean }>(`/leads/kanban${suffix ? `?${suffix}` : ''}`)
  },

  activities: (id: string) => request<{ activities: LeadActivity[] }>(`/leads/${id}/activities`),
}

export const bulkApi = {
  markStatus: (ids: string[], field: string, value: boolean) =>
    request<{ success: true; updated: number }>('/leads/bulk', {
      method: 'POST',
      body: JSON.stringify({ type: 'status', ids, field, value }),
    }),

  addTags: (ids: string[], tagNames: string[]) =>
    request<{ success: true; updated: number }>('/leads/bulk', {
      method: 'POST',
      body: JSON.stringify({ type: 'tags', ids, tagNames }),
    }),

  remove: (ids: string[]) =>
    request<{ success: true; deleted: number }>('/leads/bulk', {
      method: 'POST',
      body: JSON.stringify({ type: 'delete', ids }),
    }),
}

export interface ImportResult {
  imported: number
  skipped: number
  total: number
}

export const importApi = {
  rows: (rows: Record<string, string>[], defaultIndustryId?: string) =>
    request<ImportResult>('/leads/import', {
      method: 'POST',
      body: JSON.stringify({ rows, defaultIndustryId }),
    }),

  googleSheet: (sheetUrl: string, defaultIndustryId?: string) =>
    request<ImportResult>('/leads/import/sheet', {
      method: 'POST',
      body: JSON.stringify({ sheetUrl, defaultIndustryId }),
    }),
}

export const exportApi = {
  async downloadCsv(params: { search?: string; filters?: LeadFilters } = {}) {
    const qs = new URLSearchParams()
    if (params.search) qs.set('search', params.search)
    if (params.filters && Object.keys(params.filters).length > 0) {
      qs.set('filters', JSON.stringify(params.filters))
    }

    const res = await fetch(`/api${withOrgScope(`/leads/export?${qs.toString()}`)}`, { headers: await authHeader() })
    if (!res.ok) throw new ApiError(res.status, 'Failed to export leads')

    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `leads-export-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  },
}

export const dashboardApi = {
  summary: (granularity: 'day' | 'week' | 'month' = 'day', industryId?: string, assignedTo?: string) => {
    const qs = new URLSearchParams({ granularity })
    if (industryId) qs.set('industryId', industryId)
    if (assignedTo) qs.set('assignedTo', assignedTo)
    return request<DashboardSummary>(`/dashboard/summary?${qs.toString()}`)
  },
}

export const customFieldsApi = {
  list: () => request<{ fields: CustomFieldDefinition[] }>('/custom-fields'),

  create: (payload: {
    applies_to: AppliesTo
    label: string
    field_type: FieldType
    options?: string[]
    required?: boolean
    default_value?: string | null
  }) => request<CustomFieldDefinition>('/custom-fields', { method: 'POST', body: JSON.stringify(payload) }),

  update: (
    id: string,
    payload: Partial<{
      applies_to: AppliesTo
      label: string
      options: string[]
      required: boolean
      default_value: string | null
    }>
  ) => request<CustomFieldDefinition>(`/custom-fields/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),

  reorder: (orderedIds: string[]) =>
    request<{ fields: CustomFieldDefinition[] }>('/custom-fields/reorder', {
      method: 'PATCH',
      body: JSON.stringify({ orderedIds }),
    }),

  remove: (id: string) => request<{ success: true }>(`/custom-fields/${id}`, { method: 'DELETE' }),
}

export const reportsApi = {
  list: () => request<{ reports: SavedReport[] }>('/reports'),

  create: (payload: {
    name: string
    report_type: ReportType
    selected_fields?: string[]
    group_by?: string | null
    filters?: ReportFilters
    chart_type?: ChartType
    visible_to_all?: boolean
  }) => request<SavedReport>('/reports', { method: 'POST', body: JSON.stringify(payload) }),

  update: (id: string, payload: Partial<Omit<SavedReport, 'id' | 'created_by' | 'created_at' | 'updated_at' | 'report_type'>>) =>
    request<SavedReport>(`/reports/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),

  remove: (id: string) => request<{ success: true }>(`/reports/${id}`, { method: 'DELETE' }),

  run: (payload: { report_type: ReportType; group_by?: string | null; filters?: ReportFilters; displayCurrency?: string }) =>
    request<ReportRunResult>('/reports/run', { method: 'POST', body: JSON.stringify(payload) }),
}

export interface ForecastPeriod {
  periodKey: string
  label: string
  forecast: number | null
  openWeighted: number | null
  closedWon: number | null
  quota: number | null
  progressPct: number | null
  status: 'on_track' | 'at_risk' | 'behind' | 'no_quota'
}

export interface ForecastResponse {
  displayCurrency: string
  ratesUpdatedAt: string
  values_masked?: boolean
  thisMonth: ForecastPeriod
  thisQuarter: ForecastPeriod
  nextQuarter: ForecastPeriod
}

export const forecastApi = {
  get: (displayCurrency?: string, assignedTo?: string) => {
    const qs = new URLSearchParams()
    if (displayCurrency) qs.set('displayCurrency', displayCurrency)
    if (assignedTo) qs.set('assignedTo', assignedTo)
    return request<ForecastResponse>(`/forecast?${qs.toString()}`)
  },
}

export interface TrendMetric {
  key: 'leadsAdded' | 'conversionRate' | 'revenue' | 'avgDealSize'
  current: number | null
  previous: number | null
  pctChange: number | null
}

export interface PeriodComparisonMetric {
  current: number | null
  previous: number | null
  pctChange: number | null
}

export interface PeriodComparison {
  leadsAdded: PeriodComparisonMetric
  conversionRate: PeriodComparisonMetric
  revenue: PeriodComparisonMetric
}

export const trendsApi = {
  get: (granularity: 'month' | 'quarter', displayCurrency?: string) => {
    const qs = new URLSearchParams({ granularity })
    if (displayCurrency) qs.set('displayCurrency', displayCurrency)
    return request<{ granularity: string; displayCurrency: string; metrics: TrendMetric[] }>(`/trends?${qs.toString()}`)
  },
  periodComparisons: (displayCurrency?: string) => {
    const qs = new URLSearchParams()
    if (displayCurrency) qs.set('displayCurrency', displayCurrency)
    return request<{ displayCurrency: string; ratesUpdatedAt: string; month: PeriodComparison; quarter: PeriodComparison; year: PeriodComparison }>(
      `/trends/period-comparisons?${qs.toString()}`
    )
  },
}

export interface Quota {
  id: string
  user_id: string | null
  period_type: 'month' | 'quarter'
  period_key: string
  amount: number
  currency: string
}

export const quotasApi = {
  list: () => request<{ quotas: Quota[] }>('/quotas'),

  upsert: (payload: { user_id?: string | null; period_type: 'month' | 'quarter'; period_key: string; amount: number; currency?: string }) =>
    request<Quota>('/quotas', { method: 'POST', body: JSON.stringify(payload) }),

  remove: (id: string) => request<{ success: true }>(`/quotas/${id}`, { method: 'DELETE' }),
}

export const organizationsApi = {
  list: () => request<{ organizations: OrganizationSummary[] }>('/organizations'),

  get: (id: string) => request<Organization>(`/organizations/${id}`),

  create: (payload: { organizationName: string; email: string; password: string; nickname: string }) =>
    request<{ organization: Organization; admin: { id: string; email: string; nickname: string } }>('/organizations', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateStatus: (id: string, status: 'active' | 'suspended') =>
    request<Organization>(`/organizations/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),

  remove: (id: string, confirm: string) =>
    request<{ success: true }>(`/organizations/${id}`, { method: 'DELETE', body: JSON.stringify({ confirm }) }),
}

export const brandingApi = {
  get: () => request<OrgBranding>('/branding'),

  createLogoSignedUpload: (fileName: string) =>
    request<{ signedUrl: string; token: string; storage_path: string }>('/branding/logo/sign', {
      method: 'POST',
      body: JSON.stringify({ file_name: fileName }),
    }),

  update: (payload: { logo_storage_path?: string | null; accent_color?: string | null; display_name?: string | null }) =>
    request<OrgBranding>('/branding', { method: 'PATCH', body: JSON.stringify(payload) }),

  reset: () => request<OrgBranding>('/branding/reset', { method: 'POST' }),
}

export const platformBrandingApi = {
  /** Public — reachable from Login/Request Access/Forgot Password before any
   * session exists (also used post-login, e.g. by the Sidebar's fallback chain). */
  get: () => requestPublic<PlatformBranding>('/platform-branding'),

  createLogoSignedUpload: (fileName: string) =>
    request<{ signedUrl: string; token: string; storage_path: string }>('/platform-branding/logo/sign', {
      method: 'POST',
      body: JSON.stringify({ file_name: fileName }),
    }),

  update: (payload: { logo_storage_path?: string | null; accent_color?: string | null; platform_name?: string | null }) =>
    request<PlatformBranding>('/platform-branding', { method: 'PATCH', body: JSON.stringify(payload) }),

  reset: () => request<PlatformBranding>('/platform-branding/reset', { method: 'POST' }),
}

export const onboardingApi = {
  get: () => request<OnboardingStatus>('/onboarding'),

  dismiss: () => request<{ success: true }>('/onboarding/dismiss', { method: 'POST' }),
}

export const signupRequestsApi = {
  /** Public — reachable from the Login page before any session exists. */
  create: (payload: { organization_name: string; contact_name: string; email: string; phone?: string; message?: string }) =>
    requestPublic<SignupRequest>('/signup-requests', { method: 'POST', body: JSON.stringify(payload) }),

  list: () => request<{ requests: SignupRequest[] }>('/signup-requests'),

  approve: (id: string) => request<ApproveSignupRequestResult>(`/signup-requests/${id}/approve`, { method: 'POST' }),

  reject: (id: string, rejection_reason?: string) =>
    request<SignupRequest>(`/signup-requests/${id}/reject`, { method: 'POST', body: JSON.stringify({ rejection_reason }) }),
}

export const passwordResetRequestsApi = {
  /** Public — reachable from the Login page before any session exists. Always
   * resolves the same way whether or not a matching account was found. */
  create: (email: string) =>
    requestPublic<{ message: string }>('/password-reset-requests', { method: 'POST', body: JSON.stringify({ email }) }),

  list: () => request<{ requests: PasswordResetRequest[] }>('/password-reset-requests'),

  resolve: (id: string) =>
    request<{ request: PasswordResetRequest; admin: PasswordResetResult }>(`/password-reset-requests/${id}/resolve`, {
      method: 'POST',
    }),
}

export const notificationsApi = {
  list: (params: { page?: number; pageSize?: number; status?: 'unread' | 'read' | 'all'; type?: string } = {}) => {
    const qs = new URLSearchParams()
    if (params.page) qs.set('page', String(params.page))
    if (params.pageSize) qs.set('pageSize', String(params.pageSize))
    if (params.status) qs.set('status', params.status)
    if (params.type) qs.set('type', params.type)
    return request<NotificationListResponse>(`/notifications?${qs.toString()}`)
  },

  unreadCount: () => request<{ count: number }>('/notifications/unread-count'),

  markRead: (id: string) => request<AppNotification>(`/notifications/${id}/read`, { method: 'POST' }),

  markAllRead: () => request<{ success: true }>('/notifications/mark-all-read', { method: 'POST' }),
}

export const teamApi = {
  me: () => request<{
    id: string
    email: string
    nickname: string | null
    role: Role
    is_active: boolean
    organization_id: string | null
    organization_name: string | null
    permissions: UserPermissions
    force_password_change: boolean
  }>('/team-members/me'),

  clearForcePasswordChange: () =>
    request<{ success: true }>('/team-members/me/clear-force-password-change', { method: 'POST' }),

  roster: () => request<{ members: Array<{ id: string; nickname: string | null; email: string }> }>(
    '/team-members/roster'
  ),

  list: () => request<{ members: TeamMember[] }>('/team-members'),

  create: (payload: { email: string; password: string; nickname: string; role: Role }) =>
    request<TeamMember>('/team-members', { method: 'POST', body: JSON.stringify(payload) }),

  update: (id: string, payload: Partial<{ nickname: string; role: Role; is_active: boolean; reassignTo: string | null }>) =>
    request<TeamMember>(`/team-members/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),

  remove: (id: string, confirm: string) =>
    request<{ success: true }>(`/team-members/${id}`, { method: 'DELETE', body: JSON.stringify({ confirm }) }),

  getPermissions: (id: string) => request<{ permissions: UserPermissions }>(`/team-members/${id}/permissions`),

  updatePermissions: (id: string, permissions: UserPermissions) =>
    request<TeamMember>(`/team-members/${id}/permissions`, { method: 'PUT', body: JSON.stringify({ permissions }) }),

  resetPermissions: (id: string) =>
    request<TeamMember>(`/team-members/${id}/permissions`, { method: 'PUT', body: JSON.stringify({ reset: true }) }),

  resetPassword: (id: string) =>
    request<{ admin: PasswordResetResult }>(`/team-members/${id}/reset-password`, { method: 'POST' }),
}

export const tagsApi = {
  list: () => request<{ tags: Tag[] }>('/tags'),
}

export const industriesApi = {
  list: () => request<{ industries: Industry[] }>('/industries'),

  create: (name: string) => request<Industry>('/industries', { method: 'POST', body: JSON.stringify({ name }) }),

  rename: (id: string, name: string) =>
    request<Industry>(`/industries/${id}`, { method: 'PUT', body: JSON.stringify({ name }) }),

  remove: (id: string) => request<{ success: true }>(`/industries/${id}`, { method: 'DELETE' }),
}

export const templatesApi = {
  list: () => request<{ templates: Template[] }>('/templates'),

  create: (payload: { name: string; subject: string; body: string; template_type: TemplateType }) =>
    request<Template>('/templates', { method: 'POST', body: JSON.stringify(payload) }),

  update: (id: string, payload: Partial<{ name: string; subject: string; body: string; template_type: TemplateType }>) =>
    request<Template>(`/templates/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),

  remove: (id: string) => request<{ success: true }>(`/templates/${id}`, { method: 'DELETE' }),
}

export const pipelineStagesApi = {
  list: () => request<{ stages: PipelineStage[] }>('/pipeline-stages'),

  create: (name: string) =>
    request<PipelineStage>('/pipeline-stages', { method: 'POST', body: JSON.stringify({ name }) }),

  rename: (id: string, name: string) =>
    request<PipelineStage>(`/pipeline-stages/${id}`, { method: 'PUT', body: JSON.stringify({ name }) }),

  reorder: (orderedIds: string[]) =>
    request<{ stages: PipelineStage[] }>('/pipeline-stages/reorder', {
      method: 'PATCH',
      body: JSON.stringify({ orderedIds }),
    }),

  remove: (id: string) => request<{ success: true }>(`/pipeline-stages/${id}`, { method: 'DELETE' }),
}

export const settingsApi = {
  get: () => request<AppSettings>('/settings'),

  update: (payload: Partial<Pick<AppSettings, 'follow_up_interval_days' | 'default_currency'>>) =>
    request<AppSettings>('/settings', { method: 'PUT', body: JSON.stringify(payload) }),
}

export const dealStagesApi = {
  list: () => request<{ stages: DealStage[] }>('/deal-stages'),

  create: (payload: { name: string; default_probability?: number; is_closed?: boolean; is_won?: boolean }) =>
    request<DealStage>('/deal-stages', { method: 'POST', body: JSON.stringify(payload) }),

  update: (id: string, payload: Partial<Pick<DealStage, 'name' | 'default_probability' | 'is_closed' | 'is_won'>>) =>
    request<DealStage>(`/deal-stages/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),

  reorder: (orderedIds: string[]) =>
    request<{ stages: DealStage[] }>('/deal-stages/reorder', {
      method: 'PATCH',
      body: JSON.stringify({ orderedIds }),
    }),

  remove: (id: string) => request<{ success: true }>(`/deal-stages/${id}`, { method: 'DELETE' }),
}

export const winLossReasonsApi = {
  list: () => request<{ reasons: WinLossReason[] }>('/win-loss-reasons'),

  create: (label: string) =>
    request<WinLossReason>('/win-loss-reasons', { method: 'POST', body: JSON.stringify({ label }) }),

  rename: (id: string, label: string) =>
    request<WinLossReason>(`/win-loss-reasons/${id}`, { method: 'PUT', body: JSON.stringify({ label }) }),

  remove: (id: string) => request<{ success: true }>(`/win-loss-reasons/${id}`, { method: 'DELETE' }),
}

export interface ListDealsParams {
  page?: number
  pageSize?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  filters?: DealFilters
}

export const dealsApi = {
  list: (params: ListDealsParams = {}) => {
    const qs = new URLSearchParams()
    if (params.page) qs.set('page', String(params.page))
    if (params.pageSize) qs.set('pageSize', String(params.pageSize))
    if (params.sortBy) qs.set('sortBy', params.sortBy)
    if (params.sortOrder) qs.set('sortOrder', params.sortOrder)
    if (params.filters && Object.keys(params.filters).length > 0) qs.set('filters', JSON.stringify(params.filters))
    return request<DealListResponse>(`/deals?${qs.toString()}`)
  },

  get: (id: string) => request<Deal>(`/deals/${id}`),

  create: (payload: {
    lead_id: string
    name: string
    value: number
    currency?: string
    expected_close_date?: string | null
    notes?: string | null
    owner_id?: string
    custom_fields?: Record<string, any>
  }) => request<Deal>('/deals', { method: 'POST', body: JSON.stringify(payload) }),

  update: (
    id: string,
    payload: Partial<Pick<Deal, 'name' | 'value' | 'currency' | 'probability' | 'expected_close_date' | 'notes' | 'owner_id' | 'custom_fields'>>
  ) => request<Deal>(`/deals/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),

  updateStage: (
    id: string,
    payload: { stage_id: string; probability?: number; outcome_reason?: string; actual_close_date?: string }
  ) => request<Deal>(`/deals/${id}/stage`, { method: 'PATCH', body: JSON.stringify(payload) }),

  remove: (id: string) => request<{ success: true }>(`/deals/${id}`, { method: 'DELETE' }),

  kanban: (industryId?: string, assignedTo?: string) => {
    const qs = new URLSearchParams()
    if (industryId) qs.set('industryId', industryId)
    if (assignedTo) qs.set('assignedTo', assignedTo)
    const suffix = qs.toString()
    return request<{ deals: KanbanDeal[]; truncated: boolean }>(`/deals/kanban${suffix ? `?${suffix}` : ''}`)
  },
}

export const revenueApi = {
  summary: (
    closedRange: 'all' | 'month' | 'quarter' | 'year' = 'all',
    industryId?: string,
    assignedTo?: string,
    displayCurrency?: string
  ) => {
    const qs = new URLSearchParams({ closedRange })
    if (industryId) qs.set('industryId', industryId)
    if (assignedTo) qs.set('assignedTo', assignedTo)
    if (displayCurrency) qs.set('displayCurrency', displayCurrency)
    return request<RevenueSummary>(`/revenue/summary?${qs.toString()}`)
  },
}

export const attachmentsApi = {
  createSignedUpload: (leadId: string, fileName: string) =>
    request<{ signedUrl: string; token: string; storage_path: string }>('/attachments/sign', {
      method: 'POST',
      body: JSON.stringify({ lead_id: leadId, file_name: fileName }),
    }),

  saveMetadata: (payload: {
    lead_id: string
    file_name: string
    storage_path: string
    content_type: string
    size_bytes: number
  }) => request('/attachments', { method: 'POST', body: JSON.stringify(payload) }),

  getDownloadUrl: (attachmentId: string) =>
    request<{ url: string }>(`/attachments/${attachmentId}/download`),

  remove: (attachmentId: string) =>
    request<{ success: true }>(`/attachments/${attachmentId}`, { method: 'DELETE' }),
}

export { ApiError }
