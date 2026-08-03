import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import { ensureTagIds } from '../lib/tags.js'
import { computeReminder } from '../lib/reminders.js'
import { computeLeadScore, computeSequenceCompletionCounts } from '../lib/scoring.js'
import { logActivity, logActivities } from '../lib/activities.js'
import type { AuthedUser } from '../lib/auth.js'
import {
  requireCanModifyRecord,
  requireCanDeleteRecord,
  isAdminOrAbove,
  isRecordVisible,
  resolveOrganizationId,
  scopeToOrg,
  applyLeadVisibility,
  requireAdminOrAbove,
  requireAal2IfEnrolled,
} from '../lib/permissions.js'
import { loadActiveDefinitions, requireRequiredFieldsFilled, mergeCustomFieldValues } from '../lib/customFieldValues.js'
import { notifyAssignment } from '../lib/notifications.js'
import { logAuditEvent } from '../lib/auditLog.js'
import { findLeadDuplicatePairs, groupPairsIntoClusters, dismissalKey } from '../lib/duplicateMatch.js'

const OUTREACH_PROGRESS_SELECT = `
  lead_outreach_progress (
    outreach_sequence_stage_id, completed_at, due_date,
    outreach_sequence_stages ( channel, stage_number, stage_label, is_active )
  )
`

export const LEAD_SELECT = `
  id, company_name, contact_name, address, phone, email, website, notes, lead_source, priority,
  stage_id, industry_id, created_by, assigned_to, organization_id, custom_fields, created_at, updated_at,
  lead_status ( * ),
  lead_tags ( tags ( id, name ) ),
  lead_social_profiles ( id, platform, url ),
  ${OUTREACH_PROGRESS_SELECT}
`

/** Flattens the joined lead_outreach_progress rows into a simpler shape the
 * frontend consumes directly (channel/stage_number/stage_label inlined
 * rather than nested), dropping any row whose stage has since been
 * deactivated (deactivated stages stop being "current" but their history
 * is never deleted — this just excludes them from the live checklist/score). */
function normalizeOutreachProgress(rows: any[] | undefined): any[] {
  return (rows ?? [])
    .filter((r) => r.outreach_sequence_stages?.is_active)
    .map((r) => ({
      outreach_sequence_stage_id: r.outreach_sequence_stage_id,
      channel: r.outreach_sequence_stages.channel,
      stage_number: r.outreach_sequence_stages.stage_number,
      stage_label: r.outreach_sequence_stages.stage_label,
      completed_at: r.completed_at,
      due_date: r.due_date,
    }))
}

export function normalizeLead(row: any) {
  if (!row) return row
  const { lead_tags, lead_social_profiles, lead_status, lead_outreach_progress, ...rest } = row
  const status = Array.isArray(lead_status) ? lead_status[0] : lead_status
  const outreachProgress = normalizeOutreachProgress(lead_outreach_progress)
  const sequenceCounts = computeSequenceCompletionCounts(lead_outreach_progress)
  return {
    ...rest,
    status: status ? { ...status, ...computeReminder(lead_outreach_progress, status) } : status,
    outreach_progress: outreachProgress,
    ...computeLeadScore(status, rest.priority, sequenceCounts),
    social_profiles: lead_social_profiles ?? [],
    tags: (lead_tags ?? []).map((t: any) => t.tags).filter(Boolean),
  }
}

export interface LeadFilters {
  priority?: string
  leadSource?: string
  tagIds?: string[]
  statusChecks?: Array<{ field: string; value: boolean }>
  outreachStageId?: string
  dateFrom?: string
  dateTo?: string
  hasWebsite?: boolean
  hasSocialProfile?: boolean
  industryId?: string
  assignedTo?: string
}

