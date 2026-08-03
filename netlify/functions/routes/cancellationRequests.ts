import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import { requireAdminOrAbove, requireSuperAdmin, resolveOrganizationId } from '../lib/permissions.js'
import { notifySuperAdmins } from '../lib/notifications.js'
import { logAuditEvent } from '../lib/auditLog.js'
import type { AuthedUser } from '../lib/auth.js'

const COLUMNS =
  'id, organization_id, requested_by, reason, additional_comments, requested_at, status, resolved_at, resolved_by'

const REASONS = ['Too expensive', 'Not using it enough', 'Missing features', 'Switching to another tool', 'Other']

/** Body: { reason, additional_comments? } — the Organization's own Admin
 * submitting from their Settings > Billing area. This never cancels/
 * deactivates anything by itself; it only notifies the Super Admin and
 * creates a record for them to review and action manually. */
export async function createCancellationRequest(event: HandlerEvent, user: AuthedUser) {
  requireAdminOrAbove(user)
  const orgId = resolveOrganizationId(user, event)
  if (!orgId) throw new HttpError(400, 'This account is not linked to an organization')
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')

  const reason = (body.reason ?? '').trim()
  if (!REASONS.includes(reason)) throw new HttpError(400, `reason must be one of: ${REASONS.join(', ')}`)
  const additional_comments = (body.additional_comments ?? '').trim() || null

  const { data: org, error: orgErr } = await supabase.from('organizations').select('name').eq('id', orgId).maybeSingle()
  if (orgErr) throw new HttpError(500, orgErr.message)
  if (!org) throw new HttpError(404, 'Organization not found')

  const { data, error } = await supabase
    .from('cancellation_requests')
    .insert({ organization_id: orgId, requested_by: user.id, reason, additional_comments })
    .select(COLUMNS)
    .single()
  if (error) throw new HttpError(500, error.message)

  await notifySuperAdmins({
    type: 'cancellation_request',
    title: 'Cancellation request submitted',
    message: `${org.name} requested to cancel their subscription (${reason}).`,
    link_route: '/cancellation-requests',
    related_entity_id: data.id,
    related_entity_type: 'cancellation_request',
  })

  await logAuditEvent('cancellation_request_submitted', user, event, {
    organizationId: orgId,
    metadata: { organizationName: org.name, reason },
  })

  return json(201, data)
}

/** Super Admin only — every cancellation request across every Organization,
 * newest first, with the requester's name/email and the Organization's name
 * attached for display. */
export async function listCancellationRequests(user: AuthedUser) {
  requireSuperAdmin(user)
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('cancellation_requests').select(COLUMNS).order('requested_at', { ascending: false })
  if (error) throw new HttpError(500, error.message)

  const orgIds = [...new Set((data ?? []).map((r) => r.organization_id))]
  const requesterIds = [...new Set((data ?? []).map((r) => r.requested_by).filter(Boolean))] as string[]

  const [{ data: orgs }, { data: requesters }] = await Promise.all([
    orgIds.length > 0 ? supabase.from('organizations').select('id, name').in('id', orgIds) : Promise.resolve({ data: [] as any[] }),
    requesterIds.length > 0
      ? supabase.from('profiles').select('id, nickname, email').in('id', requesterIds)
      : Promise.resolve({ data: [] as any[] }),
  ])
  const orgNameById = new Map((orgs ?? []).map((o: any) => [o.id, o.name]))
  const requesterById = new Map((requesters ?? []).map((p: any) => [p.id, p]))

  return json(200, {
    requests: (data ?? []).map((r) => ({
      ...r,
      organization_name: orgNameById.get(r.organization_id) ?? 'Unknown Organization',
      requested_by_name: r.requested_by ? requesterById.get(r.requested_by)?.nickname || requesterById.get(r.requested_by)?.email || null : null,
    })),
  })
}

/** Marks a request "acknowledged" once the Super Admin has manually
 * processed it — this alone never changes the Organization's subscription;
 * see organizations.ts's setOrganizationCancelled for that separate action. */
export async function acknowledgeCancellationRequest(id: string, event: HandlerEvent, user: AuthedUser) {
  requireSuperAdmin(user)
  const supabase = getSupabaseAdmin()

  const { data: existing, error: fetchErr } = await supabase.from('cancellation_requests').select(COLUMNS).eq('id', id).maybeSingle()
  if (fetchErr) throw new HttpError(500, fetchErr.message)
  if (!existing) throw new HttpError(404, 'Cancellation request not found')
  if (existing.status === 'acknowledged') throw new HttpError(400, 'This request has already been acknowledged')

  const { data, error } = await supabase
    .from('cancellation_requests')
    .update({ status: 'acknowledged', resolved_at: new Date().toISOString(), resolved_by: user.id })
    .eq('id', id)
    .select(COLUMNS)
    .single()
  if (error) throw new HttpError(500, error.message)

  await logAuditEvent('cancellation_request_acknowledged', user, event, {
    organizationId: existing.organization_id,
    metadata: { cancellationRequestId: id },
  })

  return json(200, data)
}
