import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import { requireAdminOrAbove, requireAal2IfEnrolled, resolveOrganizationId, scopeToOrg } from '../lib/permissions.js'
import type { AuthedUser } from '../lib/auth.js'

const SNAPSHOT_COLUMNS =
  'id, record_type, organization_id, survivor_id, loser_id, merged_by, merged_at, restored_at, loser_snapshot'

/** "Recently Merged" recovery screen — every merge (Lead or Deal) performed
 * within this organization scope, most recent first. The same list backs
 * both the immediate post-merge "Undo" toast and the longer-lived Settings
 * recovery screen; there's nothing time-limited about the query itself. */
export async function listMergeSnapshots(event: HandlerEvent, user: AuthedUser) {
  requireAdminOrAbove(user)
  const supabase = getSupabaseAdmin()
  const orgId = resolveOrganizationId(user, event)

  let query = supabase.from('merge_snapshots').select(SNAPSHOT_COLUMNS)
  query = scopeToOrg(query as any, orgId) as any
  const { data, error } = await query.order('merged_at', { ascending: false }).limit(100)
  if (error) throw new HttpError(500, error.message)
  const rows = data ?? []

  const profileIds = [...new Set(rows.map((r) => r.merged_by).filter(Boolean))] as string[]
  const { data: profiles } =
    profileIds.length > 0
      ? await supabase.from('profiles').select('id, nickname, email').in('id', profileIds)
      : { data: [] as any[] }
  const profileById = new Map((profiles ?? []).map((p: any) => [p.id, p]))

  return json(200, {
    snapshots: rows.map((r) => ({
      id: r.id,
      record_type: r.record_type,
      survivor_id: r.survivor_id,
      loser_id: r.loser_id,
      loser_label: r.record_type === 'lead' ? r.loser_snapshot?.company_name : r.loser_snapshot?.name,
      merged_by_name: r.merged_by ? profileById.get(r.merged_by)?.nickname || profileById.get(r.merged_by)?.email || null : null,
      merged_at: r.merged_at,
      restored_at: r.restored_at,
    })),
  })
}

const LEAD_STATUS_COLUMNS = [
  'replied', 'replied_at', 'reply_sentiment',
  'no_whatsapp', 'no_whatsapp_at', 'email_invalid', 'email_invalid_at', 'phone_invalid', 'phone_invalid_at',
  'converted', 'converted_at', 'sms_sent', 'sms_sent_at',
  'cold_call_made', 'cold_call_made_at', 'cold_call_outcome',
]

function pickColumns(source: Record<string, any>, columns: string[]) {
  const out: Record<string, any> = {}
  for (const col of columns) {
    if (col in source) out[col] = source[col]
  }
  return out
}

async function restoreLeadMerge(snapshot: any) {
  const supabase = getSupabaseAdmin()
  const loser = snapshot.loser_snapshot
  const { status, tags, social_profiles, outreach_progress, score, band, ...leadFields } = loser

  const { error: insErr } = await supabase.from('leads').insert(leadFields)
  if (insErr) throw new HttpError(500, `Could not restore the merged-away lead: ${insErr.message}`)

  if (status) {
    const { error } = await supabase.from('lead_status').update(pickColumns(status, LEAD_STATUS_COLUMNS)).eq('lead_id', loser.id)
    if (error) throw new HttpError(500, error.message)
  }

  // The loser's outreach-sequence progress rows were cascade-deleted along
  // with it — recreate them from the snapshot (lead_status recreation via a
  // trigger on the leads insert already handles the lead_status row above).
  if ((outreach_progress ?? []).length > 0) {
    const { error } = await supabase.from('lead_outreach_progress').insert(
      outreach_progress.map((p: any) => ({
        lead_id: loser.id,
        outreach_sequence_stage_id: p.outreach_sequence_stage_id,
        completed_at: p.completed_at,
        due_date: p.due_date,
      }))
    )
    if (error) throw new HttpError(500, error.message)
  }

  if ((tags ?? []).length > 0) {
    await supabase.from('lead_tags').upsert(
      tags.map((t: any) => ({ lead_id: loser.id, tag_id: t.id })),
      { onConflict: 'lead_id,tag_id', ignoreDuplicates: true }
    )
  }

  const movedSocialIds: string[] = snapshot.moved_social_profile_ids ?? []
  if (movedSocialIds.length > 0) {
    await supabase.from('lead_social_profiles').update({ lead_id: loser.id }).in('id', movedSocialIds)
  }
  const deletedSocialProfiles = (social_profiles ?? []).filter((s: any) => !movedSocialIds.includes(s.id))
  if (deletedSocialProfiles.length > 0) {
    await supabase.from('lead_social_profiles').insert(
      deletedSocialProfiles.map((s: any) => ({ id: s.id, lead_id: loser.id, platform: s.platform, url: s.url }))
    )
  }

  const movedAttachmentIds: string[] = snapshot.moved_attachment_ids ?? []
  if (movedAttachmentIds.length > 0) {
    await supabase.from('lead_attachments').update({ lead_id: loser.id }).in('id', movedAttachmentIds)
  }

  const movedActivityIds: string[] = snapshot.moved_activity_ids ?? []
  if (movedActivityIds.length > 0) {
    await supabase.from('lead_activities').update({ lead_id: loser.id }).in('id', movedActivityIds)
  }
  if (snapshot.merge_note_activity_id) {
    await supabase.from('lead_activities').delete().eq('id', snapshot.merge_note_activity_id)
  }

  const movedDealIds: string[] = snapshot.moved_deal_ids ?? []
  if (movedDealIds.length > 0) {
    await supabase.from('deals').update({ lead_id: loser.id }).in('id', movedDealIds)
  }

  const addedTagIds: string[] = snapshot.added_tag_ids ?? []
  if (addedTagIds.length > 0) {
    await supabase.from('lead_tags').delete().eq('lead_id', snapshot.survivor_id).in('tag_id', addedTagIds)
  }

  await revertSurvivorBackup('lead', snapshot)
}

