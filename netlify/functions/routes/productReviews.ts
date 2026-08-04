import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import { requireSuperAdminOrStaff } from '../lib/permissions.js'
import { logAuditEvent } from '../lib/auditLog.js'
import { createNotification } from '../lib/notifications.js'
import { computeReviewStatus } from '../lib/productReviewSchedule.js'
import type { AuthedUser } from '../lib/auth.js'

const COLUMNS =
  'id, profile_id, organization_id, review_number, rating, comment, suggestions, submitted_at, super_admin_reply, replied_at, replied_by'

/** Only Admin/User accounts are on the review schedule — Super Admin and
 * Affiliate accounts never see the mandatory popup or submit reviews. */
function requireOnReviewSchedule(user: AuthedUser) {
  if (user.role !== 'admin' && user.role !== 'user') {
    throw new HttpError(403, 'This account is not on the product review schedule')
  }
}

/** Cheap once-per-profile-load check — called from getMyProfile (team.ts) so
 * the frontend learns whether a review is due as part of the request it
 * already makes on every session/page load, with no extra round trip. */
export async function getReviewStatus(user: AuthedUser): Promise<{ due: boolean; pendingReviewNumber: number | null }> {
  if (user.role !== 'admin' && user.role !== 'user') return { due: false, pendingReviewNumber: null }

  const supabase = getSupabaseAdmin()
  const [{ data: profile, error: profileError }, { count, error: countError }] = await Promise.all([
    supabase.from('profiles').select('created_at').eq('id', user.id).single(),
    supabase.from('product_reviews').select('id', { count: 'exact', head: true }).eq('profile_id', user.id),
  ])
  if (profileError || !profile) throw new HttpError(500, profileError?.message ?? 'Profile not found')
  if (countError) throw new HttpError(500, countError.message)

  const status = computeReviewStatus(profile.created_at, count ?? 0)
  return { due: status.due, pendingReviewNumber: status.pendingReviewNumber }
}

/** Body: { rating, comment?, suggestions? }. review_number is always computed
 * server-side from the caller's own submitted count — never trusts the client. */
export async function submitReview(event: HandlerEvent, user: AuthedUser) {
  requireOnReviewSchedule(user)
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')

  const rating = Number(body.rating)
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new HttpError(400, 'rating must be an integer from 1 to 5')
  const comment = typeof body.comment === 'string' ? body.comment.trim() || null : null
  const suggestions = typeof body.suggestions === 'string' ? body.suggestions.trim() || null : null

  const { count, error: countError } = await supabase
    .from('product_reviews')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', user.id)
  if (countError) throw new HttpError(500, countError.message)
  const reviewNumber = (count ?? 0) + 1

  const { data, error } = await supabase
    .from('product_reviews')
    .insert({
      profile_id: user.id,
      organization_id: user.organization_id,
      review_number: reviewNumber,
      rating,
      comment,
      suggestions,
    })
    .select(COLUMNS)
    .single()
  if (error) throw new HttpError(500, error.message)

  await logAuditEvent('product_review_submitted', user, event, {
    metadata: { reviewId: data.id, reviewNumber, rating },
  })

  return json(201, data)
}

export async function listMyReviews(user: AuthedUser) {
  requireOnReviewSchedule(user)
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('product_reviews')
    .select(COLUMNS)
    .eq('profile_id', user.id)
    .order('review_number', { ascending: true })
  if (error) throw new HttpError(500, error.message)
  return json(200, { reviews: data ?? [] })
}

/** Super Admin only — every submitted review platform-wide, with optional
 * filters. Joins are stitched in JS (batch-fetch profiles/organizations by id)
 * since there's no direct FK-embed convention for cross-role joins elsewhere
 * in this codebase (same approach as listWithdrawalRequests). */
