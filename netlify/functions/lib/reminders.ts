/**
 * A lead's follow-up reminders are computed independently per outreach
 * channel (email/whatsapp/linkedin) from its `lead_outreach_progress` rows
 * (each joined to its `outreach_sequence_stages` config for channel/stage
 * number/label) — each channel's "next due" is whichever active (not yet
 * completed, already-unlocked) stage has the smallest stage_number, and only
 * while the lead hasn't replied or converted (those end every channel's
 * sequence — there's no per-channel reply tracking in this app). Computed
 * here so every read path (list, detail, kanban, dashboard) agrees, rather
 * than recomputing slightly differently in each place.
 */
export type ReminderChannel = 'email' | 'whatsapp' | 'linkedin'

export interface ChannelReminder {
  channel: ReminderChannel
  stageId: string
  stageNumber: number
  stageLabel: string
  due_at: string
  is_overdue: boolean
  is_due_today: boolean
}

export interface ReminderInfo {
  /** One entry per channel currently awaiting its next follow-up (only channels with an unlocked, not-yet-completed stage). */
  reminders: ChannelReminder[]
  /** Earliest due_at across all channels — kept for simple consumers (e.g. the Lead Detail "next follow-up" banner). */
  next_follow_up_due_at: string | null
  is_overdue: boolean
  is_due_today: boolean
}

interface ProgressRow {
  outreach_sequence_stage_id: string
  completed_at: string | null
  due_date: string | null
  outreach_sequence_stages: {
    channel: ReminderChannel
    stage_number: number
    stage_label: string
    is_active: boolean
  } | null
}

function dateOnly(iso: string): string {
  return iso.slice(0, 10)
}

/** `progressRows` is a lead's joined lead_outreach_progress array; `status` is
 * its lead_status row (only `replied`/`converted` are consulted here — the
 * rest of that table is unrelated to the outreach-sequence engine). */
export function computeReminder(progressRows: ProgressRow[] | null | undefined, status: any): ReminderInfo {
  if (!status || status.converted || status.replied) {
    return { reminders: [], next_follow_up_due_at: null, is_overdue: false, is_due_today: false }
  }

  const today = dateOnly(new Date().toISOString())
  const byChannel = new Map<ReminderChannel, ProgressRow[]>()

  for (const row of progressRows ?? []) {
    const stage = row.outreach_sequence_stages
    if (!stage || !stage.is_active) continue
    if (!byChannel.has(stage.channel)) byChannel.set(stage.channel, [])
    byChannel.get(stage.channel)!.push(row)
  }

  const reminders: ChannelReminder[] = []

  for (const rows of byChannel.values()) {
    const pending = rows
      .filter((r) => !r.completed_at && r.due_date)
      .sort((a, b) => a.outreach_sequence_stages!.stage_number - b.outreach_sequence_stages!.stage_number)
    const next = pending[0]
    if (!next) continue
    const stage = next.outreach_sequence_stages!
    const due = dateOnly(next.due_date!)
    reminders.push({
      channel: stage.channel,
      stageId: next.outreach_sequence_stage_id,
      stageNumber: stage.stage_number,
      stageLabel: stage.stage_label,
      due_at: next.due_date!,
      is_overdue: due < today,
      is_due_today: due === today,
    })
  }

  const earliest = reminders.reduce<ChannelReminder | null>(
    (min, r) => (min === null || r.due_at < min.due_at ? r : min),
    null
  )

  return {
    reminders,
    next_follow_up_due_at: earliest?.due_at ?? null,
    is_overdue: reminders.some((r) => r.is_overdue),
    is_due_today: reminders.some((r) => r.is_due_today),
  }
}