export function parseFilters(params: Record<string, string | undefined>): LeadFilters {
  if (!params.filters) return {}
  try {
    const parsed = JSON.parse(params.filters)
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

/**
 * Filters spanning a join (status toggles, tags, has-social-profile) are resolved to a
 * set of matching lead ids first, then intersected — this sidesteps PostgREST's
 * embedded-resource filter semantics (which filter the nested array, not the parent
 * row, unless every join is hinted !inner) in favor of something easy to reason about.
 * These candidate ids are NOT organization-scoped on their own (the sub-tables don't
 * carry organization_id) — that's fine, since the caller always intersects them with
 * the main `leads` query, which IS scoped by organization_id; no data ever returns
 * beyond what that scoped query allows.
 * Returns null when no join-based filters are active (i.e. no id constraint needed),
 * or a Set of allowed lead ids (possibly empty, meaning "no matches").
 */
export async function resolveJoinFilteredIds(filters: LeadFilters): Promise<Set<string> | null> {
  const supabase = getSupabaseAdmin()
  let result: Set<string> | null = null

  function intersect(ids: string[]) {
    const next = new Set(ids)
    result = result === null ? next : new Set([...result].filter((id) => next.has(id)))
  }

  if (filters.statusChecks && filters.statusChecks.length > 0) {
    let q = supabase.from('lead_status').select('lead_id')
    for (const check of filters.statusChecks) {
      if (!(check.field in STATUS_FIELDS)) continue
      q = q.eq(check.field, Boolean(check.value))
    }
    const { data, error } = await q
    if (error) throw new HttpError(500, error.message)
    intersect((data ?? []).map((r: any) => r.lead_id))
  }

  if (filters.outreachStageId) {
    const { data, error } = await supabase
      .from('lead_outreach_progress')
      .select('lead_id')
      .eq('outreach_sequence_stage_id', filters.outreachStageId)
      .not('completed_at', 'is', null)
    if (error) throw new HttpError(500, error.message)
    intersect((data ?? []).map((r: any) => r.lead_id))
  }

  if (filters.tagIds && filters.tagIds.length > 0) {
    const { data, error } = await supabase.from('lead_tags').select('lead_id').in('tag_id', filters.tagIds)
    if (error) throw new HttpError(500, error.message)
    intersect([...new Set((data ?? []).map((r: any) => r.lead_id))])
  }

  if (filters.hasSocialProfile) {
    const { data, error } = await supabase.from('lead_social_profiles').select('lead_id')
    if (error) throw new HttpError(500, error.message)
    intersect([...new Set((data ?? []).map((r: any) => r.lead_id))])
  }

  return result
}

export function applyColumnFilters<T extends { eq: any; not: any; gte: any; lte: any; or: any }>(
  query: T,
  filters: LeadFilters,
  search: string
): T {
  let q = query
  if (search) {
    const like = `%${search}%`
    q = q.or(
      `company_name.ilike.${like},phone.ilike.${like},email.ilike.${like},address.ilike.${like}`
    )
  }
  if (filters.priority) q = q.eq('priority', filters.priority)
  if (filters.leadSource) q = q.eq('lead_source', filters.leadSource)
  if (filters.industryId) q = q.eq('industry_id', filters.industryId)
  if (filters.assignedTo) q = q.eq('assigned_to', filters.assignedTo)
  if (filters.dateFrom) q = q.gte('created_at', filters.dateFrom)
  if (filters.dateTo) q = q.lte('created_at', filters.dateTo)
  if (filters.hasWebsite) {
    q = q.not('website', 'is', null).not('website', 'eq', '')
  }
  return q
}

export async function listLeads(event: HandlerEvent, user: AuthedUser) {
  const supabase = getSupabaseAdmin()
  const orgId = resolveOrganizationId(user, event)
  const params = event.queryStringParameters ?? {}
  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1)
  const pageSize = Math.min(100, Math.max(1, parseInt(params.pageSize ?? '20', 10) || 20))
  const search = (params.search ?? '').trim()
  const sortBy = ['company_name', 'created_at', 'updated_at', 'priority'].includes(params.sortBy ?? '')
    ? params.sortBy!
    : 'created_at'
  const sortOrder = params.sortOrder === 'asc' ? true : false
  const filters = parseFilters(params)

  const allowedIds = await resolveJoinFilteredIds(filters)
  if (allowedIds !== null && allowedIds.size === 0) {
    return json(200, { leads: [], page, pageSize, total: 0 })
  }

  let query = supabase.from('leads').select(LEAD_SELECT, { count: 'exact' })
  query = scopeToOrg(query as any, orgId) as any
  query = applyLeadVisibility(query as any, user) as any
  query = applyColumnFilters(query as any, filters, search) as any
  if (allowedIds !== null) query = query.in('id', [...allowedIds])

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const { data, error, count } = await query
    .order(sortBy, { ascending: sortOrder })
    .range(from, to)

  if (error) throw new HttpError(500, error.message)

  return json(200, {
    leads: (data ?? []).map(normalizeLead),
    page,
    pageSize,
    total: count ?? 0,
  })
}

export async function checkDuplicate(event: HandlerEvent, user: AuthedUser) {
  const supabase = getSupabaseAdmin()
  const orgId = resolveOrganizationId(user, event)
  const body = JSON.parse(event.body || '{}')
  const { company_name, phone, email, excludeId } = body

  const filters: string[] = []
  if (company_name?.trim()) filters.push(`company_name.ilike.${company_name.trim()}`)
  if (phone?.trim()) filters.push(`phone.eq.${phone.trim()}`)
  if (email?.trim()) filters.push(`email.ilike.${email.trim()}`)

  if (filters.length === 0) return json(200, { matches: [] })

  let query = supabase
    .from('leads')
    .select('id, company_name, phone, email')
    .or(filters.join(','))
  query = scopeToOrg(query as any, orgId) as any

  if (excludeId) query = query.neq('id', excludeId)

  const { data, error } = await query.limit(5)
  if (error) throw new HttpError(500, error.message)

  return json(200, { matches: data ?? [] })
}

async function replaceTags(leadId: string, tagNames: string[], organizationId: string | null) {
  const supabase = getSupabaseAdmin()
  const tagIds = (await ensureTagIds(tagNames, organizationId)).map((t) => t.id)

  const { error: delErr } = await supabase.from('lead_tags').delete().eq('lead_id', leadId)
  if (delErr) throw new HttpError(500, delErr.message)

  if (tagIds.length > 0) {
    const { error: insErr } = await supabase
      .from('lead_tags')
      .insert(tagIds.map((tag_id) => ({ lead_id: leadId, tag_id })))
    if (insErr) throw new HttpError(500, insErr.message)
  }
}

async function replaceSocialProfiles(leadId: string, profiles: Array<{ platform: string; url: string }>) {
  const supabase = getSupabaseAdmin()
  const { error: delErr } = await supabase.from('lead_social_profiles').delete().eq('lead_id', leadId)
  if (delErr) throw new HttpError(500, delErr.message)

  const clean = (profiles ?? []).filter((p) => p.platform?.trim() && p.url?.trim())
  if (clean.length > 0) {
    const { error: insErr } = await supabase.from('lead_social_profiles').insert(
      clean.map((p) => ({ lead_id: leadId, platform: p.platform.trim(), url: p.url.trim() }))
    )
    if (insErr) throw new HttpError(500, insErr.message)
  }
}

export async function createLead(event: HandlerEvent, user: AuthedUser) {
  const supabase = getSupabaseAdmin()
  const orgId = resolveOrganizationId(user, event)
  const body = JSON.parse(event.body || '{}')

  if (!body.company_name?.trim()) {
    throw new HttpError(400, 'company_name is required')
  }

  // New leads auto-assign to the creator; reassigning at creation time is
  // restricted to admins/super admins (a User can only ever create leads for themselves).
  const assignedTo = isAdminOrAbove(user) && body.assigned_to ? body.assigned_to : user.id

  const leadFieldDefs = await loadActiveDefinitions(orgId, 'leads')
  const incomingCustomFields = body.custom_fields ?? {}
  requireRequiredFieldsFilled(leadFieldDefs, incomingCustomFields)
  const { merged: customFields } = mergeCustomFieldValues({}, incomingCustomFields, leadFieldDefs)

  const { data, error } = await supabase
    .from('leads')
    .insert({
      company_name: body.company_name.trim(),
      contact_name: body.contact_name ?? null,
      address: body.address ?? null,
      phone: body.phone ?? null,
      email: body.email ?? null,
      website: body.website ?? null,
      notes: body.notes ?? null,
      lead_source: body.lead_source ?? 'Manual Entry',
      priority: body.priority ?? 'Medium',
      industry_id: body.industry_id ?? null,
      created_by: user.id,
      assigned_to: assignedTo,
      organization_id: orgId,
      custom_fields: customFields,
    })
    .select('id')
    .single()

  if (error) throw new HttpError(500, error.message)

  const leadId = data.id
  await Promise.all([
    replaceTags(leadId, body.tags ?? [], orgId),
    replaceSocialProfiles(leadId, body.social_profiles ?? []),
    logActivity(leadId, 'created', 'Lead created', user.id),
  ])

  await notifyAssignment({
    assigneeId: assignedTo,
    actorId: user.id,
    organizationId: orgId,
    type: 'lead_assigned',
    title: 'New lead assigned to you',
    message: `"${body.company_name.trim()}" was assigned to you.`,
    linkRoute: `/leads/${leadId}`,
    entityId: leadId,
    entityType: 'lead',
  })

  return getLead(leadId, orgId, user)
}

export async function getLead(id: string, organizationId: string | null, user: AuthedUser) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('leads').select(LEAD_SELECT).eq('id', id).single()
  if (error || !data) throw new HttpError(404, 'Lead not found')
  if (user.role !== 'super_admin' && data.organization_id !== organizationId) throw new HttpError(404, 'Lead not found')
  if (!isRecordVisible(user, data, 'lead')) throw new HttpError(404, 'Lead not found')

  const { data: attachments, error: attErr } = await supabase
    .from('lead_attachments')
    .select('id, file_name, storage_path, content_type, size_bytes, uploaded_at')
    .eq('lead_id', id)
    .order('uploaded_at', { ascending: false })
  if (attErr) throw new HttpError(500, attErr.message)

  return json(200, { ...normalizeLead(data), attachments: attachments ?? [] })
}