export async function listAllReviews(event: HandlerEvent, user: AuthedUser) {
  requireSuperAdminOrStaff(user)
  const supabase = getSupabaseAdmin()
  const params = event.queryStringParameters ?? {}

  let query = supabase.from('product_reviews').select(COLUMNS).order('submitted_at', { ascending: false })
  if (params.rating) query = query.eq('rating', Number(params.rating))
  if (params.organization_id) query = query.eq('organization_id', params.organization_id)
  if (params.reply_status === 'replied') query = query.not('super_admin_reply', 'is', null)
  else if (params.reply_status === 'not_replied') query = query.is('super_admin_reply', null)
  if (params.date_from) query = query.gte('submitted_at', params.date_from)
  if (params.date_to) query = query.lte('submitted_at', params.date_to)

  const { data: rows, error } = await query
  if (error) throw new HttpError(500, error.message)

  const profileIds = [...new Set((rows ?? []).map((r) => r.profile_id))]
  const orgIds = [...new Set((rows ?? []).map((r) => r.organization_id).filter(Boolean))] as string[]
  const [{ data: profiles }, { data: orgs }] = await Promise.all([
    profileIds.length > 0
      ? supabase.from('profiles').select('id, nickname, email, role').in('id', profileIds)
      : Promise.resolve({ data: [] as any[] }),
    orgIds.length > 0 ? supabase.from('organizations').select('id, name').in('id', orgIds) : Promise.resolve({ data: [] as any[] }),
  ])
  const profileById = new Map((profiles ?? []).map((p: any) => [p.id, p]))
  const orgById = new Map((orgs ?? []).map((o: any) => [o.id, o]))

  let enriched = (rows ?? []).map((r) => {
    const reviewer = profileById.get(r.profile_id)
    return {
      ...r,
      reviewer_name: reviewer?.nickname || reviewer?.email || 'Unknown',
      reviewer_role: reviewer?.role ?? null,
      organization_name: r.organization_id ? orgById.get(r.organization_id)?.name ?? null : null,
    }
  })
  if (params.role) enriched = enriched.filter((r) => r.reviewer_role === params.role)

  return json(200, { reviews: enriched })
}

/** Super Admin only — average rating (all-time and optionally a selected
 * range), total count, and a 1-5 star distribution for the stats row/chart. */
export async function getReviewStats(event: HandlerEvent, user: AuthedUser) {
  requireSuperAdminOrStaff(user)
  const supabase = getSupabaseAdmin()
  const params = event.queryStringParameters ?? {}

  const { data: allRows, error } = await supabase.from('product_reviews').select('rating, submitted_at')
  if (error) throw new HttpError(500, error.message)
  const rows = allRows ?? []

  const average = (ratings: number[]) => (ratings.length > 0 ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length : null)

  const allRatings = rows.map((r) => r.rating)
  let rangeRatings = allRatings
  if (params.date_from || params.date_to) {
    rangeRatings = rows
      .filter((r) => (!params.date_from || r.submitted_at >= params.date_from) && (!params.date_to || r.submitted_at <= params.date_to))
      .map((r) => r.rating)
  }

  const distribution: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 }
  for (const r of allRatings) distribution[String(r)] = (distribution[String(r)] ?? 0) + 1

  return json(200, {
    average_all_time: average(allRatings),
    average_range: average(rangeRatings),
    total_reviews: allRatings.length,
    distribution,
  })
}

/** Body: { reply }. Works identically for a first reply or editing an
 * existing one — always just overwrites super_admin_reply/replied_at/replied_by. */
export async function replyToReview(id: string, event: HandlerEvent, user: AuthedUser) {
  requireSuperAdminOrStaff(user)
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')

  const reply = (body.reply ?? '').trim()
  if (!reply) throw new HttpError(400, 'reply is required')

  const { data: existing, error: fetchError } = await supabase
    .from('product_reviews')
    .select('id, profile_id, organization_id, review_number')
    .eq('id', id)
    .maybeSingle()
  if (fetchError) throw new HttpError(500, fetchError.message)
  if (!existing) throw new HttpError(404, 'Review not found')

  const { data, error } = await supabase
    .from('product_reviews')
    .update({ super_admin_reply: reply, replied_at: new Date().toISOString(), replied_by: user.id })
    .eq('id', id)
    .select(COLUMNS)
    .single()
  if (error) throw new HttpError(500, error.message)

  await createNotification({
    recipient_profile_id: existing.profile_id,
    organization_id: existing.organization_id,
    type: 'product_review_reply',
    title: 'The Leadify team replied to your feedback',
    message: `Your review #${existing.review_number} received a reply — check My Feedback in Settings.`,
    link_route: '/settings',
    related_entity_id: existing.id,
    related_entity_type: 'product_review',
  })

  await logAuditEvent('product_review_reply_sent', user, event, {
    metadata: { reviewId: id, targetProfileId: existing.profile_id },
    targetProfileId: existing.profile_id,
  })

  return json(200, data)
}
