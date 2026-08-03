import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import { requireSuperAdmin } from '../lib/permissions.js'
import { logAuditEvent } from '../lib/auditLog.js'
import { createNotifications } from '../lib/notifications.js'
import type { AuthedUser } from '../lib/auth.js'

const COLUMNS = 'id, title, message, audience, target_organization_ids, created_by, created_at, is_active'

type Audience = 'all' | 'admins_only' | 'specific_organizations' | 'affiliates'
const AUDIENCES: Audience[] = ['all', 'admins_only', 'specific_organizations', 'affiliates']

export async function listAnnouncements(user: AuthedUser) {
  requireSuperAdmin(user)
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('announcements').select(COLUMNS).order('created_at', { ascending: false })
  if (error) throw new HttpError(500, error.message)
  return json(200, { announcements: data ?? [] })
}

/** Resolves the recipient profile ids (+ their own organization_id, for
 * correctly-scoped notification rows) for a given audience — the one query
 * per audience type, never a per-recipient round trip. */
async function resolveAudienceRecipients(
  audience: Audience,
  targetOrgIds: string[] | null
): Promise<Array<{ id: string; organization_id: string | null }>> {
  const supabase = getSupabaseAdmin()

  if (audience === 'affiliates') {
    const { data, error } = await supabase.from('affiliates').select('profile_id').eq('status', 'active')
    if (error) throw new HttpError(500, error.message)
    return (data ?? []).map((a) => ({ id: a.profile_id as string, organization_id: null }))
  }

  let query = supabase.from('profiles').select('id, organization_id').eq('is_active', true)
  if (audience === 'admins_only') {
    query = query.eq('role', 'admin')
  } else {
    query = query.in('role', ['admin', 'user'])
  }
  if (audience === 'specific_organizations') {
    if (!targetOrgIds || targetOrgIds.length === 0) throw new HttpError(400, 'target_organization_ids is required for audience "specific_organizations"')
    query = query.in('organization_id', targetOrgIds)
  }

  const { data, error } = await query
  if (error) throw new HttpError(500, error.message)
  return (data ?? []).map((p) => ({ id: p.id as string, organization_id: (p.organization_id as string | null) ?? null }))
}

/** Body: { title, message, audience, target_organization_ids? }. Publishes
 * the announcement row and, in the same request, fans it out into one
 * notification per matching recipient via a single bulk insert — this is a
 * broadcast, not a loop of individual sends. */
export async function createAnnouncement(event: HandlerEvent, user: AuthedUser) {
  requireSuperAdmin(user)
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')

  const title = (body.title ?? '').trim()
  if (!title) throw new HttpError(400, 'title is required')
  const message = (body.message ?? '').trim()
  if (!message) throw new HttpError(400, 'message is required')
  if (!AUDIENCES.includes(body.audience)) throw new HttpError(400, `audience must be one of: ${AUDIENCES.join(', ')}`)
  const audience: Audience = body.audience

  let targetOrgIds: string[] | null = null
  if (audience === 'specific_organizations') {
    if (!Array.isArray(body.target_organization_ids) || body.target_organization_ids.length === 0) {
      throw new HttpError(400, 'target_organization_ids must be a non-empty array when audience is "specific_organizations"')
    }
    targetOrgIds = body.target_organization_ids
  }

  const { data: announcement, error } = await supabase
    .from('announcements')
    .insert({ title, message, audience, target_organization_ids: targetOrgIds, created_by: user.id })
    .select(COLUMNS)
    .single()
  if (error) throw new HttpError(500, error.message)

  const recipients = await resolveAudienceRecipients(audience, targetOrgIds)
  await createNotifications(
    recipients.map((r) => ({
      recipient_profile_id: r.id,
      organization_id: r.organization_id,
      type: 'announcement',
      title,
      message,
      related_entity_id: announcement.id,
      related_entity_type: 'announcement',
    }))
  )

  await logAuditEvent('announcement_created', user, event, {
    metadata: { announcementId: announcement.id, title, audience, recipientCount: recipients.length },
  })
  return json(201, announcement)
}

/** Body: { is_active: false }. "Unpublishing" only stops the announcement
 * from being newly surfaced — already-delivered notifications remain in
 * recipients' history untouched; there is no re-publish/edit-content flow. */
export async function deactivateAnnouncement(id: string, event: HandlerEvent, user: AuthedUser) {
  requireSuperAdmin(user)
  const supabase = getSupabaseAdmin()

  const { data: existing, error: fetchErr } = await supabase.from('announcements').select('title').eq('id', id).maybeSingle()
  if (fetchErr) throw new HttpError(500, fetchErr.message)
  if (!existing) throw new HttpError(404, 'Announcement not found')

  const { data, error } = await supabase.from('announcements').update({ is_active: false }).eq('id', id).select(COLUMNS).single()
  if (error) throw new HttpError(500, error.message)

  await logAuditEvent('announcement_deactivated', user, event, { metadata: { announcementId: id, title: existing.title } })
  return json(200, data)
}
