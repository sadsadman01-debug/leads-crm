import { supabase } from './supabase'
import type { DashboardSummary, Lead, LeadFilters, LeadListResponse, LeadStatus, Tag } from '@/types/lead'

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
  rows: (rows: Record<string, string>[]) =>
    request<ImportResult>('/leads/import', { method: 'POST', body: JSON.stringify({ rows }) }),

  googleSheet: (sheetUrl: string) =>
    request<ImportResult>('/leads/import/sheet', { method: 'POST', body: JSON.stringify({ sheetUrl }) }),
}

export const exportApi = {
  async downloadCsv(params: { search?: string; filters?: LeadFilters } = {}) {
    const qs = new URLSearchParams()
    if (params.search) qs.set('search', params.search)
    if (params.filters && Object.keys(params.filters).length > 0) {
      qs.set('filters', JSON.stringify(params.filters))
    }

    const res = await fetch(`/api/leads/export?${qs.toString()}`, { headers: await authHeader() })
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
  summary: (granularity: 'day' | 'week' | 'month' = 'day') =>
    request<DashboardSummary>(`/dashboard/summary?granularity=${granularity}`),
}

export const tagsApi = {
  list: () => request<{ tags: Tag[] }>('/tags'),
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