async function fetchLeadInScope(id: string, user: AuthedUser, event: HandlerEvent) {
  const supabase = getSupabaseAdmin()
  const orgId = resolveOrganizationId(user, event)
  const { data: existing, error: fetchErr } = await supabase
    .from('leads')
    .select('id, company_name, assigned_to, created_by, organization_id, custom_fields')
    .eq('id', id)
    .single()
  if (fetchErr || !existing) throw new HttpError(404, 'Lead not found')
  if (user.role !== 'super_admin' && existing.organization_id !== orgId) throw new HttpError(404, 'Lead not found')
  return { existing, orgId }
}

export async function updateLead(id: string, event: HandlerEvent, user: AuthedUser) {
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')

  const { existing, orgId } = await fetchLeadInScope(id, user, event)
  requireCanModifyRecord(user, existing, 'lead')

  const updatable: Record<string, any> = {}
  for (const key of ['company_name', 'contact_name', 'address', 'phone', 'email', 'website', 'notes', 'lead_source', 'priority', 'industry_id']) {
    if (key in body) updatable[key] = body[key]
  }

  // Reassignment is restricted to admins/super admins, or the current owner
  // handing the lead off to someone else.
  let newAssignee: string | null = null
  if ('assigned_to' in body) {
    if (!isAdminOrAbove(user) && existing.assigned_to !== user.id) {
      throw new HttpError(403, 'Only an admin or the current owner can reassign this lead')
    }
    newAssignee = body.assigned_to || null
    updatable.assigned_to = newAssignee
  }

  let customFieldMessages: string[] = []
  if ('custom_fields' in body) {
    const defs = await loadActiveDefinitions(existing.organization_id, 'leads')
    const { merged, messages } = mergeCustomFieldValues(existing.custom_fields ?? {}, body.custom_fields ?? {}, defs)
    updatable.custom_fields = merged
    customFieldMessages = messages
  }

  if (Object.keys(updatable).length > 0) {
    const { error } = await supabase.from('leads').update(updatable).eq('id', id)
    if (error) throw new HttpError(500, error.message)
  }

  if ('assigned_to' in body) {
    await logActivity(id, 'assignment', 'Assigned owner changed', user.id)
    await notifyAssignment({
      assigneeId: newAssignee,
      actorId: user.id,
      organizationId: existing.organization_id,
      type: 'lead_assigned',
      title: 'Lead assigned to you',
      message: `"${existing.company_name}" was reassigned to you.`,
      linkRoute: `/leads/${id}`,
      entityId: id,
      entityType: 'lead',
    })
  }
  if (customFieldMessages.length > 0) {
    await logActivities(customFieldMessages.map((message) => ({ leadId: id, type: 'custom_field', message, userId: user.id })))
  }
  if ('tags' in body) {
    await replaceTags(id, body.tags ?? [], existing.organization_id)
    const tagNames = (body.tags ?? []) as string[]
    await logActivity(
      id,
      'tags',
      tagNames.length > 0 ? `Tags set to: ${tagNames.join(', ')}` : 'Tags cleared',
      user.id
    )
  }
  if ('social_profiles' in body) await replaceSocialProfiles(id, body.social_profiles ?? [])
  if ('industry_id' in body) await logActivity(id, 'industry', 'Industry updated', user.id)

  return getLead(id, orgId, user)
}

export async function deleteLead(id: string, event: HandlerEvent, user: AuthedUser) {
  const supabase = getSupabaseAdmin()
  const { existing } = await fetchLeadInScope(id, user, event)
  requireCanDeleteRecord(user, existing, 'lead')

  const { error } = await supabase.from('leads').delete().eq('id', id)
  if (error) throw new HttpError(500, error.message)
  return json(200, { success: true })
}

/** The non-sequence outreach toggles — Cold-Contact + Follow-up completion
 * for Email/WhatsApp/LinkedIn is handled by updateOutreachProgress/
 * lead_outreach_progress instead (see below), per the configurable
 * outreach-sequence restructuring. */
export const STATUS_FIELDS: Record<string, { flagField: string; tsField: string; label: string }> = {
  replied: { flagField: 'replied', tsField: 'replied_at', label: 'Replied' },
  no_whatsapp: { flagField: 'no_whatsapp', tsField: 'no_whatsapp_at', label: 'No WhatsApp Available' },
  email_invalid: { flagField: 'email_invalid', tsField: 'email_invalid_at', label: 'Email Invalid' },
  phone_invalid: { flagField: 'phone_invalid', tsField: 'phone_invalid_at', label: 'Phone Invalid' },
  converted: { flagField: 'converted', tsField: 'converted_at', label: 'Converted to Client' },
  sms_sent: { flagField: 'sms_sent', tsField: 'sms_sent_at', label: 'SMS Sent' },
  cold_call_made: { flagField: 'cold_call_made', tsField: 'cold_call_made_at', label: 'Cold Call Made' },
}

