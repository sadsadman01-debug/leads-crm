import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import { requireFeaturePermission, resolveOrganizationId, scopeToOrg, requireRowInOrgScope } from '../lib/permissions.js'
import type { AuthedUser } from '../lib/auth.js'

const CHANNELS = ['email', 'whatsapp', 'linkedin'] as const
type Channel = (typeof CHANNELS)[number]

const STAGE_COLUMNS = 'id, channel, stage_number, stage_label, interval_days, default_template_id, display_order, is_active'
const MAX_ACTIVE_STAGES_PER_CHANNEL = 6

/** Everyone with a session can read the org's current sequences (used by the
 * Lead Detail checklist, Dashboard, Filters, etc.) — only mutation is gated. */
export async function listOutreachStages(event: HandlerEvent, user: AuthedUser) {
  const supabase = getSupabaseAdmin()
  const orgId = resolveOrganizationId(user, event)
  let query = supabase.from('outreach_sequence_stages').select(STAGE_COLUMNS).eq('is_active', true)
  query = scopeToOrg(query as any, orgId) as any
  const { data, error } = await query.order('channel', { ascending: true }).order('stage_number', { ascending: true })
  if (error) throw new HttpError(500, error.message)
  return json(200, { stages: data ?? [] })
}

/** Body: { channel, stage_label?, interval_days?, default_template_id? } — always
 * appended as the next stage_number in that channel's sequence (stage_number is
 * permanent once assigned, even across a later deactivation, so this looks at
 * every row ever created for the channel, not just active ones). */
export async function createOutreachStage(event: HandlerEvent, user: AuthedUser) {
  requireFeaturePermission(user, 'canManageOutreachSequences')
  const supabase = getSupabaseAdmin()
  const orgId = resolveOrganizationId(user, event)
  const body = JSON.parse(event.body || '{}')

  const channel = body.channel
  if (!CHANNELS.includes(channel)) throw new HttpError(400, `channel must be one of: ${CHANNELS.join(', ')}`)

  let activeCountQuery = supabase
    .from('outreach_sequence_stages')
    .select('id', { count: 'exact', head: true })
    .eq('channel', channel)
    .eq('is_active', true)
  activeCountQuery = scopeToOrg(activeCountQuery as any, orgId) as any
  const { count: activeCount, error: activeCountErr } = await activeCountQuery
  if (activeCountErr) throw new HttpError(500, activeCountErr.message)
  if ((activeCount ?? 0) >= MAX_ACTIVE_STAGES_PER_CHANNEL) {
    throw new HttpError(400, `A channel can have at most ${MAX_ACTIVE_STAGES_PER_CHANNEL} active stages`)
  }

  let maxQuery = supabase.from('outreach_sequence_stages').select('stage_number').eq('channel', channel)
  maxQuery = scopeToOrg(maxQuery as any, orgId) as any
  const { data: maxRow, error: maxErr } = await maxQuery.order('stage_number', { ascending: false }).limit(1).maybeSingle()
  if (maxErr) throw new HttpError(500, maxErr.message)
  const stageNumber = (maxRow?.stage_number ?? -1) + 1

  const stageLabel = (body.stage_label ?? '').trim() || `Follow-up ${stageNumber}`
  const intervalDays = stageNumber === 0 ? null : Number(body.interval_days) > 0 ? Number(body.interval_days) : 3
  if (body.default_template_id) await requireRowInOrgScope('templates', body.default_template_id, orgId)

  const { data, error } = await supabase
    .from('outreach_sequence_stages')
    .insert({
      organization_id: orgId,
      channel,
      stage_number: stageNumber,
      stage_label: stageLabel,
      interval_days: intervalDays,
      default_template_id: body.default_template_id || null,
      display_order: stageNumber,
    })
    .select(STAGE_COLUMNS)
    .single()

  if (error) throw new HttpError(500, error.message)
  return json(201, data)
}

