import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import { requireSuperAdmin } from '../lib/permissions.js'
import { logAuditEvent } from '../lib/auditLog.js'
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

/** Body: { title, message, audience, target_organization_ids? }. Publishes
 * the announcement row — delivery to recipients is entirely pull-based (a
 * Dashboard/Affiliate-Dashboard banner query, see getMyActiveAnnouncements
 * below), not a fan-out at publish time; there is nothing else to do here. */
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

  await logAuditEvent('announcement_created', user, event, {
    metadata: { announcementId: announcement.id, title, audience, targetOrgIds },
  })
  return json(201, announcement)
}

/** Body: { is_active: false }. "Unpublishing" only stops the announcement
 * from being newly surfaced as a banner — recipients who haven't dismissed
 * it yet simply stop seeing it on their next Dashboard load; there is no
 * re-publish/edit-content flow. */
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

async function excludeDismissed(announcements: any[], profileId: string) {
  if (announcements.length === 0) return []
  const supabase = getSupabaseAdmin()
  const { data: dismissed, error } = await supabase
    .from('announcement_dismissals')
    .select('announcement_id')
    .eq('profile_id', profileId)
    .in(
      'announcement_id',
      announcements.map((a) => a.id)
    )
  if (error) throw new HttpError(500, error.message)
  const dismissedIds = new Set((dismissed ?? []).map((d) => d.announcement_id))
  return announcements.filter((a) => !dismissedIds.has(a.id))
}

/** Any authenticated Admin/User/Affiliate — every currently-active
 * announcement that targets THEM specifically, minus any they've already
 * dismissed. Super Admin always gets an empty list back: Announcements are
 * something they author, never something they receive on their own
 * platform-level views. */
export async function getMyActiveAnnouncements(user: AuthedUser) {
  const supabase = getSupabaseAdmin()

  if (user.role === 'super_admin') return json(200, { announcements: [] })

  if (user.role === 'affiliate') {
    const { data: affiliate, error: affErr } = await supabase
      .from('affiliates')
      .select('id')
      .eq('profile_id', user.id)
      .eq('status', 'active')
      .maybeSingle()
    if (affErr) throw new HttpError(500, affErr.message)
    if (!affiliate) return json(200, { announcements: [] })

    const { data, error } = await supabase
      .from('announcements')
      .select(COLUMNS)
      .eq('audience', 'affiliates')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
    if (error) throw new HttpError(500, error.message)
    return json(200, { announcements: await excludeDismissed(data ?? [], user.id) })
  }

  // Admin/User — scoped to their own organization.
  const orgId = user.organization_id
  if (!orgId) return json(200, { announcements: [] })

  const { data, error } = await supabase
    .from('announcements')
    .select(COLUMNS)
    .eq('is_active', true)
    .in('audience', ['all', 'admins_only', 'specific_organizations'])
    .order('created_at', { ascending: false })
  if (error) throw new HttpError(500, error.message)

  const matching = (data ?? []).filter((a) => {
    if (a.audience === 'all') return true
    if (a.audience === 'admins_only') return user.role === 'admin'
    if (a.audience === 'specific_organizations') return Array.isArray(a.target_organization_ids) && a.target_organization_ids.includes(orgId)
    return false
  })

  return json(200, { announcements: await excludeDismissed(matching, user.id) })
}

/** Any authenticated Admin/User/Affiliate — dismisses one announcement for
 * themselves only; it never reappears in getMyActiveAnnouncements for this
 * profile again, regardless of what other recipients do with it. */
export async function dismissAnnouncement(id: string, user: AuthedUser) {
  const supabase = getSupabaseAdmin()
  const { error } = await supabase
    .from('announcement_dismissals')
    .upsert({ announcement_id: id, profile_id: user.id }, { onConflict: 'announcement_id,profile_id' })
  if (error) throw new HttpError(500, error.message)
  return json(200, { success: true })
}
