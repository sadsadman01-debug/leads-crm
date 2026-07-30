import type { HandlerEvent } from '@netlify/functions'
import Papa from 'papaparse'
import JSZip from 'jszip'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import { requireAdminOrAbove, resolveOrganizationId, scopeToOrg } from '../lib/permissions.js'
import { loadActiveDefinitions } from '../lib/customFieldValues.js'
import { logAuditEvent } from '../lib/auditLog.js'
import type { AuthedUser } from '../lib/auth.js'

const CHUNK_SIZE = 1000
const MAX_ROWS = 20000
const ID_BATCH_SIZE = 500

/** Fetches every row of a scoped table in chunks, rather than trusting a
 * single request under Supabase/PostgREST's row cap — same pattern as the
 * existing single-table CSV export in importExport.ts, just generalized. */
async function fetchAllScoped(table: string, columns: string, organizationId: string | null) {
  const supabase = getSupabaseAdmin()
  const rows: any[] = []
  for (let offset = 0; offset < MAX_ROWS; offset += CHUNK_SIZE) {
    let query = supabase.from(table).select(columns)
    query = scopeToOrg(query as any, organizationId) as any
    const { data, error } = await query.order('created_at', { ascending: true }).range(offset, offset + CHUNK_SIZE - 1)
    if (error) throw new HttpError(500, error.message)
    rows.push(...(data ?? []))
    if (!data || data.length < CHUNK_SIZE) break
  }
  return rows
}

async function fetchActivitiesForLeads(leadIds: string[]) {
  if (leadIds.length === 0) return []
  const supabase = getSupabaseAdmin()
  const rows: any[] = []
  for (let i = 0; i < leadIds.length; i += ID_BATCH_SIZE) {
    const batch = leadIds.slice(i, i + ID_BATCH_SIZE)
    const { data, error } = await supabase
      .from('lead_activities')
      .select('id, lead_id, type, message, created_by, created_at')
      .in('lead_id', batch)
      .order('created_at', { ascending: true })
    if (error) throw new HttpError(500, error.message)
    rows.push(...(data ?? []))
  }
  return rows
}

function resolveCustomFields(raw: Record<string, any> | null | undefined, defs: { id: string; label: string }[]) {
  const values = raw ?? {}
  const resolved: Record<string, any> = {}
  for (const def of defs) {
    const value = values[def.id]
    resolved[def.label] = Array.isArray(value) ? value.join(', ') : value ?? ''
  }
  return resolved
}

function toCsv(rows: Record<string, any>[]): string {
  if (rows.length === 0) return ''
  return Papa.unparse(rows)
}

function safeFilenamePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9 _-]/g, '').trim().replace(/\s+/g, '_') || 'Export'
}

