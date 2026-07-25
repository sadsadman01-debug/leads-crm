import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import { ensureTagIds } from '../lib/tags.js'
import { computeReminder, FOLLOW_UP_DUE_TRIGGERS } from '../lib/reminders.js'
import { computeLeadScore } from '../lib/scoring.js'
import { logActivity, logActivities } from '../lib/activities.js'
import { getFollowUpIntervalDays } from './settings.js'
import type { AuthedUser } from '../lib/auth.js'

export const LEAD_SELECT = `
  id, company_name, address, phone, email, website, notes, lead_source, priority,
  stage_id, industry_id, created_at, updated_at,
  lead_status ( * ),
  lead_tags ( tags ( id, name ) ),
  lead_social_profiles ( id, platform, url )
`

export function normalizeLead(row: any) {
  if (!row) return row
  const { lead_tags, lead_social_profiles, lead_status, ...rest } = row
  const status = Array.isArray(lead_status) ? lead_status[0] : lead_status
  return {
    ...rest,
    status: status ? { ...status, ...computeReminder(status) } : status,
    ...computeLeadScore(status, rest.priority),
    social_profiles: lead_social_profiles ?? [],
    tags: (lead_tags ?? []).map((t: any) => t.tags).filter(Boolean),
  }
}

export interface LeadFilters {
  priority?: string
  leadSource?: string
  tagIds?: string[]
  statusChecks?: Array<{ field: string; value: boolean }>
  dateFrom?: string
  dateTo?: string
  hasWebsite?: boolean
  hasSocialProfile?: boolean
  industryId?: string
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
  if (filters.dateFrom) q = q.gte('created_at', filters.dateFrom)
  if (filters.dateTo) q = q.lte('created_at', filters.dateTo)
  if (filters.hasWebsite) {
    q = q.not('website', 'is', null).not('website', 'eq', '')
  }
  return q
}