export async function updateLeadStatus(id: string, event: HandlerEvent, user: AuthedUser) {
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')

  const { existing, orgId } = await fetchLeadInScope(id, user, event)
  requireCanModifyRecord(user, existing, 'lead')

  const update: Record<string, any> = {}
  const activityMessages: string[] = []

  for (const [key, { flagField, tsField, label }] of Object.entries(STATUS_FIELDS)) {
    if (key in body) {
      const value = Boolean(body[key])
      update[flagField] = value
      update[tsField] = value ? new Date().toISOString() : null
      activityMessages.push(`${label} marked ${value ? 'done' : 'not done'}`)
    }
  }

  if ('reply_sentiment' in body) {
    update.reply_sentiment = body.reply_sentiment || null
    if (update.reply_sentiment) activityMessages.push(`Reply sentiment set to ${update.reply_sentiment}`)
  }
  if ('cold_call_outcome' in body) {
    update.cold_call_outcome = body.cold_call_outcome || null
    if (update.cold_call_outcome) activityMessages.push(`Cold call outcome: ${update.cold_call_outcome}`)
  }

  if (Object.keys(update).length === 0) {
    throw new HttpError(400, 'No recognized status fields in request body')
  }

  const { data, error } = await supabase
    .from('lead_status')
    .update(update)
    .eq('lead_id', id)
    .select('*')
    .single()

  if (error) throw new HttpError(500, error.message)

  await logActivities(activityMessages.map((message) => ({ leadId: id, type: 'status', message, userId: user.id })))

  const { data: progressRows } = await supabase.from('lead_outreach_progress').select(OUTREACH_PROGRESS_SELECT).eq('lead_id', id)
  return json(200, { ...data, ...computeReminder(progressRows as any, data) })
}

/** Body: { outreach_sequence_stage_id, completed }. Marks one configured
 * outreach-sequence stage complete/incomplete for this lead — the dynamic
 * replacement for the old fixed cold_email_sent/followup1_sent/etc. toggles.
 * On completion, unlocks the next active stage in the same channel (smallest
 * stage_number greater than this one) with a due date computed from ITS
 * currently configured interval_days — later interval changes never
 * retroactively move an already-set due date. */
export async function updateOutreachProgress(id: string, event: HandlerEvent, user: AuthedUser) {
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')
  const stageId = body.outreach_sequence_stage_id
  const completed = Boolean(body.completed)
  if (!stageId) throw new HttpError(400, 'outreach_sequence_stage_id is required')

  const { existing, orgId } = await fetchLeadInScope(id, user, event)
  requireCanModifyRecord(user, existing, 'lead')

  let stageQuery = supabase
    .from('outreach_sequence_stages')
    .select('id, channel, stage_number, stage_label, is_active')
    .eq('id', stageId)
  stageQuery = scopeToOrg(stageQuery as any, orgId) as any
  const { data: stage, error: stageErr } = await stageQuery.maybeSingle()
  if (stageErr) throw new HttpError(500, stageErr.message)
  if (!stage || !stage.is_active) throw new HttpError(404, 'Outreach sequence stage not found')

  const completedAt = completed ? new Date().toISOString() : null
  const { error: upsertErr } = await supabase
    .from('lead_outreach_progress')
    .upsert({ lead_id: id, outreach_sequence_stage_id: stageId, completed_at: completedAt }, { onConflict: 'lead_id,outreach_sequence_stage_id' })
  if (upsertErr) throw new HttpError(500, upsertErr.message)

  await logActivity(id, 'status', `${stage.stage_label} marked ${completed ? 'done' : 'not done'}`, user.id)

  if (completed) {
    let nextQuery = supabase
      .from('outreach_sequence_stages')
      .select('id, interval_days')
      .eq('channel', stage.channel)
      .eq('is_active', true)
      .gt('stage_number', stage.stage_number)
    nextQuery = scopeToOrg(nextQuery as any, orgId) as any
    const { data: nextStage } = await nextQuery.order('stage_number', { ascending: true }).limit(1).maybeSingle()

    if (nextStage) {
      const due = new Date()
      due.setUTCDate(due.getUTCDate() + (nextStage.interval_days ?? 3))
      await supabase
        .from('lead_outreach_progress')
        .upsert(
          { lead_id: id, outreach_sequence_stage_id: nextStage.id, due_date: due.toISOString() },
          { onConflict: 'lead_id,outreach_sequence_stage_id', ignoreDuplicates: false }
        )
    }
  } else {
    // Unmarking clears the next stage's not-yet-completed due date, mirroring
    // the old fixed-toggle behavior — completing it again later resets the due date fresh.
    let nextQuery = supabase
      .from('outreach_sequence_stages')
      .select('id')
      .eq('channel', stage.channel)
      .eq('is_active', true)
      .gt('stage_number', stage.stage_number)
    nextQuery = scopeToOrg(nextQuery as any, orgId) as any
    const { data: nextStage } = await nextQuery.order('stage_number', { ascending: true }).limit(1).maybeSingle()
    if (nextStage) {
      await supabase
        .from('lead_outreach_progress')
        .update({ due_date: null })
        .eq('lead_id', id)
        .eq('outreach_sequence_stage_id', nextStage.id)
        .is('completed_at', null)
    }
  }

  const { data: progressRows } = await supabase.from('lead_outreach_progress').select(OUTREACH_PROGRESS_SELECT).eq('lead_id', id)
  const { data: statusRow } = await supabase.from('lead_status').select('replied, converted').eq('lead_id', id).maybeSingle()
  return json(200, {
    outreach_progress: normalizeOutreachProgress(progressRows as any),
    ...computeReminder(progressRows as any, statusRow),
  })
}

export async function updateLeadStage(id: string, event: HandlerEvent, user: AuthedUser) {
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')
  const stageId = body.stage_id

  if (!stageId) throw new HttpError(400, 'stage_id is required')

  const { existing, orgId } = await fetchLeadInScope(id, user, event)
  requireCanModifyRecord(user, existing, 'lead')

  let stageQuery = supabase.from('pipeline_stages').select('name').eq('id', stageId)
  stageQuery = scopeToOrg(stageQuery as any, orgId) as any
  const { data: stage } = await stageQuery.maybeSingle()
  if (!stage) throw new HttpError(404, 'Pipeline stage not found')

  const { error } = await supabase.from('leads').update({ stage_id: stageId }).eq('id', id)
  if (error) throw new HttpError(500, error.message)

  await logActivity(id, 'stage', `Stage changed to ${stage.name}`, user.id)

  return getLead(id, orgId, user)
}

