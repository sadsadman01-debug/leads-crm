import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import type { AuthedUser } from '../lib/auth.js'

const LEAD_SELECT = `
  id, company_name, address, phone, email, website, notes, lead_source, priority,
  created_at, updated_at,
  lead_status ( * ),
  lead_tags ( tags ( id, name ) ),
  lead_social_profiles ( id, platform, url )
`

function normalizeLead(row: any) {
  if (!row) return row
  const { lead_tags, lead_social_profiles, lead_status, ...rest } = row
  return {
    ...rest,
    status: Array.isArray(lead_status) ? lead_status[0] : lead_status,
    social_profiles: lead_social_profiles ?? [],
    tags: (lead_tags ?? []).map((t: any) => t.tags).filter(Boolean),
  }
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

  let query = supabase.from('leads').select(LEAD_SELECT, { count: 'exact' })

  if (search) {
    const like = `%${search}%`
    query = query.or(
      `company_name.ilike.${like},phone.ilike.${like},email.ilike.${like},address.ilike.${like}`
    )
  }

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
  const cleanNames = [...new Set(tagNames.map((t) => t.trim()).filter(Boolean))]

  let tagIds: string[] = []
  if (cleanNames.length > 0) {
    const { data: existing, error: existErr } = await supabase
      .from('tags')
      .select('id, name')
      .in('name', cleanNames)
    if (existErr) throw new HttpError(500, existErr.message)

    const existingNames = new Set((existing ?? []).map((t) => t.name))
    const toCreate = cleanNames.filter((n) => !existingNames.has(n))

    let created: any[] = []
    if (toCreate.length > 0) {
      const { data: createdRows, error: createErr } = await supabase
        .from('tags')
        .insert(toCreate.map((name) => ({ name })))
        .select('id, name')
      if (createErr) throw new HttpError(500, createErr.message)
      created = createdRows ?? []
    }

    tagIds = [...(existing ?? []), ...created].map((t) => t.id)
  }

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
      created_by: user.id,
    })
    .select('id')
    .single()

  if (error) throw new HttpError(500, error.message)

  const leadId = data.id
  await Promise.all([
    replaceTags(leadId, body.tags ?? []),
    replaceSocialProfiles(leadId, body.social_profiles ?? []),
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

export async function updateLead(id: string, event: HandlerEvent) {
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')

  const updatable: Record<string, any> = {}
  for (const key of ['company_name', 'address', 'phone', 'email', 'website', 'notes', 'lead_source', 'priority']) {
    if (key in body) updatable[key] = body[key]
  }

  if (Object.keys(updatable).length > 0) {
    const { error } = await supabase.from('leads').update(updatable).eq('id', id)
    if (error) throw new HttpError(500, error.message)
  }

  if ('tags' in body) await replaceTags(id, body.tags ?? [])
  if ('social_profiles' in body) await replaceSocialProfiles(id, body.social_profiles ?? [])

  return getLead(id)
}

export async function deleteLead(id: string) {
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('leads').delete().eq('id', id)
  if (error) throw new HttpError(500, error.message)
  return json(200, { success: true })
}

const STATUS_FIELDS: Record<string, { flagField: string; tsField: string }> = {
  cold_email_sent: { flagField: 'cold_email_sent', tsField: 'cold_email_sent_at' },
  followup1_sent: { flagField: 'followup1_sent', tsField: 'followup1_sent_at' },
  followup2_sent: { flagField: 'followup2_sent', tsField: 'followup2_sent_at' },
  followup3_sent: { flagField: 'followup3_sent', tsField: 'followup3_sent_at' },
  replied: { flagField: 'replied', tsField: 'replied_at' },
  whatsapp_sent: { flagField: 'whatsapp_sent', tsField: 'whatsapp_sent_at' },
  no_whatsapp: { flagField: 'no_whatsapp', tsField: 'no_whatsapp_at' },
  email_invalid: { flagField: 'email_invalid', tsField: 'email_invalid_at' },
  phone_invalid: { flagField: 'phone_invalid', tsField: 'phone_invalid_at' },
  converted: { flagField: 'converted', tsField: 'converted_at' },
  linkedin_sent: { flagField: 'linkedin_sent', tsField: 'linkedin_sent_at' },
  sms_sent: { flagField: 'sms_sent', tsField: 'sms_sent_at' },
  cold_call_made: { flagField: 'cold_call_made', tsField: 'cold_call_made_at' },
}

export async function updateLeadStatus(id: string, event: HandlerEvent) {
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')

  const update: Record<string, any> = {}

  for (const [key, { flagField, tsField }] of Object.entries(STATUS_FIELDS)) {
    if (key in body) {
      const value = Boolean(body[key])
      update[flagField] = value
      update[tsField] = value ? new Date().toISOString() : null
    }
  }

  if ('reply_sentiment' in body) update.reply_sentiment = body.reply_sentiment || null
  if ('cold_call_outcome' in body) update.cold_call_outcome = body.cold_call_outcome || null

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
  return json(200, data)
}
