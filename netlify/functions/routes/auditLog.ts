import type { HandlerEvent } from '@netlify/functions'
import Papa from 'papaparse'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import { requireSuperAdmin } from '../lib/permissions.js'
import type { AuthedUser } from '../lib/auth.js'

const COLUMNS = 'id, event_type, actor_profile_id, actor_role, organization_id, target_profile_id, metadata, ip_address, created_at'

const PAGE_SIZE_DEFAULT = 50
const MAX_EXPORT_ROWS = 20000
const CHUNK_SIZE = 1000

interface ParsedFilters {
  eventTypes: string[]
  organizationId: string | null
  actorProfileId: string | null
  dateFrom: string | null
  dateTo: string | null
  search: string
}

function parseFilters(params: Record<string, string | undefined> | null): ParsedFilters {
  const p = params ?? {}
  return {
    eventTypes: (p.eventTypes ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    organizationId: p.organizationId || null,
    actorProfileId: p.actorProfileId || null,
    dateFrom: p.dateFrom || null,
    dateTo: p.dateTo || null,
    search: (p.search ?? '').trim(),
  }
}

/** Resolves a free-text search into the set of profile ids whose nickname or
 * email matches — an audit row is a match if its actor OR target is one of
 * these. Returns null when there's no search text (meaning "don't filter"),
 * or an empty array when there's search text but nothing matched (meaning
 * "filter to nothing"), so the caller can tell the two cases apart. */
async function resolveSearchProfileIds(search: string): Promise<string[] | null> {
  if (!search) return null
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .or(`nickname.ilike.%${search}%,email.ilike.%${search}%`)
  if (error) throw new HttpError(500, error.message)
  return (data ?? []).map((p) => p.id)
}

function applyFilters<T extends { in: (c: string, v: any[]) => T; eq: (c: string, v: any) => T; gte: (c: string, v: any) => T; lte: (c: string, v: any) => T; or: (s: string) => T }>(
  query: T,
  filters: ParsedFilters,
  searchProfileIds: string[] | null
): T {
  let q = query
  if (filters.eventTypes.length > 0) q = q.in('event_type', filters.eventTypes)
  if (filters.organizationId) q = q.eq('organization_id', filters.organizationId)
  if (filters.actorProfileId) q = q.eq('actor_profile_id', filters.actorProfileId)
  if (filters.dateFrom) q = q.gte('created_at', filters.dateFrom)
  if (filters.dateTo) q = q.lte('created_at', filters.dateTo)
  if (searchProfileIds !== null) {
    const ids = searchProfileIds.length > 0 ? searchProfileIds.join(',') : '00000000-0000-0000-0000-000000000000'
    q = q.or(`actor_profile_id.in.(${ids}),target_profile_id.in.(${ids})`)
  }
  return q
}

async function attachNames(rows: any[]) {
  const supabase = getSupabaseAdmin()
  const profileIds = [...new Set([...rows.map((r) => r.actor_profile_id), ...rows.map((r) => r.target_profile_id)].filter(Boolean))] as string[]
  const orgIds = [...new Set(rows.map((r) => r.organization_id).filter(Boolean))] as string[]

  const [{ data: profiles }, { data: orgs }] = await Promise.all([
    profileIds.length > 0
      ? supabase.from('profiles').select('id, nickname, email').in('id', profileIds)
      : Promise.resolve({ data: [] as any[] }),
    orgIds.length > 0
      ? supabase.from('organizations').select('id, name').in('id', orgIds)
      : Promise.resolve({ data: [] as any[] }),
  ])
  const profileById = new Map((profiles ?? []).map((p: any) => [p.id, p]))
  const orgNameById = new Map((orgs ?? []).map((o: any) => [o.id, o.name]))

  return rows.map((r) => ({
    ...r,
    actor_nickname: r.actor_profile_id ? profileById.get(r.actor_profile_id)?.nickname || profileById.get(r.actor_profile_id)?.email || null : null,
    target_nickname: r.target_profile_id ? profileById.get(r.target_profile_id)?.nickname || profileById.get(r.target_profile_id)?.email || null : null,
    organization_name: r.organization_id ? orgNameById.get(r.organization_id) ?? null : null,
  }))
}

export async function listAuditLog(event: HandlerEvent, user: AuthedUser) {
  requireSuperAdmin(user)
  const supabase = getSupabaseAdmin()
  const filters = parseFilters(event.queryStringParameters)
  const searchProfileIds = await resolveSearchProfileIds(filters.search)

  const page = Math.max(1, Number(event.queryStringParameters?.page) || 1)
  const pageSize = Math.max(1, Math.min(200, Number(event.queryStringParameters?.pageSize) || PAGE_SIZE_DEFAULT))
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = supabase.from('audit_log').select(COLUMNS, { count: 'exact' })
  query = applyFilters(query as any, filters, searchProfileIds) as any
  const { data, error, count } = await query.order('created_at', { ascending: false }).range(from, to)
  if (error) throw new HttpError(500, error.message)

  const entries = await attachNames(data ?? [])
  return json(200, { entries, total: count ?? 0 })
}

function toCsv(rows: Record<string, any>[]): string {
  if (rows.length === 0) return ''
  return Papa.unparse(rows)
}

/** Same filters as listAuditLog, but fetches the entire filtered set (up to a
 * hard cap, matching the pattern in dataExport.ts) rather than one page, for
 * the Super Admin's own offline record-keeping/compliance needs. */
export async function exportAuditLogCsv(event: HandlerEvent, user: AuthedUser) {
  requireSuperAdmin(user)
  const supabase = getSupabaseAdmin()
  const filters = parseFilters(event.queryStringParameters)
  const searchProfileIds = await resolveSearchProfileIds(filters.search)

  const rows: any[] = []
  for (let offset = 0; offset < MAX_EXPORT_ROWS; offset += CHUNK_SIZE) {
    let query = supabase.from('audit_log').select(COLUMNS)
    query = applyFilters(query as any, filters, searchProfileIds) as any
    const { data, error } = await query.order('created_at', { ascending: false }).range(offset, offset + CHUNK_SIZE - 1)
    if (error) throw new HttpError(500, error.message)
    rows.push(...(data ?? []))
    if (!data || data.length < CHUNK_SIZE) break
  }

  const entries = await attachNames(rows)
  const csvRows = entries.map((e) => ({
    timestamp: e.created_at,
    event_type: e.event_type,
    actor: e.actor_nickname ?? '',
    actor_role: e.actor_role ?? '',
    organization: e.organization_name ?? '',
    target: e.target_nickname ?? '',
    ip_address: e.ip_address ?? '',
    metadata: JSON.stringify(e.metadata ?? {}),
  }))

  const dateStr = new Date().toISOString().slice(0, 10)
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="Audit_Log_${dateStr}.csv"`,
    },
    body: toCsv(csvRows),
  }
}