export async function getLeadActivities(id: string, event: HandlerEvent, user: AuthedUser) {
  const supabase = getSupabaseAdmin()
  await fetchLeadInScope(id, user, event)

  const { data, error } = await supabase
    .from('lead_activities')
    .select('id, type, message, created_at, created_by, profiles ( nickname, email )')
    .eq('lead_id', id)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) throw new HttpError(500, error.message)
  const activities = (data ?? []).map((row: any) => {
    const { profiles, ...rest } = row
    return { ...rest, actor_name: profiles?.nickname || profiles?.email || null }
  })
  return json(200, { activities })
}

const KANBAN_SELECT = `
  id, company_name, priority, stage_id, assigned_to,
  lead_status ( replied, converted ),
  ${OUTREACH_PROGRESS_SELECT}
`
const KANBAN_MAX_LEADS = 1000

export async function getKanbanLeads(event: HandlerEvent, user: AuthedUser) {
  const supabase = getSupabaseAdmin()
  const orgId = resolveOrganizationId(user, event)
  const industryId = event.queryStringParameters?.industryId
  const assignedTo = event.queryStringParameters?.assignedTo

  let query = supabase.from('leads').select(KANBAN_SELECT)
  query = scopeToOrg(query as any, orgId) as any
  query = applyLeadVisibility(query as any, user) as any
  if (industryId) query = query.eq('industry_id', industryId)
  if (assignedTo) query = query.eq('assigned_to', assignedTo)

  const { data, error } = await query.order('created_at', { ascending: false }).limit(KANBAN_MAX_LEADS)

  if (error) throw new HttpError(500, error.message)

  const leads = (data ?? []).map((row: any) => {
    const status = Array.isArray(row.lead_status) ? row.lead_status[0] : row.lead_status
    const sequenceCounts = computeSequenceCompletionCounts(row.lead_outreach_progress)
    return {
      id: row.id,
      company_name: row.company_name,
      priority: row.priority,
      stage_id: row.stage_id,
      assigned_to: row.assigned_to,
      outreach_completed_counts: sequenceCounts,
      status: status ? { ...status, ...computeReminder(row.lead_outreach_progress, status) } : status,
      ...computeLeadScore(status, row.priority, sequenceCounts),
    }
  })

  return json(200, { leads, truncated: leads.length >= KANBAN_MAX_LEADS })
}

const MAX_BULK_IDS = 500

function requireIds(body: any): string[] {
  const ids = body.ids
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new HttpError(400, 'ids must be a non-empty array')
  }
  if (ids.length > MAX_BULK_IDS) {
    throw new HttpError(400, `Cannot operate on more than ${MAX_BULK_IDS} leads at once`)
  }
  return ids
}

/** Narrows a requested id list down to ones actually in scope: always
 * restricted to the caller's organization, and — for non-admins — further
 * restricted to their edit scope (own records, or any within visibility='all'
 * scope if canEditAny is on). Deletions additionally require canDelete.
 * Never trusts the client's list as-is. */
async function restrictIdsToPermitted(
  ids: string[],
  user: AuthedUser,
  orgId: string | null,
  opts: { forDelete?: boolean } = {}
): Promise<string[]> {
  const supabase = getSupabaseAdmin()
  let query = supabase.from('leads').select('id').in('id', ids)
  if (user.role !== 'super_admin') query = query.eq('organization_id', orgId)

  if (!isAdminOrAbove(user)) {
    if (opts.forDelete && !user.permissions.canDelete) return []
    const canEditAny = user.permissions.leadVisibility === 'all' && user.permissions.canEditAny
    if (!canEditAny) query = query.or(`assigned_to.eq.${user.id},created_by.eq.${user.id}`)
  }

  const { data, error } = await query
  if (error) throw new HttpError(500, error.message)
  return (data ?? []).map((r) => r.id)
}

