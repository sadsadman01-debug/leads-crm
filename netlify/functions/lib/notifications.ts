import { getSupabaseAdmin } from './supabaseAdmin.js'

export type NotificationType =
  | 'signup_request'
  | 'password_reset_request'
  | 'mfa_reset_request'
  | 'lead_assigned'
  | 'deal_assigned'
  | 'follow_up_overdue'
  | 'deal_closing_soon'
  | 'deal_closed_won'
  | 'deal_closed_lost'
  | 'affiliate_application'
  | 'withdrawal_request'
  | 'product_review_reply'
  | 'cancellation_request'

interface NotificationInput {
  recipient_profile_id: string
  organization_id: string | null
  type: NotificationType
  title: string
  message: string
  link_route?: string | null
  related_entity_id?: string | null
  related_entity_type?: string | null
}

export async function createNotification(input: NotificationInput) {
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('notifications').insert({
    recipient_profile_id: input.recipient_profile_id,
    organization_id: input.organization_id,
    type: input.type,
    title: input.title,
    message: input.message,
    link_route: input.link_route ?? null,
    related_entity_id: input.related_entity_id ?? null,
    related_entity_type: input.related_entity_type ?? null,
  })
  // Notifications are a best-effort side channel — never let a failure here
  // block the actual mutation (lead save, deal close, etc.) that triggered it.
  if (error) console.error('Failed to create notification:', error.message)
}

async function createNotifications(inputs: NotificationInput[]) {
  if (inputs.length === 0) return
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('notifications').insert(
    inputs.map((input) => ({
      recipient_profile_id: input.recipient_profile_id,
      organization_id: input.organization_id,
      type: input.type,
      title: input.title,
      message: input.message,
      link_route: input.link_route ?? null,
      related_entity_id: input.related_entity_id ?? null,
      related_entity_type: input.related_entity_type ?? null,
    }))
  )
  if (error) console.error('Failed to create notifications:', error.message)
}

/** All active Super Admins — platform-level notifications have no organization_id. */
export async function notifySuperAdmins(fields: Omit<NotificationInput, 'recipient_profile_id' | 'organization_id'>) {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase.from('profiles').select('id').eq('role', 'super_admin').eq('is_active', true)
  await createNotifications((data ?? []).map((p) => ({ ...fields, recipient_profile_id: p.id, organization_id: null })))
}

/** Every active Admin within a specific organization (normally exactly one, per
 * the existing one-Admin-per-org rule — queried by role rather than hardcoded
 * to stay correct if that rule ever changes). */
export async function notifyOrgAdmins(orgId: string, fields: Omit<NotificationInput, 'recipient_profile_id' | 'organization_id'>) {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase.from('profiles').select('id').eq('role', 'admin').eq('organization_id', orgId).eq('is_active', true)
  await createNotifications((data ?? []).map((p) => ({ ...fields, recipient_profile_id: p.id, organization_id: orgId })))
}

/** A Lead/Deal reassignment — skipped entirely if there's no new assignee, or
 * the new assignee is the same person performing the change (no point
 * notifying yourself that you assigned something to yourself). */
export async function notifyAssignment(params: {
  assigneeId: string | null | undefined
  actorId: string
  organizationId: string | null
  type: 'lead_assigned' | 'deal_assigned'
  title: string
  message: string
  linkRoute: string
  entityId: string
  entityType: 'lead' | 'deal'
}) {
  if (!params.assigneeId || params.assigneeId === params.actorId) return
  await createNotification({
    recipient_profile_id: params.assigneeId,
    organization_id: params.organizationId,
    type: params.type,
    title: params.title,
    message: params.message,
    link_route: params.linkRoute,
    related_entity_id: params.entityId,
    related_entity_type: params.entityType,
  })
}

/** True if a notification of this type/entity already exists for this
 * recipient since `since` — the dedup check every periodic/aggregate
 * notification path uses before inserting, so a lazily-triggered check
 * (e.g. on every Dashboard load) never spams duplicates. */
async function alreadyNotified(recipientId: string, type: NotificationType, relatedEntityId: string | null, since: Date): Promise<boolean> {
  const supabase = getSupabaseAdmin()
  let query = supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_profile_id', recipientId)
    .eq('type', type)
    .gte('created_at', since.toISOString())
  query = relatedEntityId ? query.eq('related_entity_id', relatedEntityId) : query.is('related_entity_id', null)
  const { count } = await query
  return Boolean(count && count > 0)
}

/** At most one follow_up_overdue digest per recipient per calendar day (UTC) —
 * called lazily from GET /dashboard/summary, mirroring the same "check-and-
 * refresh on next request" pattern already used for exchange rates, rather
 * than needing a cron job this app has never had. */
export async function maybeCreateOverdueDigest(params: {
  recipientId: string
  organizationId: string | null
  overdueCount: number
  scopeLabel: string // e.g. "in your Organization" or "assigned to you" — a self-contained phrase, no preposition assumed
  linkRoute: string
}) {
  if (params.overdueCount <= 0) return
  const startOfToday = new Date()
  startOfToday.setUTCHours(0, 0, 0, 0)
  if (await alreadyNotified(params.recipientId, 'follow_up_overdue', null, startOfToday)) return

  await createNotification({
    recipient_profile_id: params.recipientId,
    organization_id: params.organizationId,
    type: 'follow_up_overdue',
    title: 'Follow-ups overdue',
    message: `${params.overdueCount} lead${params.overdueCount === 1 ? '' : 's'} ${params.scopeLabel} ${params.overdueCount === 1 ? 'is' : 'are'} overdue for follow-up.`,
    link_route: params.linkRoute,
  })
}

/** A single lifetime deal_closing_soon notification per deal — fired once when
 * it first enters the "within N days" or "past due" window, never repeated on
 * every subsequent Dashboard load for the same deal. */
export async function maybeNotifyDealDate(params: {
  recipientId: string
  organizationId: string | null
  dealId: string
  dealName: string
  isOverdue: boolean
}) {
  const epoch = new Date(0)
  if (await alreadyNotified(params.recipientId, 'deal_closing_soon', params.dealId, epoch)) return

  await createNotification({
    recipient_profile_id: params.recipientId,
    organization_id: params.organizationId,
    type: 'deal_closing_soon',
    title: params.isOverdue ? 'Deal past its expected close date' : 'Deal closing soon',
    message: params.isOverdue
      ? `"${params.dealName}" has passed its expected close date.`
      : `"${params.dealName}" is expected to close within 3 days.`,
    link_route: '/deals',
    related_entity_id: params.dealId,
    related_entity_type: 'deal',
  })
}
