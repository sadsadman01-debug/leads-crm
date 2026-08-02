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
import type { MfaResetRequest, MfaResetResult } from '@/types/mfaResetRequest'
import type { AppNotification, NotificationListResponse } from '@/types/notification'
import type { OnboardingStatus } from '@/types/onboarding'
import type { GlobalSearchResponse } from '@/types/search'
import type { SupportContact } from '@/types/supportContact'
import type { ExportLogEntry } from '@/types/dataExport'
import type { AuditEventType, AuditLogFilters, AuditLogListResponse } from '@/types/auditLog'
import type {
  LeadDuplicatesResponse,
  DealDuplicatesResponse,
  MergeLeadsPayload,
  MergeDealsPayload,
  MergedLeadResult,
  MergedDealResult,
  MergeSnapshotSummary,
} from '@/types/duplicateMerge'
import type { PublicPricing, BillingSettings, OrganizationBillingRow, MyOrgBilling, PaymentStatus, BillingCycle } from '@/types/billing'
import type {
  AffiliateApplication,
  ApproveAffiliateApplicationResult,
  Affiliate,
  AffiliateWithSummary,
  AffiliateDetail,
  AffiliateDashboardSummary,
  Referral,
  PayoutMethod,
  PayoutMethodType,
  WithdrawalRequest,
  WithdrawalDetail,
  WithdrawalStatus,
  AffiliateSettings,
  PublicAffiliateProgramInfo,
  MarketingMaterials,
  AffiliateStatus,
} from '@/types/affiliate'
import type { ProductReview, ProductReviewWithReviewer, ProductReviewStats, ProductReviewFilters } from '@/types/productReview'
import { withOrgScope } from './orgScope'

export class ApiError extends Error {
  status: number
  details: any
  constructor(status: number, message: string, details?: any) {
    super(message)
    this.status = status
    this.details = details
  }
}

/** Bridges the module-level fetch layer (outside React) to a router-aware
 * redirect — set once by <SubscriptionGuard/> near the app root. Fires
 * whenever ANY authenticated call comes back blocked because the caller's
 * Organization's subscription has expired, so the block is enforced on
 * every request, not just at login. */
let subscriptionExpiredHandler: ((details: any) => void) | null = null
export function setSubscriptionExpiredHandler(fn: ((details: any) => void) | null) {
  subscriptionExpiredHandler = fn
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
    if (res.status === 402 && body.error === 'subscription_expired') {
      subscriptionExpiredHandler?.(body)
    }
    throw new ApiError(res.status, body.error ?? `Request failed with status ${res.status}`, body)
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

  findDuplicates: () => request<LeadDuplicatesResponse>('/leads/duplicates'),

  dismissDuplicate: (leadIdA: string, leadIdB: string) =>
    request<{ success: true }>('/leads/duplicates/dismiss', { method: 'POST', body: JSON.stringify({ leadIdA, leadIdB }) }),

  merge: (payload: MergeLeadsPayload) =>
    request<MergedLeadResult>('/leads/merge', { method: 'POST', body: JSON.stringify(payload) }),
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

  update: (payload: {
    logo_storage_path?: string | null
    accent_color?: string | null
    platform_name?: string | null
    support_email?: string | null
    audit_log_retention_days?: number | null
  }) => request<PlatformBranding>('/platform-branding', { method: 'PATCH', body: JSON.stringify(payload) }),

  reset: () => request<PlatformBranding>('/platform-branding/reset', { method: 'POST' }),
}

export const supportContactsApi = {
  create: (payload: { email: string; message: string }) =>
    request<{ success: true }>('/support-contacts', { method: 'POST', body: JSON.stringify(payload) }),

  /** Public — reachable from Login/Request Access/Forgot Password before any session exists. */
  createPublic: (payload: { email: string; message: string }) =>
    requestPublic<{ success: true }>('/support-contacts/public', { method: 'POST', body: JSON.stringify(payload) }),

  list: () => request<{ contacts: SupportContact[] }>('/support-contacts'),

  deleteAll: () => request<{ success: true }>('/support-contacts', { method: 'DELETE' }),
}

export const dataExportApi = {
  /** `organizationId` lets the Super Admin export a specific Organization
   * directly from Organizations Overview without "entering" it first — it's
   * appended as an explicit query param rather than routed through the
   * global org-scope mechanism, since that page has no active scope set. */
  async downloadFull(organizationId?: string) {
    const path = organizationId ? `/data-export?organizationId=${encodeURIComponent(organizationId)}` : '/data-export'
    const res = await fetch(`/api${withOrgScope(path)}`, { headers: await authHeader() })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new ApiError(res.status, body.error ?? 'Failed to generate export')
    }

    const disposition = res.headers.get('content-disposition') ?? ''
    const match = disposition.match(/filename="([^"]+)"/)
    const filename = match?.[1] ?? `CRM_Export_${new Date().toISOString().slice(0, 10)}.zip`

    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  },

  listLog: () => request<{ entries: ExportLogEntry[] }>('/data-export/log'),
}