export async function bulkAction(event: HandlerEvent, user: AuthedUser) {
  const supabase = getSupabaseAdmin()
  const orgId = resolveOrganizationId(user, event)
  const body = JSON.parse(event.body || '{}')
  const type = body.type

  if (type === 'status') {
    const ids = await restrictIdsToPermitted(requireIds(body), user, orgId)
    if (ids.length === 0) return json(200, { success: true, updated: 0 })
    const { field, value } = body
    if (!(field in STATUS_FIELDS)) throw new HttpError(400, `Unknown status field: ${field}`)
    const { tsField, flagField, label } = STATUS_FIELDS[field]
    const boolValue = Boolean(value)

    const { error } = await supabase
      .from('lead_status')
      .update({ [flagField]: boolValue, [tsField]: boolValue ? new Date().toISOString() : null })
      .in('lead_id', ids)

    if (error) throw new HttpError(500, error.message)

    await logActivities(
      ids.map((leadId) => ({
        leadId,
        type: 'status',
        message: `${label} marked ${boolValue ? 'done' : 'not done'} (bulk)`,
        userId: user.id,
      }))
    )

    return json(200, { success: true, updated: ids.length })
  }

  if (type === 'outreach_progress') {
    const ids = await restrictIdsToPermitted(requireIds(body), user, orgId)
    if (ids.length === 0) return json(200, { success: true, updated: 0 })
    const stageId = body.outreach_sequence_stage_id
    if (!stageId) throw new HttpError(400, 'outreach_sequence_stage_id is required')

    let stageQuery = supabase
      .from('outreach_sequence_stages')
      .select('id, channel, stage_number, stage_label, interval_days, is_active')
      .eq('id', stageId)
    stageQuery = scopeToOrg(stageQuery as any, orgId) as any
    const { data: stage, error: stageErr } = await stageQuery.maybeSingle()
    if (stageErr) throw new HttpError(500, stageErr.message)
    if (!stage || !stage.is_active) throw new HttpError(404, 'Outreach sequence stage not found')

    const now = new Date().toISOString()
    const { error } = await supabase
      .from('lead_outreach_progress')
      .upsert(
        ids.map((leadId) => ({ lead_id: leadId, outreach_sequence_stage_id: stageId, completed_at: now })),
        { onConflict: 'lead_id,outreach_sequence_stage_id' }
      )
    if (error) throw new HttpError(500, error.message)

    let nextQuery = supabase
      .from('outreach_sequence_stages')
      .select('id, interval_days')
      .eq('channel', stage.channel)
      .eq('is_active', true)
      .gt('stage_number', stage.stage_number)
    nextQuery = scopeToOrg(nextQuery as any, orgId) as any
    const { data: nextStage } = await nextQuery.order('stage_number', { ascending: true }).limit(1).maybeSingle()
    if (nextStage) {
      const due = new Date()
      due.setUTCDate(due.getUTCDate() + (nextStage.interval_days ?? 3))
      const { error: dueErr } = await supabase
        .from('lead_outreach_progress')
        .upsert(
          ids.map((leadId) => ({ lead_id: leadId, outreach_sequence_stage_id: nextStage.id, due_date: due.toISOString() })),
          { onConflict: 'lead_id,outreach_sequence_stage_id' }
        )
      if (dueErr) throw new HttpError(500, dueErr.message)
    }

    await logActivities(
      ids.map((leadId) => ({
        leadId,
        type: 'status',
        message: `${stage.stage_label} marked done (bulk)`,
        userId: user.id,
      }))
    )

    return json(200, { success: true, updated: ids.length })
  }

  if (type === 'tags') {
    const ids = await restrictIdsToPermitted(requireIds(body), user, orgId)
    if (ids.length === 0) return json(200, { success: true, updated: 0 })
    const tagNames = (body.tagNames ?? []) as string[]
    if (tagNames.filter((t) => t.trim()).length === 0) {
      throw new HttpError(400, 'tagNames must be a non-empty array')
    }

    const tagIds = (await ensureTagIds(tagNames, orgId)).map((t) => t.id)
    const rows = ids.flatMap((lead_id) => tagIds.map((tag_id) => ({ lead_id, tag_id })))

    const { error: insErr } = await supabase.from('lead_tags').upsert(rows, { onConflict: 'lead_id,tag_id' })
    if (insErr) throw new HttpError(500, insErr.message)

    await logActivities(
      ids.map((leadId) => ({
        leadId,
        type: 'tags',
        message: `Tags added (bulk): ${tagNames.join(', ')}`,
        userId: user.id,
      }))
    )

    return json(200, { success: true, updated: ids.length })
  }

  if (type === 'delete') {
    const ids = await restrictIdsToPermitted(requireIds(body), user, orgId, { forDelete: true })
    const { error } = await supabase.from('leads').delete().in('id', ids)
    if (error) throw new HttpError(500, error.message)
    await logAuditEvent('bulk_leads_deleted', user, event, {
      organizationId: orgId,
      metadata: { count: ids.length },
    })
    return json(200, { success: true, deleted: ids.length })
  }

  throw new HttpError(400, `Unknown bulk action type: ${type}`)
}

const MAX_DUPLICATE_SCAN_LEADS = 1500

/** Any authenticated team member can VIEW suggestions (scoped to whatever
 * leads their own visibility permissions already let them see) — but only
 * Admin/Super Admin can dismiss a pair or actually execute a merge (see
 * dismissLeadDuplicate/mergeLeads), regardless of any canEditAny grant. */
export async function findLeadDuplicates(event: HandlerEvent, user: AuthedUser) {
  const supabase = getSupabaseAdmin()
  const orgId = resolveOrganizationId(user, event)

  let query = supabase.from('leads').select(LEAD_SELECT)
  query = scopeToOrg(query as any, orgId) as any
  query = applyLeadVisibility(query as any, user) as any
  const { data, error } = await query.order('created_at', { ascending: false }).limit(MAX_DUPLICATE_SCAN_LEADS)
  if (error) throw new HttpError(500, error.message)
  const leads = (data ?? []).map(normalizeLead)

  let dismissalsQuery = supabase.from('duplicate_dismissals').select('record_id_a, record_id_b').eq('record_type', 'lead')
  dismissalsQuery = scopeToOrg(dismissalsQuery as any, orgId) as any
  const { data: dismissals, error: dismErr } = await dismissalsQuery
  if (dismErr) throw new HttpError(500, dismErr.message)
  const dismissedKeys = new Set((dismissals ?? []).map((d) => dismissalKey(d.record_id_a, d.record_id_b)))

  const pairs = findLeadDuplicatePairs(leads).filter((p) => !dismissedKeys.has(dismissalKey(p.a, p.b)))
  const clusters = groupPairsIntoClusters(leads, pairs)

  const groups = clusters.map((leadsInGroup) => {
    const ids = new Set(leadsInGroup.map((l) => l.id))
    const reasons = [...new Set(pairs.filter((p) => ids.has(p.a) && ids.has(p.b)).map((p) => p.reason))]
    return { leads: leadsInGroup, reasons }
  })

  return json(200, { groups, truncated: leads.length >= MAX_DUPLICATE_SCAN_LEADS })
}

/** Body: { leadIdA, leadIdB } — marks a suggested pair as "not a duplicate"
 * so it stops appearing in future scans. Idempotent: dismissing an
 * already-dismissed pair is a no-op success, not an error. */
export async function dismissLeadDuplicate(event: HandlerEvent, user: AuthedUser) {
  requireAdminOrAbove(user)
  const supabase = getSupabaseAdmin()
  const orgId = resolveOrganizationId(user, event)
  const body = JSON.parse(event.body || '{}')
  const { leadIdA, leadIdB } = body
  if (!leadIdA || !leadIdB) throw new HttpError(400, 'leadIdA and leadIdB are required')

  const { data: rows, error: fetchErr } = await supabase
    .from('leads')
    .select('id, organization_id')
    .in('id', [leadIdA, leadIdB])
  if (fetchErr) throw new HttpError(500, fetchErr.message)
  if ((rows ?? []).length !== 2 || (rows ?? []).some((r) => (r.organization_id ?? null) !== orgId)) {
    throw new HttpError(404, 'Lead not found')
  }

  const { error } = await supabase
    .from('duplicate_dismissals')
    .insert({ record_type: 'lead', organization_id: orgId, record_id_a: leadIdA, record_id_b: leadIdB, dismissed_by: user.id })
  if (error && (error as any).code !== '23505') throw new HttpError(500, error.message)

  return json(200, { success: true })
}

