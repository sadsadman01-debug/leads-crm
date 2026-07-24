import type { HandlerEvent } from '@netlify/functions'
import Papa from 'papaparse'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import { ensureTagIds } from '../lib/tags.js'
import type { AuthedUser } from '../lib/auth.js'

const LEAD_SOURCES = ['Google Maps', 'Referral', 'Manual Entry', 'Website', 'Other']
const PRIORITIES = ['High', 'Medium', 'Low']

const MAX_ROWS_PER_REQUEST = 500

// Accept both machine-readable and human-friendly column headers.
const HEADER_ALIASES: Record<string, string> = {
  company_name: 'company_name',
  'company name': 'company_name',
  company: 'company_name',
  address: 'address',
  phone: 'phone',
  'phone number': 'phone',
  email: 'email',
  'email address': 'email',
  website: 'website',
  notes: 'notes',
  lead_source: 'lead_source',
  'lead source': 'lead_source',
  source: 'lead_source',
  priority: 'priority',
  tags: 'tags',
  'tags/categories': 'tags',
}

interface ParsedLeadRow {
  company_name: string
  address: string | null
  phone: string | null
  email: string | null
  website: string | null
  notes: string | null
  lead_source: string
  priority: string
  tags: string[]
}

function normalizeRow(raw: Record<string, any>): ParsedLeadRow | null {
  const mapped: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw)) {
    const canonical = HEADER_ALIASES[key.trim().toLowerCase()]
    if (canonical && value != null && String(value).trim() !== '') {
      mapped[canonical] = String(value).trim()
    }
  }

  if (!mapped.company_name) return null

  return {
    company_name: mapped.company_name,
    address: mapped.address ?? null,
    phone: mapped.phone ?? null,
    email: mapped.email ?? null,
    website: mapped.website ?? null,
    notes: mapped.notes ?? null,
    lead_source: (LEAD_SOURCES as string[]).includes(mapped.lead_source) ? mapped.lead_source : 'Manual Entry',
    priority: (PRIORITIES as string[]).includes(mapped.priority) ? mapped.priority : 'Medium',
    tags: mapped.tags ? mapped.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
  }
}

async function insertRows(rows: ParsedLeadRow[], userId: string) {
  const supabase = getSupabaseAdmin()

  const { data: insertedLeads, error } = await supabase
    .from('leads')
    .insert(
      rows.map((r) => ({
        company_name: r.company_name,
        address: r.address,
        phone: r.phone,
        email: r.email,
        website: r.website,
        notes: r.notes,
        lead_source: r.lead_source,
        priority: r.priority,
        created_by: userId,
      }))
    )
    .select('id')

  if (error) throw new HttpError(500, error.message)

  const allTagNames = [...new Set(rows.flatMap((r) => r.tags))]
  if (allTagNames.length > 0 && insertedLeads) {
    const tagRecords = await ensureTagIds(allTagNames)
    const tagIdByName = new Map(tagRecords.map((t) => [t.name, t.id]))

    const lead_tags = rows.flatMap((row, i) =>
      row.tags
        .map((name) => tagIdByName.get(name))
        .filter(Boolean)
        .map((tag_id) => ({ lead_id: insertedLeads[i].id, tag_id }))
    )

    if (lead_tags.length > 0) {
      const { error: tagErr } = await supabase.from('lead_tags').insert(lead_tags)
      if (tagErr) throw new HttpError(500, tagErr.message)
    }
  }

  return insertedLeads?.length ?? 0
}

/** POST /leads/import — body: { rows: Record<string,string>[] } (already parsed client-side, e.g. from a CSV file). */
export async function importRows(event: HandlerEvent, user: AuthedUser) {
  const body = JSON.parse(event.body || '{}')
  const rawRows = body.rows

  if (!Array.isArray(rawRows) || rawRows.length === 0) {
    throw new HttpError(400, 'rows must be a non-empty array')
  }
  if (rawRows.length > MAX_ROWS_PER_REQUEST) {
    throw new HttpError(
      400,
      `A single import request is capped at ${MAX_ROWS_PER_REQUEST} rows to stay within function limits — split the file into batches and call this endpoint multiple times.`
    )
  }

  const parsed = rawRows.map(normalizeRow)
  const valid = parsed.filter((r): r is ParsedLeadRow => r !== null)
  const skipped = parsed.length - valid.length

  const imported = valid.length > 0 ? await insertRows(valid, user.id) : 0

  return json(200, { imported, skipped, total: rawRows.length })
}

function extractSheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  return match ? match[1] : null
}