async function restoreDealMerge(snapshot: any) {
  const supabase = getSupabaseAdmin()
  const loser = snapshot.loser_snapshot
  const { lead, ...dealFields } = loser

  const { error: insErr } = await supabase.from('deals').insert(dealFields)
  if (insErr) throw new HttpError(500, `Could not restore the merged-away deal: ${insErr.message}`)

  if (snapshot.merge_note_activity_id) {
    await supabase.from('lead_activities').delete().eq('id', snapshot.merge_note_activity_id)
  }

  await revertSurvivorBackup('deal', snapshot)
}

async function revertSurvivorBackup(recordType: 'lead' | 'deal', snapshot: any) {
  const supabase = getSupabaseAdmin()
  const table = recordType === 'lead' ? 'leads' : 'deals'
  const backup = snapshot.survivor_backup ?? {}

  if (Object.keys(backup.fields ?? {}).length > 0) {
    const { error } = await supabase.from(table).update(backup.fields).eq('id', snapshot.survivor_id)
    if (error) throw new HttpError(500, error.message)
  }

  if (Object.keys(backup.customFields ?? {}).length > 0) {
    const { data: current, error: curErr } = await supabase
      .from(table)
      .select('custom_fields')
      .eq('id', snapshot.survivor_id)
      .single()
    if (curErr) throw new HttpError(500, curErr.message)
    const merged = { ...(current?.custom_fields ?? {}), ...backup.customFields }
    const { error } = await supabase.from(table).update({ custom_fields: merged }).eq('id', snapshot.survivor_id)
    if (error) throw new HttpError(500, error.message)
  }

  if (recordType === 'lead' && Object.keys(backup.status ?? {}).length > 0) {
    const { error } = await supabase.from('lead_status').update(backup.status).eq('lead_id', snapshot.survivor_id)
    if (error) throw new HttpError(500, error.message)
  }

  if (recordType === 'lead' && (backup.outreachProgress ?? []).length > 0) {
    for (const row of backup.outreachProgress as any[]) {
      const { error } = await supabase.from('lead_outreach_progress').upsert(
        {
          lead_id: snapshot.survivor_id,
          outreach_sequence_stage_id: row.outreach_sequence_stage_id,
          completed_at: row.completed_at,
          due_date: row.due_date,
        },
        { onConflict: 'lead_id,outreach_sequence_stage_id' }
      )
      if (error) throw new HttpError(500, error.message)
    }
  }
}

/** Reverses a merge: reconstructs the deleted "loser" record (and moves its
 * reassigned child rows — Activity Timeline entries, Deals, Attachments,
 * Social Profiles — back onto it), removes anything the union-merge had
 * added to the survivor (unioned tags), and reverts whichever survivor
 * fields/custom-fields/status the merge actually changed back to their
 * pre-merge values. Available any time before the snapshot's retention
 * window elapses — this is the same mechanism behind both the immediate
 * post-merge "Undo" toast and the Recently Merged recovery screen. */
export async function restoreMergeSnapshot(id: string, event: HandlerEvent, user: AuthedUser) {
  requireAdminOrAbove(user)
  await requireAal2IfEnrolled(user)
  const supabase = getSupabaseAdmin()
  const orgId = resolveOrganizationId(user, event)

  const { data: snapshot, error } = await supabase.from('merge_snapshots').select('*').eq('id', id).maybeSingle()
  if (error) throw new HttpError(500, error.message)
  if (!snapshot) throw new HttpError(404, 'Merge record not found')
  if ((snapshot.organization_id ?? null) !== orgId) throw new HttpError(404, 'Merge record not found')
  if (snapshot.restored_at) throw new HttpError(400, 'This merge has already been undone')

  if (snapshot.record_type === 'lead') {
    await restoreLeadMerge(snapshot)
  } else {
    await restoreDealMerge(snapshot)
  }

  const { error: updateErr } = await supabase
    .from('merge_snapshots')
    .update({ restored_at: new Date().toISOString() })
    .eq('id', id)
  if (updateErr) throw new HttpError(500, updateErr.message)

  return json(200, { success: true })
}