/** Body: { stage_label?, interval_days?, default_template_id? } — channel/stage_number/is_active are immutable here. */
export async function updateOutreachStage(id: string, event: HandlerEvent, user: AuthedUser) {
  requireFeaturePermission(user, 'canManageOutreachSequences')
  const supabase = getSupabaseAdmin()
  const orgId = resolveOrganizationId(user, event)
  await requireRowInOrgScope('outreach_sequence_stages', id, orgId)
  const body = JSON.parse(event.body || '{}')

  const { data: existing, error: fetchErr } = await supabase
    .from('outreach_sequence_stages')
    .select('stage_number')
    .eq('id', id)
    .single()
  if (fetchErr) throw new HttpError(500, fetchErr.message)

  const update: Record<string, any> = {}
  if ('stage_label' in body) {
    const label = (body.stage_label ?? '').trim()
    if (!label) throw new HttpError(400, 'stage_label cannot be empty')
    update.stage_label = label
  }
  if ('interval_days' in body) {
    if (existing.stage_number === 0) throw new HttpError(400, 'The initial contact stage has no interval')
    const days = Number(body.interval_days)
    if (!Number.isInteger(days) || days <= 0) throw new HttpError(400, 'interval_days must be a positive integer')
    update.interval_days = days
  }
  if ('default_template_id' in body) {
    if (body.default_template_id) await requireRowInOrgScope('templates', body.default_template_id, orgId)
    update.default_template_id = body.default_template_id || null
  }

  if (Object.keys(update).length === 0) throw new HttpError(400, 'Nothing to update')

  const { data, error } = await supabase.from('outreach_sequence_stages').update(update).eq('id', id).select(STAGE_COLUMNS).single()
  if (error) throw new HttpError(500, error.message)
  return json(200, data)
}

/** Soft-deactivation only — never deletes the stage row or its lead_outreach_progress
 * history. Returns affected_lead_count so the frontend can show a confirmation
 * warning ("N leads have history on this stage") before the user proceeds — this
 * count does not block the action, it's informational, since nothing is destroyed. */
export async function deactivateOutreachStage(id: string, event: HandlerEvent, user: AuthedUser) {
  requireFeaturePermission(user, 'canManageOutreachSequences')
  const supabase = getSupabaseAdmin()
  const orgId = resolveOrganizationId(user, event)
  await requireRowInOrgScope('outreach_sequence_stages', id, orgId)

  const { data: stage, error: fetchErr } = await supabase
    .from('outreach_sequence_stages')
    .select('id, channel, stage_number')
    .eq('id', id)
    .single()
  if (fetchErr) throw new HttpError(500, fetchErr.message)

  if (stage.stage_number === 0) throw new HttpError(400, 'The initial contact stage cannot be removed')

  let activeCountQuery = supabase
    .from('outreach_sequence_stages')
    .select('id', { count: 'exact', head: true })
    .eq('channel', stage.channel)
    .eq('is_active', true)
  activeCountQuery = scopeToOrg(activeCountQuery as any, orgId) as any
  const { count: activeCount, error: activeCountErr } = await activeCountQuery
  if (activeCountErr) throw new HttpError(500, activeCountErr.message)
  if ((activeCount ?? 0) <= 1) throw new HttpError(400, 'A channel must keep at least one active stage')

  const { count: affectedCount, error: countErr } = await supabase
    .from('lead_outreach_progress')
    .select('id', { count: 'exact', head: true })
    .eq('outreach_sequence_stage_id', id)
    .not('completed_at', 'is', null)
  if (countErr) throw new HttpError(500, countErr.message)

  // ?dry_run=true only reports the affected-lead count for the frontend's
  // pre-action confirmation dialog — it never deactivates anything itself.
  if (event.queryStringParameters?.dry_run === 'true') {
    return json(200, { stage: null, affected_lead_count: affectedCount ?? 0 })
  }

  const { data, error } = await supabase
    .from('outreach_sequence_stages')
    .update({ is_active: false })
    .eq('id', id)
    .select(STAGE_COLUMNS)
    .single()
  if (error) throw new HttpError(500, error.message)

  return json(200, { stage: data, affected_lead_count: affectedCount ?? 0 })
}
