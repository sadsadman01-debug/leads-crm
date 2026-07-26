import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import { requireFeaturePermission, isAdminOrAbove, resolveOrganizationId } from '../lib/permissions.js'
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
  requireFeaturePermission(user, 'canAccessReportBuilder')
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

/** Admins/super admins may edit any report; a User with canAccessReportBuilder
 * may only edit reports they themselves created — matching the RLS backstop. */
async function requireReportEditAccess(id: string, user: AuthedUser, orgId: string | null) {
  requireFeaturePermission(user, 'canAccessReportBuilder')
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('saved_reports').select('organization_id, created_by').eq('id', id).maybeSingle()
  if (error) throw new HttpError(500, error.message)
  if (!data) throw new HttpError(404, 'Not found')
  const rowOrg = data.organization_id ?? null
  if (rowOrg !== orgId) throw new HttpError(404, 'Not found')
  if (!isAdminOrAbove(user) && data.created_by !== user.id) {
    throw new HttpError(403, 'You can only edit reports you created')
  }
}

export async function updateSavedReport(id: string, event: HandlerEvent, user: AuthedUser) {
  const orgId = resolveOrganizationId(user, event)
  await requireReportEditAccess(id, user, orgId)
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
  const orgId = resolveOrganizationId(user, event)
  await requireReportEditAccess(id, user, orgId)
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('saved_reports').delete().eq('id', id)
  if (error) throw new HttpError(500, error.message)
  return json(200, { success: true })
}

/** Deals-report rows carry monetary fields under different keys depending on
 * whether the report is grouped (totalValue/avgValue) or a flat list
 * (value/converted_value) — null both out rather than sending the real number. */
function maskDealsReportResult(result: any) {
  return {
    ...result,
    values_masked: true,
    rows: (result.rows ?? []).map((r: any) => {
      if ('totalValue' in r) return { ...r, totalValue: null, avgValue: null }
      if ('value' in r) return { ...r, value: null, converted_value: null }
      return r
    }),
  }
}

/** POST /reports/run — body: { report_type, group_by?, filters?, displayCurrency? }.
 * Any authenticated org member can run a report (read-only aggregation); only
 * admins/super admins (or a User with canAccessReportBuilder) can save one.
 * Non-admins are still fully org-scoped, and deal monetary fields are masked
 * for a caller lacking canViewDealValues, same as everywhere else deals show up. */
export async function runReport(event: HandlerEvent, user: AuthedUser) {
  const orgId = resolveOrganizationId(user, event)
  const body = JSON.parse(event.body || '{}')
  const reportType = body.report_type as ReportType
  const groupBy: string | undefined = body.group_by || undefined
  const filters: ReportFilters = body.filters ?? {}

  if (reportType === 'leads') return json(200, await runLeadsReport(orgId, groupBy, filters))
  if (reportType === 'deals') {
    const result = await runDealsReport(orgId, groupBy, filters, body.displayCurrency || 'USD')
    const canViewValues = isAdminOrAbove(user) || user.permissions.canViewDealValues
    return json(200, canViewValues ? result : maskDealsReportResult(result))
  }
  if (reportType === 'activity') return json(200, await runActivityReport(orgId, groupBy, filters))
  throw new HttpError(400, 'Invalid report_type')
}