function buildAuditLogQuery(filters: AuditLogFilters, extra: Record<string, string | number> = {}): URLSearchParams {
  const qs = new URLSearchParams()
  if (filters.eventTypes && filters.eventTypes.length > 0) qs.set('eventTypes', filters.eventTypes.join(','))
  if (filters.organizationId) qs.set('organizationId', filters.organizationId)
  if (filters.actorProfileId) qs.set('actorProfileId', filters.actorProfileId)
  if (filters.dateFrom) qs.set('dateFrom', filters.dateFrom)
  if (filters.dateTo) qs.set('dateTo', filters.dateTo)
  if (filters.search) qs.set('search', filters.search)
  for (const [key, value] of Object.entries(extra)) qs.set(key, String(value))
  return qs
}

export const auditLogApi = {
  list: (filters: AuditLogFilters, page: number, pageSize: number) =>
    request<AuditLogListResponse>(`/audit-log?${buildAuditLogQuery(filters, { page, pageSize }).toString()}`),

  async downloadCsv(filters: AuditLogFilters) {
    const res = await fetch(`/api${withOrgScope(`/audit-log/export?${buildAuditLogQuery(filters).toString()}`)}`, {
      headers: await authHeader(),
    })
    if (!res.ok) throw new ApiError(res.status, 'Failed to export audit log')

    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Audit_Log_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  },
}

/** Covers events that happen entirely client-side via the Supabase Auth SDK
 * (login, logout, MFA enroll/unenroll) and so never otherwise touch the
 * backend — both calls are fire-and-forget from the caller's perspective:
 * a logging failure must never block or surface an error for the real action. */
export const auditEventsApi = {
  logAuthEvent: (eventType: 'login_success' | 'login_failure', email: string) =>
    requestPublic<{ success: true }>('/auth-events', {
      method: 'POST',
      body: JSON.stringify({ event_type: eventType, email }),
    }),

  logSecurityEvent: (eventType: Extract<AuditEventType, 'logout' | 'mfa_enabled' | 'mfa_disabled' | 'password_changed'>) =>
    request<{ success: true }>('/security-events', { method: 'POST', body: JSON.stringify({ event_type: eventType }) }),
}

export const onboardingApi = {
  get: () => request<OnboardingStatus>('/onboarding'),

  dismiss: () => request<{ success: true }>('/onboarding/dismiss', { method: 'POST' }),
}

export const searchApi = {
  query: (q: string) => {
    const qs = new URLSearchParams({ q })
    return request<GlobalSearchResponse>(`/search?${qs.toString()}`)
  },
}