export async function listLeads(event: HandlerEvent) {
  const supabase = getSupabaseAdmin()
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

export async function checkDuplicate(event: HandlerEvent) {
  const supabase = getSupabaseAdmin()
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

  if (excludeId) query = query.neq('id', excludeId)

  const { data, error } = await query.limit(5)
  if (error) throw new HttpError(500, error.message)

  return json(200, { matches: data ?? [] })
}

async function replaceTags(leadId: string, tagNames: string[]) {
  const supabase = getSupabaseAdmin()
  const tagIds = (await ensureTagIds(tagNames)).map((t) => t.id)

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
  const body = JSON.parse(event.body || '{}')

  if (!body.company_name?.trim()) {
    throw new HttpError(400, 'company_name is required')
  }

  const { data, error } = await supabase
    .from('leads')
    .insert({
      company_name: body.company_name.trim(),
      address: body.address ?? null,
      phone: body.phone ?? null,
      email: body.email ?? null,
      website: body.website ?? null,
      notes: body.notes ?? null,
      lead_source: body.lead_source ?? 'Manual Entry',
      priority: body.priority ?? 'Medium',
      industry_id: body.industry_id ?? null,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (error) throw new HttpError(500, error.message)

  const leadId = data.id
  await Promise.all([
    replaceTags(leadId, body.tags ?? []),
    replaceSocialProfiles(leadId, body.social_profiles ?? []),
    logActivity(leadId, 'created', 'Lead created', user.id),
  ])

  return getLead(leadId)
}

export async function getLead(id: string) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('leads').select(LEAD_SELECT).eq('id', id).single()
  if (error) throw new HttpError(404, 'Lead not found')

  const { data: attachments, error: attErr } = await supabase
    .from('lead_attachments')
    .select('id, file_name, storage_path, content_type, size_bytes, uploaded_at')
    .eq('lead_id', id)
    .order('uploaded_at', { ascending: false })
  if (attErr) throw new HttpError(500, attErr.message)

  return json(200, { ...normalizeLead(data), attachments: attachments ?? [] })
}

export async function updateLead(id: string, event: HandlerEvent, user: AuthedUser) {
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')

  const updatable: Record<string, any> = {}
  for (const key of ['company_name', 'address', 'phone', 'email', 'website', 'notes', 'lead_source', 'priority', 'industry_id']) {
    if (key in body) updatable[key] = body[key]
  }

  if (Object.keys(updatable).length > 0) {
    const { error } = await supabase.from('leads').update(updatable).eq('id', id)
    if (error) throw new HttpError(500, error.message)
  }

  if ('tags' in body) {
    await replaceTags(id, body.tags ?? [])
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

  return getLead(id)
}

export async function deleteLead(id: string) {
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('leads').delete().eq('id', id)
  if (error) throw new HttpError(500, error.message)
  return json(200, { success: true })
}

export const STATUS_FIELDS: Record<string, { flagField: string; tsField: string; label: string }> = {
  cold_email_sent: { flagField: 'cold_email_sent', tsField: 'cold_email_sent_at', label: 'Cold Email Sent' },
  followup1_sent: { flagField: 'followup1_sent', tsField: 'followup1_sent_at', label: '1st Follow-up Sent' },
  followup2_sent: { flagField: 'followup2_sent', tsField: 'followup2_sent_at', label: '2nd Follow-up Sent' },
  followup3_sent: { flagField: 'followup3_sent', tsField: 'followup3_sent_at', label: '3rd Follow-up Sent' },
  replied: { flagField: 'replied', tsField: 'replied_at', label: 'Replied' },
  whatsapp_sent: { flagField: 'whatsapp_sent', tsField: 'whatsapp_sent_at', label: 'WhatsApp Sent' },
  no_whatsapp: { flagField: 'no_whatsapp', tsField: 'no_whatsapp_at', label: 'No WhatsApp Available' },
  email_invalid: { flagField: 'email_invalid', tsField: 'email_invalid_at', label: 'Email Invalid' },
  phone_invalid: { flagField: 'phone_invalid', tsField: 'phone_invalid_at', label: 'Phone Invalid' },
  converted: { flagField: 'converted', tsField: 'converted_at', label: 'Converted to Client' },
  linkedin_sent: { flagField: 'linkedin_sent', tsField: 'linkedin_sent_at', label: 'LinkedIn Sent' },
  sms_sent: { flagField: 'sms_sent', tsField: 'sms_sent_at', label: 'SMS Sent' },
  cold_call_made: { flagField: 'cold_call_made', tsField: 'cold_call_made_at', label: 'Cold Call Made' },
}

export async function updateLeadStatus(id: string, event: HandlerEvent, user: AuthedUser) {
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')

  const update: Record<string, any> = {}
  const activityMessages: string[] = []
  let intervalDays: number | null = null

  for (const [key, { flagField, tsField, label }] of Object.entries(STATUS_FIELDS)) {
    if (key in body) {
      const value = Boolean(body[key])
      update[flagField] = value
      update[tsField] = value ? new Date().toISOString() : null
      activityMessages.push(`${label} marked ${value ? 'done' : 'not done'}`)

      const trigger = FOLLOW_UP_DUE_TRIGGERS[key]
      if (trigger) {
        if (value) {
          intervalDays ??= await getFollowUpIntervalDays()
          const due = new Date()
          due.setUTCDate(due.getUTCDate() + intervalDays)
          update[trigger.setsDueField] = due.toISOString()
        } else {
          update[trigger.setsDueField] = null
        }
      }
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

  return json(200, { ...data, ...computeReminder(data) })
}

export async function updateLeadStage(id: string, event: HandlerEvent, user: AuthedUser) {
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')
  const stageId = body.stage_id

  if (!stageId) throw new HttpError(400, 'stage_id is required')

  const { error } = await supabase.from('leads').update({ stage_id: stageId }).eq('id', id)
  if (error) throw new HttpError(500, error.message)

  const { data: stage } = await supabase.from('pipeline_stages').select('name').eq('id', stageId).maybeSingle()
  await logActivity(id, 'stage', `Stage changed to ${stage?.name ?? 'unknown'}`, user.id)

  return getLead(id)
}

export async function getLeadActivities(id: string) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('lead_activities')
    .select('id, type, message, created_at')
    .eq('lead_id', id)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) throw new HttpError(500, error.message)
  return json(200, { activities: data ?? [] })
}

const KANBAN_SELECT = `
  id, company_name, priority, stage_id,
  lead_status ( cold_email_sent, followup1_sent, followup2_sent, followup3_sent,
    whatsapp_sent, linkedin_sent, sms_sent, replied, converted,
    followup1_due_at, followup2_due_at, followup3_due_at )
`
const KANBAN_MAX_LEADS = 1000

export async function getKanbanLeads(event: HandlerEvent) {
  const supabase = getSupabaseAdmin()
  const industryId = event.queryStringParameters?.industryId

  let query = supabase.from('leads').select(KANBAN_SELECT)
  if (industryId) query = query.eq('industry_id', industryId)

  const { data, error } = await query.order('created_at', { ascending: false }).limit(KANBAN_MAX_LEADS)

  if (error) throw new HttpError(500, error.message)

  const leads = (data ?? []).map((row: any) => {
    const status = Array.isArray(row.lead_status) ? row.lead_status[0] : row.lead_status
    return {
      id: row.id,
      company_name: row.company_name,
      priority: row.priority,
      stage_id: row.stage_id,
      status: status ? { ...status, ...computeReminder(status) } : status,
      ...computeLeadScore(status, row.priority),
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

export async function bulkAction(event: HandlerEvent, user: AuthedUser) {
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')
  const type = body.type

  if (type === 'status') {
    const ids = requireIds(body)
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

  if (type === 'tags') {
    const ids = requireIds(body)
    const tagNames = (body.tagNames ?? []) as string[]
    if (tagNames.filter((t) => t.trim()).length === 0) {
      throw new HttpError(400, 'tagNames must be a non-empty array')
    }

    const tagIds = (await ensureTagIds(tagNames)).map((t) => t.id)
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
    const ids = requireIds(body)
    const { error } = await supabase.from('leads').delete().in('id', ids)
    if (error) throw new HttpError(500, error.message)
    return json(200, { success: true, deleted: ids.length })
  }

  throw new HttpError(400, `Unknown bulk action type: ${type}`)
}
