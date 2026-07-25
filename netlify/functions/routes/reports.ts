import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import { requireAdminOrAbove, isAdminOrAbove, resolveOrganizationId, requireRowInOrgScope } from '../lib/permissions.js'
import { runLeadsReport, runDealsReport, runActivityReport, type ReportType, type ReportFilters } from '../lib/reportEngine.js'
import type { AuthedUser } from '../lib/auth.js'

const REPORT_COLUMNS = 'id, name, report_type, selected_fields, group_by, filters, chart_type, visible_to_all, created_by, created_at, updated_at'

export async function listSavedReports(event: HandlerEvent, user: AuthedUser) {
  const supabase = getSupabaseAdmin()
  const orgId = resolveOrganizationId(user, event)
  let query = supabase.from('saved_reports').select(REPORT_COLUMNS)
  query = orgId === null ? query.is('organization_id', null) : query.eq('organization_id', orgId)
  if (!isAdminOrAbove(user)) query = query.or(`visible_to_all.eq.true,created_by.eq.${user.id}`)
  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) throw new HttpError(500, error.message)
  return json(200, { reports: data ?? [] })
}

export async function createSavedReport(event: HandlerEvent, user: AuthedUser) {
  requireAdminOrAbove(user)
  const supabase = getSupabaseAdmin()
  const orgId = resolveOrganizationId(user, event)
  const body = JSON.parse(event.body || '{}')

  if (!body.name?.trim()) throw new HttpError(400, 'name is required')
  if (!['leads', 'deals', 'activity'].includes(body.report_type)) throw new HttpError(400, 'Invalid report_type')

  const { data, error } = await supabase
    .from('saved_reports')
    .insert({
      organization_id: orgId,
      created_by: user.id,
      name: body.name.trim(),
      report_type: body.report_type,
      selected_fields: body.selected_fields ?? [],
      group_by: body.group_by || null,
      filters: body.filters ?? {},
      chart_type: body.chart_type ?? 'table',
      visible_to_all: Boolean(body.visible_to_all),
    })
    .select(REPORT_COLUMNS)
    .single()

  if (error) throw new HttpError(500, error.message)
  return json(201, data)
}

export async function updateSavedReport(id: string, event: HandlerEvent, user: AuthedUser) {
  requireAdminOrAbove(user)
  const orgId = resolveOrganizationId(user, event)
  await requireRowInOrgScope('saved_reports', id, orgId)
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')

  const update: Record<string, any> = {}
  if ('name' in body) update.name = body.name.trim()
  if ('selected_fields' in body) update.selected_fields = body.selected_fields
  if ('group_by' in body) update.group_by = body.group_by || null
  if ('filters' in body) update.filters = body.filters
  if ('chart_type' in body) update.chart_type = body.chart_type
  if ('visible_to_all' in body) update.visible_to_all = Boolean(body.visible_to_all)

  if (Object.keys(update).length === 0) throw new HttpError(400, 'Nothing to update')

  const { data, error } = await supabase.from('saved_reports').update(update).eq('id', id).select(REPORT_COLUMNS).single()
  if (error) throw new HttpError(500, error.message)
  return json(200, data)
}

export async function deleteSavedReport(id: string, event: HandlerEvent, user: AuthedUser) {
  requireAdminOrAbove(user)
  const orgId = resolveOrganizationId(user, event)
  await requireRowInOrgScope('saved_reports', id, orgId)
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('saved_reports').delete().eq('id', id)
  if (error) throw new HttpError(500, error.message)
  return json(200, { success: true })
}

/** POST /reports/run — body: { report_type, group_by?, filters?, displayCurrency? }.
 * Any authenticated org member can run a report (read-only aggregation); only
 * admins/super admins can save one. Non-admins are still fully org-scoped. */
export async function runReport(event: HandlerEvent, user: AuthedUser) {
  const orgId = resolveOrganizationId(user, event)
  const body = JSON.parse(event.body || '{}')
  const reportType = body.report_type as ReportType
  const groupBy: string | undefined = body.group_by || undefined
  const filters: ReportFilters = body.filters ?? {}

  if (reportType === 'leads') return json(200, await runLeadsReport(orgId, groupBy, filters))
  if (reportType === 'deals') return json(200, await runDealsReport(orgId, groupBy, filters, body.displayCurrency || 'USD'))
  if (reportType === 'activity') return json(200, await runActivityReport(orgId, groupBy, filters))
  throw new HttpError(400, 'Invalid report_type')
}