export const signupRequestsApi = {
  /** Public — reachable from the Login page before any session exists. */
  create: (payload: {
    organization_name: string
    contact_name: string
    email: string
    phone?: string
    message?: string
    city: string
    country: string
    zip_code: string
    billing_cycle?: BillingCycle
    ref?: string
  }) => requestPublic<SignupRequest>('/signup-requests', { method: 'POST', body: JSON.stringify(payload) }),

  list: () => request<{ requests: SignupRequest[] }>('/signup-requests'),

  approve: (id: string, payment_status?: PaymentStatus) =>
    request<ApproveSignupRequestResult>(`/signup-requests/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify(payment_status ? { payment_status } : {}),
    }),

  reject: (id: string, rejection_reason?: string) =>
    request<SignupRequest>(`/signup-requests/${id}/reject`, { method: 'POST', body: JSON.stringify({ rejection_reason }) }),

  updatePaymentStatus: (id: string, payment_status: PaymentStatus) =>
    request<SignupRequest>(`/signup-requests/${id}/payment-status`, { method: 'PATCH', body: JSON.stringify({ payment_status }) }),
}

export const billingApi = {
  /** Public — reachable from the Login/Request Access pages before any session exists. */
  getPublicPricing: () => requestPublic<PublicPricing>('/billing/pricing'),

  getSettings: () => request<BillingSettings>('/billing/settings'),

  updateSettings: (
    payload: Partial<
      Pick<
        BillingSettings,
        'payment_instructions' | 'early_bird_threshold' | 'early_bird_price_usd' | 'standard_price_usd' | 'promotional_banner_text' | 'grace_period_days'
      >
    >
  ) => request<BillingSettings>('/billing/settings', { method: 'PATCH', body: JSON.stringify(payload) }),

  list: () => request<{ organizations: OrganizationBillingRow[] }>('/billing'),

  recordPayment: (
    organizationId: string,
    payload: { amount_usd: number; paid_at: string; notes?: string; extend_from: 'current_expiry' | 'payment_date' }
  ) => request<OrganizationBillingRow>(`/billing/${organizationId}/record-payment`, { method: 'POST', body: JSON.stringify(payload) }),

  getMyOrganization: () => request<MyOrgBilling>('/billing/my-organization'),
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

export const mfaResetRequestsApi = {
  /** Public — reachable from the Login page's MFA challenge screen before any
   * session exists. Always resolves the same way whether or not a matching
   * account was found. */
  create: (email: string) =>
    requestPublic<{ message: string }>('/mfa-reset-requests', { method: 'POST', body: JSON.stringify({ email }) }),

  list: () => request<{ requests: MfaResetRequest[] }>('/mfa-reset-requests'),

  resolve: (id: string) =>
    request<{ request: MfaResetRequest; account: MfaResetResult }>(`/mfa-reset-requests/${id}/resolve`, {
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
    review_due: boolean
    pending_review_number: number | null
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

  update: (
    payload: Partial<
      Pick<
        AppSettings,
        | 'email_followup1_interval_days'
        | 'email_followup2_interval_days'
        | 'email_followup3_interval_days'
        | 'whatsapp_followup1_interval_days'
        | 'whatsapp_followup2_interval_days'
        | 'whatsapp_followup3_interval_days'
        | 'linkedin_followup1_interval_days'
        | 'linkedin_followup2_interval_days'
        | 'linkedin_followup3_interval_days'
        | 'default_currency'
      >
    >
  ) => request<AppSettings>('/settings', { method: 'PUT', body: JSON.stringify(payload) }),
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

  findDuplicates: () => request<DealDuplicatesResponse>('/deals/duplicates'),

  dismissDuplicate: (dealIdA: string, dealIdB: string) =>
    request<{ success: true }>('/deals/duplicates/dismiss', { method: 'POST', body: JSON.stringify({ dealIdA, dealIdB }) }),

  merge: (payload: MergeDealsPayload) =>
    request<MergedDealResult>('/deals/merge', { method: 'POST', body: JSON.stringify(payload) }),
}

export const mergeSnapshotsApi = {
  list: () => request<{ snapshots: MergeSnapshotSummary[] }>('/merge-snapshots'),

  restore: (id: string) => request<{ success: true }>(`/merge-snapshots/${id}/restore`, { method: 'POST' }),
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

export const affiliateApplicationsApi = {
  /** Public — reachable from the "Become an Affiliate" page before any session exists. */
  create: (payload: { full_name: string; email: string; how_they_plan_to_promote?: string; city: string; country: string; zip_code: string }) =>
    requestPublic<AffiliateApplication>('/affiliate-applications', { method: 'POST', body: JSON.stringify(payload) }),

  list: () => request<{ applications: AffiliateApplication[] }>('/affiliate-applications'),

  approve: (id: string) => request<ApproveAffiliateApplicationResult>(`/affiliate-applications/${id}/approve`, { method: 'POST' }),

  reject: (id: string, rejection_reason?: string) =>
    request<AffiliateApplication>(`/affiliate-applications/${id}/reject`, { method: 'POST', body: JSON.stringify({ rejection_reason }) }),
}

export const affiliatesApi = {
  getMe: () => request<Affiliate>('/affiliates/me'),

  getMyDashboard: (dateFrom?: string, dateTo?: string) => {
    const qs = new URLSearchParams()
    if (dateFrom) qs.set('dateFrom', dateFrom)
    if (dateTo) qs.set('dateTo', dateTo)
    const suffix = qs.toString()
    return request<AffiliateDashboardSummary>(`/affiliates/me/dashboard${suffix ? `?${suffix}` : ''}`)
  },

  getMyReferrals: () => request<{ referrals: Referral[] }>('/affiliates/me/referrals'),

  list: () => request<{ affiliates: AffiliateWithSummary[] }>('/affiliates'),

  getDetail: (id: string, dateFrom?: string, dateTo?: string) => {
    const qs = new URLSearchParams()
    if (dateFrom) qs.set('dateFrom', dateFrom)
    if (dateTo) qs.set('dateTo', dateTo)
    const suffix = qs.toString()
    return request<AffiliateDetail>(`/affiliates/${id}${suffix ? `?${suffix}` : ''}`)
  },

  updateStatus: (id: string, status: AffiliateStatus) =>
    request<Affiliate>(`/affiliates/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
}

export const payoutMethodsApi = {
  list: () => request<{ methods: PayoutMethod[] }>('/payout-methods'),

  create: (payload: { method_type: PayoutMethodType; label: string; details: Record<string, any>; is_default?: boolean }) =>
    request<PayoutMethod>('/payout-methods', { method: 'POST', body: JSON.stringify(payload) }),

  update: (id: string, payload: Partial<{ label: string; details: Record<string, any>; is_default: boolean }>) =>
    request<PayoutMethod>(`/payout-methods/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),

  remove: (id: string) => request<{ success: true }>(`/payout-methods/${id}`, { method: 'DELETE' }),
}

export const withdrawalsApi = {
  create: (payload: { amount_usd: number; payout_method_id: string }) =>
    request<WithdrawalRequest>('/withdrawals', { method: 'POST', body: JSON.stringify(payload) }),

  listMine: () => request<{ withdrawals: WithdrawalRequest[] }>('/withdrawals/mine'),

  list: (status?: WithdrawalStatus | 'all') => {
    const qs = status ? `?status=${status}` : ''
    return request<{ withdrawals: WithdrawalRequest[] }>(`/withdrawals${qs}`)
  },

  getDetail: (id: string) => request<WithdrawalDetail>(`/withdrawals/${id}`),

  updateStatus: (
    id: string,
    payload: { status: WithdrawalStatus; actual_amount_sent_usd?: number; notes?: string; rejection_reason?: string }
  ) => request<WithdrawalRequest>(`/withdrawals/${id}/status`, { method: 'PATCH', body: JSON.stringify(payload) }),
}

export const productReviewsApi = {
  submit: (payload: { rating: number; comment?: string; suggestions?: string }) =>
    request<ProductReview>('/product-reviews', { method: 'POST', body: JSON.stringify(payload) }),

  listMine: () => request<{ reviews: ProductReview[] }>('/product-reviews/mine'),

  /** Super Admin only. */
  listAll: (filters: ProductReviewFilters = {}) => {
    const qs = new URLSearchParams()
    if (filters.rating) qs.set('rating', String(filters.rating))
    if (filters.organization_id) qs.set('organization_id', filters.organization_id)
    if (filters.role) qs.set('role', filters.role)
    if (filters.reply_status) qs.set('reply_status', filters.reply_status)
    if (filters.date_from) qs.set('date_from', filters.date_from)
    if (filters.date_to) qs.set('date_to', filters.date_to)
    const query = qs.toString()
    return request<{ reviews: ProductReviewWithReviewer[] }>(`/product-reviews${query ? `?${query}` : ''}`)
  },

  /** Super Admin only. */
  stats: (range?: { date_from?: string; date_to?: string }) => {
    const qs = new URLSearchParams()
    if (range?.date_from) qs.set('date_from', range.date_from)
    if (range?.date_to) qs.set('date_to', range.date_to)
    const query = qs.toString()
    return request<ProductReviewStats>(`/product-reviews/stats${query ? `?${query}` : ''}`)
  },

  /** Super Admin only — sends a first reply or overwrites an existing one. */
  reply: (id: string, reply: string) =>
    request<ProductReview>(`/product-reviews/${id}/reply`, { method: 'PUT', body: JSON.stringify({ reply }) }),
}

export const referralClicksApi = {
  /** Public, fire-and-forget from the Request Access page — never awaited by the caller. */
  log: (referral_code: string) => requestPublic<{ success: true }>('/referral-clicks', { method: 'POST', body: JSON.stringify({ referral_code }) }),
}

export type PageViewType = 'request_access' | 'become_affiliate'

export const pageViewsApi = {
  /** Public, fire-and-forget — logged on every load of a public entry page, referral or not. */
  log: (page_type: PageViewType, referral_code?: string | null) =>
    requestPublic<{ success: true }>('/page-views', { method: 'POST', body: JSON.stringify({ page_type, referral_code }) }),

  /** Super Admin only. */
  getCount: (page_type: PageViewType, dateFrom?: string, dateTo?: string) => {
    const qs = new URLSearchParams({ page_type })
    if (dateFrom) qs.set('dateFrom', dateFrom)
    if (dateTo) qs.set('dateTo', dateTo)
    return request<{ count: number }>(`/page-views/count?${qs.toString()}`)
  },
}

export const affiliateMarketingApi = {
  get: (referralLink: string) => request<MarketingMaterials>(`/affiliate-marketing?referral_link=${encodeURIComponent(referralLink)}`),
}

export const affiliateSettingsApi = {
  /** Public — reachable from the "Become an Affiliate" page before any session exists. */
  getPublic: () => requestPublic<PublicAffiliateProgramInfo>('/affiliate-settings/public'),

  get: () => request<AffiliateSettings>('/affiliate-settings'),

  update: (payload: Partial<Omit<AffiliateSettings, 'id'>>) =>
    request<AffiliateSettings>('/affiliate-settings', { method: 'PATCH', body: JSON.stringify(payload) }),
}
