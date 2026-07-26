import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import {
  resolveOrganizationId,
  scopeToOrg,
  applyLeadVisibility,
  applyDealVisibility,
  isAdminOrAbove,
} from '../lib/permissions.js'
import type { AuthedUser } from '../lib/auth.js'

const RESULTS_PER_SECTION = 5
const LEAD_ID_MATCH_LIMIT = 200

/** PostgREST's `.or()` takes a raw filter string where `,` and `()` are
 * syntax delimiters — strip them out of the user's own search term so it
 * can never break (or inject into) the filter expression. */
function sanitizeForOrFilter(q: string): string {
  return q.replace(/[,()]/g, ' ').trim()
}

export async function globalSearch(event: HandlerEvent, user: AuthedUser) {
  const rawQuery = (event.queryStringParameters?.q ?? '').trim()
  const empty = { query: rawQuery, leads: { results: [], total: 0 }, deals: { results: [], total: 0 }, teamMembers: { results: [], total: 0 } }
  if (rawQuery.length < 2) return json(200, empty)

  const supabase = getSupabaseAdmin()
  const orgId = resolveOrganizationId(user, event)
  const term = sanitizeForOrFilter(rawQuery)
  if (term.length < 2) return json(200, empty)

  // Leads — company name, contact name, email, phone, address.
  let leadsQuery = supabase
    .from('leads')
    .select('id, company_name, contact_name, email, phone, stage_id', { count: 'exact' })
  leadsQuery = scopeToOrg(leadsQuery as any, orgId) as any
  leadsQuery = applyLeadVisibility(leadsQuery as any, user) as any
  leadsQuery = leadsQuery.or(
    `company_name.ilike.%${term}%,contact_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%,address.ilike.%${term}%`
  )
  const { data: leadsData, count: leadsTotal, error: leadsErr } = await leadsQuery
    .order('updated_at', { ascending: false })
    .limit(RESULTS_PER_SECTION)
  if (leadsErr) throw new HttpError(500, leadsErr.message)

  // Deals — deal name, or belonging to a lead whose company name matches
  // (fetched separately since a cross-table OR isn't expressible in one query).
  let leadIdsQuery = supabase.from('leads').select('id')
  leadIdsQuery = scopeToOrg(leadIdsQuery as any, orgId) as any
  leadIdsQuery = applyLeadVisibility(leadIdsQuery as any, user) as any
  leadIdsQuery = leadIdsQuery.ilike('company_name', `%${term}%`)
  const { data: matchingLeads, error: leadIdsErr } = await leadIdsQuery.limit(LEAD_ID_MATCH_LIMIT)
  if (leadIdsErr) throw new HttpError(500, leadIdsErr.message)
  const matchingLeadIds = (matchingLeads ?? []).map((l) => l.id)

  let dealsQuery = supabase
    .from('deals')
    .select('id, name, value, currency, stage_id, lead_id, leads ( company_name )', { count: 'exact' })
  dealsQuery = scopeToOrg(dealsQuery as any, orgId) as any
  dealsQuery = applyDealVisibility(dealsQuery as any, user) as any
  const dealOrParts = [`name.ilike.%${term}%`]
  if (matchingLeadIds.length > 0) dealOrParts.push(`lead_id.in.(${matchingLeadIds.join(',')})`)
  dealsQuery = dealsQuery.or(dealOrParts.join(','))
  const { data: dealsRows, count: dealsTotal, error: dealsErr } = await dealsQuery
    .order('updated_at', { ascending: false })
    .limit(RESULTS_PER_SECTION)
  if (dealsErr) throw new HttpError(500, dealsErr.message)
  const dealsData = (dealsRows ?? []).map((row: any) => {
    const { leads, ...rest } = row
    return { ...rest, lead: leads ?? null }
  })

  // Team Members — Admin/Super Admin only, nickname or email, never the Super Admin themself.
  let teamResults: any[] = []
  let teamTotal = 0
  if (isAdminOrAbove(user)) {
    let teamQuery = supabase
      .from('profiles')
      .select('id, nickname, email, role', { count: 'exact' })
      .neq('role', 'super_admin')
    teamQuery = scopeToOrg(teamQuery as any, orgId) as any
    teamQuery = teamQuery.or(`nickname.ilike.%${term}%,email.ilike.%${term}%`)
    const { data: teamData, count, error: teamErr } = await teamQuery
      .order('nickname', { ascending: true })
      .limit(RESULTS_PER_SECTION)
    if (teamErr) throw new HttpError(500, teamErr.message)
    teamResults = teamData ?? []
    teamTotal = count ?? 0
  }

  return json(200, {
    query: rawQuery,
    leads: { results: leadsData ?? [], total: leadsTotal ?? 0 },
    deals: { results: dealsData ?? [], total: dealsTotal ?? 0 },
    teamMembers: { results: teamResults, total: teamTotal },
  })
}