/** POST /leads/import/sheet — body: { sheetUrl: string }. Sheet must be shared "Anyone with the link can view". */
export async function importFromSheet(event: HandlerEvent, user: AuthedUser) {
  const body = JSON.parse(event.body || '{}')
  const sheetUrl = body.sheetUrl as string | undefined

  if (!sheetUrl) throw new HttpError(400, 'sheetUrl is required')
  const sheetId = extractSheetId(sheetUrl)
  if (!sheetId) throw new HttpError(400, 'Could not parse a Google Sheet ID from that URL')

  const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`
  const res = await fetch(csvUrl)
  if (!res.ok) {
    throw new HttpError(
      400,
      'Could not fetch that Google Sheet. Make sure it is shared as "Anyone with the link can view".'
    )
  }
  const csvText = await res.text()

  const { data: rawRows } = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  })

  if (rawRows.length === 0) {
    return json(200, { imported: 0, skipped: 0, total: 0 })
  }
  if (rawRows.length > MAX_ROWS_PER_REQUEST) {
    throw new HttpError(
      400,
      `This sheet has ${rawRows.length} rows, which is over the ${MAX_ROWS_PER_REQUEST}-row limit for a single import. Split it into smaller sheets and import each separately.`
    )
  }

  const parsed = rawRows.map(normalizeRow)
  const valid = parsed.filter((r): r is ParsedLeadRow => r !== null)
  const skipped = parsed.length - valid.length

  const imported = valid.length > 0 ? await insertRows(valid, user.id) : 0

  return json(200, { imported, skipped, total: rawRows.length })
}

const EXPORT_MAX_ROWS = 5000
const EXPORT_CHUNK_SIZE = 1000

const EXPORT_COLUMNS = [
  'Company Name',
  'Address',
  'Phone',
  'Email',
  'Website',
  'Lead Source',
  'Priority',
  'Tags',
  'Notes',
  'Cold Email Sent',
  'Follow-up 1 Sent',
  'Follow-up 2 Sent',
  'Follow-up 3 Sent',
  'Replied',
  'Reply Sentiment',
  'WhatsApp Sent',
  'LinkedIn Sent',
  'SMS Sent',
  'Converted',
  'Created At',
]

/** GET /leads/export?filters=...&search=... — streams a CSV of all leads matching the current list filters. */
export async function exportLeads(event: HandlerEvent) {
  // Imported lazily to avoid a require cycle at module init time.
  const { applyColumnFilters, resolveJoinFilteredIds, parseFilters, LEAD_SELECT, normalizeLead } = await import(
    './leads.js'
  )
  const supabase = getSupabaseAdmin()
  const params = event.queryStringParameters ?? {}
  const search = (params.search ?? '').trim()
  const filters = parseFilters(params)

  const allowedIds = await resolveJoinFilteredIds(filters)
  if (allowedIds !== null && allowedIds.size === 0) {
    return csvResponse([])
  }

  const rows: any[] = []
  for (let offset = 0; offset < EXPORT_MAX_ROWS; offset += EXPORT_CHUNK_SIZE) {
    let query = supabase.from('leads').select(LEAD_SELECT)
    query = applyColumnFilters(query as any, filters, search) as any
    if (allowedIds !== null) query = query.in('id', [...allowedIds])

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + EXPORT_CHUNK_SIZE - 1)

    if (error) throw new HttpError(500, error.message)
    rows.push(...(data ?? []).map(normalizeLead))
    if (!data || data.length < EXPORT_CHUNK_SIZE) break
  }

  return csvResponse(rows)
}

function csvResponse(leads: any[]) {
  const csv = Papa.unparse({
    fields: EXPORT_COLUMNS,
    data: leads.map((lead) => [
      lead.company_name,
      lead.address ?? '',
      lead.phone ?? '',
      lead.email ?? '',
      lead.website ?? '',
      lead.lead_source,
      lead.priority,
      lead.tags.map((t: any) => t.name).join(', '),
      lead.notes ?? '',
      lead.status?.cold_email_sent ? 'Yes' : 'No',
      lead.status?.followup1_sent ? 'Yes' : 'No',
      lead.status?.followup2_sent ? 'Yes' : 'No',
      lead.status?.followup3_sent ? 'Yes' : 'No',
      lead.status?.replied ? 'Yes' : 'No',
      lead.status?.reply_sentiment ?? '',
      lead.status?.whatsapp_sent ? 'Yes' : 'No',
      lead.status?.linkedin_sent ? 'Yes' : 'No',
      lead.status?.sms_sent ? 'Yes' : 'No',
      lead.status?.converted ? 'Yes' : 'No',
      lead.created_at,
    ]),
  })

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="leads-export-${Date.now()}.csv"`,
    },
    body: csv,
  }
}