async function buildExportZip(organizationId: string | null, organizationName: string): Promise<Buffer> {
  const supabase = getSupabaseAdmin()

  const [leads, deals, templates, pipelineStages, dealStages, industries, customFieldDefs, teamMembers, savedReports] =
    await Promise.all([
      fetchAllScoped(
        'leads',
        'id, company_name, contact_name, address, phone, email, website, notes, lead_source, priority, stage_id, industry_id, created_by, assigned_to, custom_fields, created_at, updated_at',
        organizationId
      ),
      fetchAllScoped(
        'deals',
        'id, lead_id, name, value, currency, stage_id, probability, expected_close_date, actual_close_date, outcome_reason, owner_id, notes, custom_fields, created_at, updated_at',
        organizationId
      ),
      fetchAllScoped('templates', 'id, name, subject, body, template_type, created_at, updated_at', organizationId),
      fetchAllScoped('pipeline_stages', 'id, name, position, created_at', organizationId),
      fetchAllScoped('deal_stages', 'id, name, position, default_probability, is_closed, is_won, created_at', organizationId),
      fetchAllScoped('industries', 'id, name, created_at', organizationId),
      fetchAllScoped(
        'custom_field_definitions',
        'id, applies_to, label, field_type, options, required, default_value, display_order, is_active, created_at',
        organizationId
      ),
      fetchAllScoped('profiles', 'id, email, nickname, role, is_active, created_at', organizationId),
      fetchAllScoped(
        'saved_reports',
        'id, created_by, name, report_type, selected_fields, group_by, filters, chart_type, visible_to_all, created_at, updated_at',
        organizationId
      ),
    ])

  const teamMembersOrgOnly = teamMembers.filter((m) => m.role !== 'super_admin')
  const nicknameById = new Map(teamMembersOrgOnly.map((m) => [m.id, m.nickname || m.email]))
  const stageNameById = new Map(pipelineStages.map((s) => [s.id, s.name]))
  const dealStageNameById = new Map(dealStages.map((s) => [s.id, s.name]))
  const industryNameById = new Map(industries.map((i) => [i.id, i.name]))
  const leadCompanyById = new Map(leads.map((l) => [l.id, l.company_name]))

  const leadCustomFieldDefs = await loadActiveDefinitions(organizationId, 'leads')
  const dealCustomFieldDefs = await loadActiveDefinitions(organizationId, 'deals')

  const activities = await fetchActivitiesForLeads(leads.map((l) => l.id))

  // ---- Resolved, display-friendly rows shared by both CSV and JSON ----
  const leadRows = leads.map((l) => ({
    id: l.id,
    company_name: l.company_name,
    contact_name: l.contact_name,
    address: l.address,
    phone: l.phone,
    email: l.email,
    website: l.website,
    notes: l.notes,
    lead_source: l.lead_source,
    priority: l.priority,
    stage: l.stage_id ? stageNameById.get(l.stage_id) ?? null : null,
    industry: l.industry_id ? industryNameById.get(l.industry_id) ?? null : null,
    assigned_to: l.assigned_to ? nicknameById.get(l.assigned_to) ?? null : null,
    custom_fields: resolveCustomFields(l.custom_fields, leadCustomFieldDefs),
    created_at: l.created_at,
    updated_at: l.updated_at,
  }))

  const dealRows = deals.map((d) => ({
    id: d.id,
    name: d.name,
    company_name: leadCompanyById.get(d.lead_id) ?? null,
    value: d.value,
    currency: d.currency,
    stage: d.stage_id ? dealStageNameById.get(d.stage_id) ?? null : null,
    probability: d.probability,
    expected_close_date: d.expected_close_date,
    actual_close_date: d.actual_close_date,
    outcome_reason: d.outcome_reason,
    owner: d.owner_id ? nicknameById.get(d.owner_id) ?? null : null,
    notes: d.notes,
    custom_fields: resolveCustomFields(d.custom_fields, dealCustomFieldDefs),
    created_at: d.created_at,
    updated_at: d.updated_at,
  }))

  const activityRows = activities.map((a) => ({
    id: a.id,
    lead_id: a.lead_id,
    company_name: leadCompanyById.get(a.lead_id) ?? null,
    type: a.type,
    message: a.message,
    actor: a.created_by ? nicknameById.get(a.created_by) ?? null : null,
    created_at: a.created_at,
  }))

  const templateRows = templates.map((t) => ({
    id: t.id,
    name: t.name,
    subject: t.subject,
    body: t.body,
    template_type: t.template_type,
    created_at: t.created_at,
    updated_at: t.updated_at,
  }))

  const teamMemberRows = teamMembersOrgOnly.map((m) => ({
    id: m.id,
    nickname: m.nickname,
    email: m.email,
    role: m.role,
    is_active: m.is_active,
    created_at: m.created_at,
  }))

  const savedReportRows = savedReports.map((r) => ({
    id: r.id,
    name: r.name,
    report_type: r.report_type,
    group_by: r.group_by,
    chart_type: r.chart_type,
    visible_to_all: r.visible_to_all,
    created_by: r.created_by ? nicknameById.get(r.created_by) ?? null : null,
    selected_fields: JSON.stringify(r.selected_fields ?? []),
    filters: JSON.stringify(r.filters ?? {}),
    created_at: r.created_at,
    updated_at: r.updated_at,
  }))

  const customFieldRows = customFieldDefs.map((f) => ({
    id: f.id,
    applies_to: f.applies_to,
    label: f.label,
    field_type: f.field_type,
    options: JSON.stringify(f.options ?? null),
    required: f.required,
    default_value: f.default_value,
    display_order: f.display_order,
    is_active: f.is_active,
    created_at: f.created_at,
  }))

  // ---- Flat CSV rows (custom fields spread into their own labeled columns) ----
  const leadCsvRows = leadRows.map(({ custom_fields, ...rest }) => ({ ...rest, ...custom_fields }))
  const dealCsvRows = dealRows.map(({ custom_fields, ...rest }) => ({ ...rest, ...custom_fields }))

  const generatedAt = new Date().toISOString()
  const readme = `Leadify — Full Data Export
Organization: ${organizationName}
Generated: ${generatedAt}

Files in this archive:
- leads.csv / leads (in full_export.json) — every Lead, with resolved stage/industry/assigned-team-member names and custom field values as their own columns.
- deals.csv / deals — every Deal, with resolved deal stage, linked lead's company name, assigned team member, and custom field values.
- activity_timeline.csv / activities — the timeline of status/stage/deal changes recorded against each lead.
- templates.csv / templates — saved Email/Message templates.
- pipeline_stages.csv, deal_stages.csv, industries.csv, custom_fields.csv — the organization's configuration (not data), i.e. how Leads/Deals are categorized.
- team_members.csv / team_members — nickname, email, and role only (no passwords or other auth data).
- saved_reports.csv / saved_reports — Report Builder configurations.
- full_export.json — the same data as the CSVs above, in one nested/relational JSON document (e.g. each lead includes its own timeline entries), for anyone who wants to reprocess this export programmatically.

This is a point-in-time snapshot generated on request — it is not kept in sync afterward.
`

  const fullJson = {
    meta: {
      organization_name: organizationName,
      organization_id: organizationId,
      generated_at: generatedAt,
      counts: {
        leads: leadRows.length,
        deals: dealRows.length,
        activities: activityRows.length,
        templates: templateRows.length,
        pipeline_stages: pipelineStages.length,
        deal_stages: dealStages.length,
        industries: industries.length,
        custom_fields: customFieldRows.length,
        team_members: teamMemberRows.length,
        saved_reports: savedReportRows.length,
      },
    },
    leads: leadRows.map((l) => ({
      ...l,
      timeline: activityRows.filter((a) => a.lead_id === l.id).map(({ company_name, ...rest }) => rest),
    })),
    deals: dealRows,
    templates: templateRows,
    pipeline_stages: pipelineStages.map((s) => ({ id: s.id, name: s.name, position: s.position, created_at: s.created_at })),
    deal_stages: dealStages,
    industries,
    custom_fields: customFieldRows,
    team_members: teamMemberRows,
    saved_reports: savedReportRows,
  }

  const zip = new JSZip()
  zip.file('README.txt', readme)
  zip.file('full_export.json', JSON.stringify(fullJson, null, 2))
  zip.file('leads.csv', toCsv(leadCsvRows))
  zip.file('deals.csv', toCsv(dealCsvRows))
  zip.file('activity_timeline.csv', toCsv(activityRows))
  zip.file('templates.csv', toCsv(templateRows))
  zip.file('pipeline_stages.csv', toCsv(fullJson.pipeline_stages))
  zip.file('deal_stages.csv', toCsv(dealStages))
  zip.file('industries.csv', toCsv(industries))
  zip.file('custom_fields.csv', toCsv(customFieldRows))
  zip.file('team_members.csv', toCsv(teamMemberRows))
  zip.file('saved_reports.csv', toCsv(savedReportRows))

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

/** Admin (own org) or Super Admin (their personal workspace, or whichever
 * organization they've entered / pass ?organizationId= for — same
 * resolveOrganizationId mechanism used everywhere else). */
export async function generateFullExport(event: HandlerEvent, user: AuthedUser) {
  requireAdminOrAbove(user)
  const orgId = resolveOrganizationId(user, event)
  const supabase = getSupabaseAdmin()

  let organizationName = 'Personal_Workspace'
  if (orgId !== null) {
    const { data: org, error } = await supabase.from('organizations').select('name').eq('id', orgId).maybeSingle()
    if (error) throw new HttpError(500, error.message)
    if (!org) throw new HttpError(404, 'Organization not found')
    organizationName = org.name
  }

  const zipBuffer = await buildExportZip(orgId, organizationName)

  await supabase.from('export_log').insert({ organization_id: orgId, triggered_by: user.id })
  await logAuditEvent('data_export_triggered', user, event, {
    organizationId: orgId,
    metadata: { organization_name: organizationName },
  })

  const dateStr = new Date().toISOString().slice(0, 10)
  const filename = `${safeFilenamePart(organizationName)}_CRM_Export_${dateStr}.zip`

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
    body: zipBuffer.toString('base64'),
    isBase64Encoded: true,
  }
}

/** A simple "who exported, when" audit list — Admin sees only their own
 * organization's entries, Super Admin sees every organization's. */
export async function listExportLog(event: HandlerEvent, user: AuthedUser) {
  requireAdminOrAbove(user)
  const orgId = resolveOrganizationId(user, event)
  const supabase = getSupabaseAdmin()

  let query = supabase.from('export_log').select('id, organization_id, triggered_by, created_at')
  query = scopeToOrg(query as any, orgId) as any
  const { data, error } = await query.order('created_at', { ascending: false }).limit(20)
  if (error) throw new HttpError(500, error.message)
  const rows = data ?? []

  const profileIds = [...new Set(rows.map((r) => r.triggered_by).filter(Boolean))] as string[]
  const { data: profiles } =
    profileIds.length > 0
      ? await supabase.from('profiles').select('id, nickname, email').in('id', profileIds)
      : { data: [] as any[] }
  const profileById = new Map((profiles ?? []).map((p: any) => [p.id, p]))

  return json(200, {
    entries: rows.map((r) => ({
      ...r,
      triggered_by_name: r.triggered_by ? profileById.get(r.triggered_by)?.nickname || profileById.get(r.triggered_by)?.email || null : null,
    })),
  })
}
