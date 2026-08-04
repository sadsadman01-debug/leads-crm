import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import { resolveOrganizationId, applyLeadVisibility } from '../lib/permissions.js'
import type { AuthedUser } from '../lib/auth.js'

const PAGE_SIZE_DEFAULT = 50
const PAGE_SIZE_MAX = 100

/** A win to celebrate — deal-closed-won entries logged by deals.ts's exact
 * "Closed Won ($X)" message format (see logActivity call sites in deals.ts). */
function isWin(type: string, message: string): boolean {
  return type === 'deal' && /closed won/i.test(message)
}

/** GET /team-activity — the same lead_activities rows the per-record
 * Activity Timeline already writes, aggregated organization-wide instead of
 * per-lead. lead_activities has no organization_id/assigned_to/created_by of
 * its own, so scoping is done by first resolving the caller's own VISIBLE
 * lead ids (reusing applyLeadVisibility exactly as the Leads list endpoint
 * does — an Admin/'all'-visibility User sees every lead in the org, an 'own'
 * User only theirs), then filtering lead_activities to that id set — this is
 * what makes the feed automatically respect the same granular per-user
 * visibility permissions as the Leads/Deals table views, with no separate
 * permission model to maintain. */
export async function listTeamActivity(event: HandlerEvent, user: AuthedUser) {
  const supabase = getSupabaseAdmin()
  const orgId = resolveOrganizationId(user, event)
  const params = event.queryStringParameters ?? {}
  const page = Math.max(1, Number(params.page) || 1)
  const pageSize = Math.max(1, Math.min(PAGE_SIZE_MAX, Number(params.pageSize) || PAGE_SIZE_DEFAULT))

  if (orgId === null) return json(200, { activities: [], total: 0, page, pageSize })

  let leadsQuery = supabase.from('leads').select('id, company_name').eq('organization_id', orgId)
  leadsQuery = applyLeadVisibility(leadsQuery as any, user) as any
  const { data: visibleLeads, error: leadsErr } = await leadsQuery
  if (leadsErr) throw new HttpError(500, leadsErr.message)

  const leadIds = (visibleLeads ?? []).map((l) => l.id as string)
  if (leadIds.length === 0) return json(200, { activities: [], total: 0, page, pageSize })
  const companyNameById = new Map((visibleLeads ?? []).map((l) => [l.id as string, l.company_name as string]))

  let query = supabase
    .from('lead_activities')
    .select('id, type, message, created_at, created_by, lead_id, profiles ( nickname, email )', { count: 'exact' })
    .in('lead_id', leadIds)

  if (params.memberId) query = query.eq('created_by', params.memberId)
  if (params.activityType === 'deals') query = query.eq('type', 'deal')
  else if (params.activityType === 'leads') query = query.neq('type', 'deal')
  else if (params.activityType === 'wins') query = query.eq('type', 'deal').ilike('message', '%Closed Won%')
  if (params.dateFrom) query = query.gte('created_at', params.dateFrom)
  if (params.dateTo) query = query.lte('created_at', params.dateTo)

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  const { data, error, count } = await query.order('created_at', { ascending: false }).range(from, to)
  if (error) throw new HttpError(500, error.message)

  const activities = (data ?? []).map((row: any) => {
    const { profiles, ...rest } = row
    return {
      ...rest,
      company_name: companyNameById.get(row.lead_id) ?? null,
      actor_name: profiles?.nickname || profiles?.email || null,
      is_win: isWin(row.type, row.message),
    }
  })

  return json(200, { activities, total: count ?? 0, page, pageSize })
}
