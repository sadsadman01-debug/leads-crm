import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import type { AuthedUser } from '../lib/auth.js'

const COLUMNS =
  'id, type, title, message, link_route, related_entity_id, related_entity_type, is_read, created_at'

/** GET /notifications?page=&pageSize=&status=unread|read|all&type=... — always
 * implicitly scoped to the caller's own notifications; RLS backs this up as a
 * database-level guarantee, but the query itself never even asks for anyone else's. */
export async function listNotifications(event: HandlerEvent, user: AuthedUser) {
  const supabase = getSupabaseAdmin()
  const params = event.queryStringParameters ?? {}
  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1)
  const pageSize = Math.min(100, Math.max(1, parseInt(params.pageSize ?? '20', 10) || 20))
  const status = params.status === 'unread' || params.status === 'read' ? params.status : 'all'
  const type = params.type || undefined

  let query = supabase.from('notifications').select(COLUMNS, { count: 'exact' }).eq('recipient_profile_id', user.id)
  if (status === 'unread') query = query.eq('is_read', false)
  if (status === 'read') query = query.eq('is_read', true)
  if (type) query = query.eq('type', type)

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const { data, error, count } = await query.order('created_at', { ascending: false }).range(from, to)
  if (error) throw new HttpError(500, error.message)

  return json(200, { notifications: data ?? [], page, pageSize, total: count ?? 0 })
}

/** GET /notifications/unread-count — cheap, dedicated endpoint for the bell
 * badge (polled every 30-45s as a Realtime fallback/safety net). */
export async function getUnreadCount(user: AuthedUser) {
  const supabase = getSupabaseAdmin()
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_profile_id', user.id)
    .eq('is_read', false)
  if (error) throw new HttpError(500, error.message)
  return json(200, { count: count ?? 0 })
}

export async function markNotificationRead(id: string, user: AuthedUser) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', id)
    .eq('recipient_profile_id', user.id)
    .select(COLUMNS)
    .maybeSingle()
  if (error) throw new HttpError(500, error.message)
  if (!data) throw new HttpError(404, 'Notification not found')
  return json(200, data)
}

export async function markAllNotificationsRead(user: AuthedUser) {
  const supabase = getSupabaseAdmin()
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('recipient_profile_id', user.id)
    .eq('is_read', false)
  if (error) throw new HttpError(500, error.message)
  return json(200, { success: true })
}