const MERGEABLE_LEAD_FIELDS = [
  'company_name', 'contact_name', 'address', 'phone', 'email', 'website', 'notes',
  'lead_source', 'priority', 'stage_id', 'industry_id', 'assigned_to',
]

async function fetchLeadForMerge(id: string, orgId: string | null) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('leads').select(LEAD_SELECT).eq('id', id).maybeSingle()
  if (error) throw new HttpError(500, error.message)
  if (!data) throw new HttpError(404, 'Lead not found')
  if ((data.organization_id ?? null) !== orgId) throw new HttpError(404, 'Lead not found')
  return normalizeLead(data)
}

/** Merges `loserId` into `survivorId`: applies the admin's field-by-field
 * decisions (already resolved to final values by the frontend, which had
 * both full records to compare — this endpoint just validates and applies
 * them), always UNIONs tags/social profiles/attachments (never a pick),
 * OR-merges the non-sequence status toggles and every outreach-sequence
 * stage's completion (unless explicitly overridden), reassigns the loser's
 * Deals/Activity Timeline onto the survivor, records a pre-merge snapshot for
 * undo, then hard-deletes the loser. The survivor keeps its own id, so any
 * existing links to it remain valid. */
export async function mergeLeads(event: HandlerEvent, user: AuthedUser) {
  requireAdminOrAbove(user)
  await requireAal2IfEnrolled(user)
  const supabase = getSupabaseAdmin()
  const orgId = resolveOrganizationId(user, event)
  const body = JSON.parse(event.body || '{}')
  const survivorId = body.survivorId
  const loserId = body.loserId
  if (!survivorId || !loserId) throw new HttpError(400, 'survivorId and loserId are required')
  if (survivorId === loserId) throw new HttpError(400, 'Cannot merge a lead with itself')

  const [survivor, loser] = await Promise.all([
    fetchLeadForMerge(survivorId, orgId),
    fetchLeadForMerge(loserId, orgId),
  ])

  // --- Standard fields: apply only what the admin actually changed ---
  const requestedFields = body.fields ?? {}
  const fieldUpdate: Record<string, any> = {}
  const survivorFieldBackup: Record<string, any> = {}
  for (const key of MERGEABLE_LEAD_FIELDS) {
    if (!(key in requestedFields)) continue
    const newValue = requestedFields[key]
    if (JSON.stringify(newValue ?? null) === JSON.stringify((survivor as any)[key] ?? null)) continue
    if (key === 'company_name' && !String(newValue ?? '').trim()) throw new HttpError(400, 'company_name cannot be empty')
    fieldUpdate[key] = newValue
    survivorFieldBackup[key] = (survivor as any)[key] ?? null
  }

  // --- Custom fields: field-by-field, same "final value wins" contract ---
  const defs = await loadActiveDefinitions(orgId, 'leads')
  const defIds = new Set(defs.map((d) => d.id))
  const requestedCustomFields = body.customFields ?? {}
  const nextCustomFields = { ...(survivor.custom_fields ?? {}) }
  const customFieldsBackup: Record<string, any> = {}
  for (const [fieldId, value] of Object.entries(requestedCustomFields)) {
    if (!defIds.has(fieldId)) continue
    if (JSON.stringify(nextCustomFields[fieldId] ?? null) === JSON.stringify(value ?? null)) continue
    customFieldsBackup[fieldId] = nextCustomFields[fieldId] ?? null
    nextCustomFields[fieldId] = value
  }
  if (Object.keys(customFieldsBackup).length > 0) fieldUpdate.custom_fields = nextCustomFields

  // --- Outreach status toggles: true-if-either, unless explicitly overridden ---
  const survivorStatus: Record<string, any> = survivor.status ?? {}
  const loserStatus: Record<string, any> = loser.status ?? {}
  const overrides = body.statusOverrides ?? {}
  const statusUpdate: Record<string, any> = {}
  const statusBackup: Record<string, any> = {}
  for (const field of Object.keys(STATUS_FIELDS)) {
    const orValue = Boolean(survivorStatus[field]) || Boolean(loserStatus[field])
    const finalValue = field in overrides ? Boolean(overrides[field]) : orValue
    if (finalValue === Boolean(survivorStatus[field])) continue
    statusUpdate[field] = finalValue
    statusBackup[field] = survivorStatus[field] ?? false
    const tsField = STATUS_FIELDS[field].tsField
    if (finalValue && !survivorStatus[tsField]) {
      statusUpdate[tsField] = loserStatus[tsField] ?? new Date().toISOString()
      statusBackup[tsField] = survivorStatus[tsField] ?? null
    }
  }

  // --- Outreach sequence progress: true-if-either, unless explicitly overridden ---
  // Queried raw here (not survivor/loser.outreach_progress, which normalizeLead
  // already filtered down to only currently-active stages for the UI checklist)
  // so a completion on a since-deactivated stage is still unioned onto the
  // survivor instead of silently vanishing when the loser is hard-deleted.
  const { data: rawProgressRows, error: rawProgressErr } = await supabase
    .from('lead_outreach_progress')
    .select('lead_id, outreach_sequence_stage_id, completed_at, due_date')
    .in('lead_id', [survivorId, loserId])
  if (rawProgressErr) throw new HttpError(500, rawProgressErr.message)
  const survivorProgress: any[] = (rawProgressRows ?? []).filter((r: any) => r.lead_id === survivorId)
  const loserProgress: any[] = (rawProgressRows ?? []).filter((r: any) => r.lead_id === loserId)
  const stageOverrides = body.stageOverrides ?? {}
  const survivorProgressByStage = new Map(survivorProgress.map((p: any) => [p.outreach_sequence_stage_id, p]))
  const loserProgressByStage = new Map(loserProgress.map((p: any) => [p.outreach_sequence_stage_id, p]))
  const allStageIds = new Set([...survivorProgressByStage.keys(), ...loserProgressByStage.keys()])
  const progressBackup: Array<{ outreach_sequence_stage_id: string; completed_at: string | null; due_date: string | null }> = []

  for (const stageId of allStageIds) {
    const sRow = survivorProgressByStage.get(stageId)
    const lRow = loserProgressByStage.get(stageId)
    const orCompleted = Boolean(sRow?.completed_at) || Boolean(lRow?.completed_at)
    const finalCompleted = stageId in stageOverrides ? Boolean(stageOverrides[stageId]) : orCompleted
    if (finalCompleted === Boolean(sRow?.completed_at)) continue

    progressBackup.push({
      outreach_sequence_stage_id: stageId as string,
      completed_at: sRow?.completed_at ?? null,
      due_date: sRow?.due_date ?? null,
    })
  }

  if (Object.keys(fieldUpdate).length > 0) {
    const { error } = await supabase.from('leads').update(fieldUpdate).eq('id', survivorId)
    if (error) throw new HttpError(500, error.message)
  }
  if (Object.keys(statusUpdate).length > 0) {
    const { error } = await supabase.from('lead_status').update(statusUpdate).eq('lead_id', survivorId)
    if (error) throw new HttpError(500, error.message)
  }
  for (const backup of progressBackup) {
    const sRow = survivorProgressByStage.get(backup.outreach_sequence_stage_id)
    const lRow = loserProgressByStage.get(backup.outreach_sequence_stage_id)
    const finalCompleted =
      backup.outreach_sequence_stage_id in stageOverrides
        ? Boolean(stageOverrides[backup.outreach_sequence_stage_id])
        : Boolean(sRow?.completed_at) || Boolean(lRow?.completed_at)
    const { error } = await supabase.from('lead_outreach_progress').upsert(
      {
        lead_id: survivorId,
        outreach_sequence_stage_id: backup.outreach_sequence_stage_id,
        completed_at: finalCompleted ? sRow?.completed_at || lRow?.completed_at || new Date().toISOString() : null,
        due_date: sRow?.due_date ?? lRow?.due_date ?? null,
      },
      { onConflict: 'lead_id,outreach_sequence_stage_id' }
    )
    if (error) throw new HttpError(500, error.message)
  }

  // --- Reassign the loser's Activity Timeline, Deals, and Attachments onto the survivor ---
  const { data: movedActivities, error: actErr } = await supabase
    .from('lead_activities')
    .select('id')
    .eq('lead_id', loserId)
  if (actErr) throw new HttpError(500, actErr.message)
  await supabase.from('lead_activities').update({ lead_id: survivorId }).eq('lead_id', loserId)

  const { data: movedDeals, error: dealErr } = await supabase.from('deals').select('id').eq('lead_id', loserId)
  if (dealErr) throw new HttpError(500, dealErr.message)
  await supabase.from('deals').update({ lead_id: survivorId }).eq('lead_id', loserId)

  const { data: movedAttachments, error: attErr } = await supabase
    .from('lead_attachments')
    .select('id')
    .eq('lead_id', loserId)
  if (attErr) throw new HttpError(500, attErr.message)
  await supabase.from('lead_attachments').update({ lead_id: survivorId }).eq('lead_id', loserId)

  // --- Union Tags (never a pick — combine both leads') ---
  const survivorTagIds = new Set(survivor.tags.map((t: any) => t.id))
  const addedTagIds = loser.tags.map((t: any) => t.id).filter((id: string) => !survivorTagIds.has(id))
  if (addedTagIds.length > 0) {
    const { error } = await supabase
      .from('lead_tags')
      .upsert(addedTagIds.map((tagId: string) => ({ lead_id: survivorId, tag_id: tagId })), {
        onConflict: 'lead_id,tag_id',
        ignoreDuplicates: true,
      })
    if (error) throw new HttpError(500, error.message)
  }

  // --- Union Social Profiles (reassign non-duplicate rows; exact duplicates
  //     are left on the loser and cascade-delete with it below) ---
  const survivorSocialKeys = new Set(
    survivor.social_profiles.map((s: any) => `${s.platform.toLowerCase()}|${s.url.toLowerCase()}`)
  )
  const socialToMove = loser.social_profiles.filter(
    (s: any) => !survivorSocialKeys.has(`${s.platform.toLowerCase()}|${s.url.toLowerCase()}`)
  )
  const movedSocialProfileIds = socialToMove.map((s: any) => s.id).filter(Boolean)
  if (movedSocialProfileIds.length > 0) {
    await supabase.from('lead_social_profiles').update({ lead_id: survivorId }).in('id', movedSocialProfileIds)
  }

  // --- Merge note on the survivor's timeline ---
  const actorLabel = user.nickname || user.email
  const { data: mergeNote, error: noteErr } = await supabase
    .from('lead_activities')
    .insert({
      lead_id: survivorId,
      type: 'merge',
      message: `Merged duplicate lead "${loser.company_name}" into this record — by ${actorLabel}`,
      created_by: user.id,
    })
    .select('id')
    .single()
  if (noteErr) throw new HttpError(500, noteErr.message)

  // --- Snapshot for undo, THEN delete the loser (cascades its remaining child rows) ---
  const { data: snapshot, error: snapErr } = await supabase
    .from('merge_snapshots')
    .insert({
      record_type: 'lead',
      organization_id: orgId,
      survivor_id: survivorId,
      loser_id: loserId,
      // Overrides normalizeLead's active-stage-only outreach_progress with the
      // raw rows fetched above, so undo can recreate completions on stages
      // that have since been deactivated too — same reasoning as the union above.
      loser_snapshot: { ...loser, outreach_progress: loserProgress },
      survivor_backup: { fields: survivorFieldBackup, customFields: customFieldsBackup, status: statusBackup, outreachProgress: progressBackup },
      moved_activity_ids: (movedActivities ?? []).map((a) => a.id),
      moved_deal_ids: (movedDeals ?? []).map((d) => d.id),
      moved_attachment_ids: (movedAttachments ?? []).map((a) => a.id),
      moved_social_profile_ids: movedSocialProfileIds,
      added_tag_ids: addedTagIds,
      merge_note_activity_id: mergeNote.id,
      merged_by: user.id,
    })
    .select('id')
    .single()
  if (snapErr) throw new HttpError(500, snapErr.message)

  const { error: delErr } = await supabase.from('leads').delete().eq('id', loserId)
  if (delErr) throw new HttpError(500, delErr.message)

  await logAuditEvent('leads_merged', user, event, {
    organizationId: orgId,
    metadata: {
      survivorId,
      loserId,
      survivorCompanyName: survivor.company_name,
      loserCompanyName: loser.company_name,
      snapshotId: snapshot.id,
    },
  })

  const result = await getLead(survivorId, orgId, user)
  return json(result.statusCode, { ...JSON.parse(result.body), mergeSnapshotId: snapshot.id })
}
