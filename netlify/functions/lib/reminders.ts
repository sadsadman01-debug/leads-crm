/**
 * A lead's follow-up reminders are computed independently per outreach
 * channel (email/whatsapp/linkedin) — each channel's "next due" is whichever
 * due date belongs to the next unmarked follow-up step in that channel's own
 * chain (first touch → follow-up 1 → 2 → 3), and only while the lead hasn't
 * replied or converted (those end every channel's sequence — there's no
 * per-channel reply tracking in this app). Computed here from the stored
 * due_at columns so every read path (list, detail, kanban, dashboard) agrees,
 * rather than recomputing slightly differently in each place.
 */
export type ReminderChannel = 'email' | 'whatsapp' | 'linkedin'

export interface ChannelReminder {
  channel: ReminderChannel
  stage: 1 | 2 | 3
  due_at: string
  is_overdue: boolean
  is_due_today: boolean
}

export interface ReminderInfo {
  /** One entry per channel currently awaiting its next follow-up (only channels with a due date already set). */
  reminders: ChannelReminder[]
  /** Earliest due_at across all channels — kept for simple consumers (e.g. the Lead Detail "next follow-up" banner). */
  next_follow_up_due_at: string | null
  is_overdue: boolean
  is_due_today: boolean
}

interface ChannelDef {
  channel: ReminderChannel
  sentField: string
  stageSentFields: [string, string, string]
  stageDueFields: [string, string, string]
}

const CHANNELS: ChannelDef[] = [
  {
    channel: 'email',
    sentField: 'cold_email_sent',
    stageSentFields: ['followup1_sent', 'followup2_sent', 'followup3_sent'],
    stageDueFields: ['followup1_due_at', 'followup2_due_at', 'followup3_due_at'],
  },
  {
    channel: 'whatsapp',
    sentField: 'whatsapp_sent',
    stageSentFields: ['whatsapp_followup1_sent', 'whatsapp_followup2_sent', 'whatsapp_followup3_sent'],
    stageDueFields: ['whatsapp_followup1_due_at', 'whatsapp_followup2_due_at', 'whatsapp_followup3_due_at'],
  },
  {
    channel: 'linkedin',
    sentField: 'linkedin_sent',
    stageSentFields: ['linkedin_followup1_sent', 'linkedin_followup2_sent', 'linkedin_followup3_sent'],
    stageDueFields: ['linkedin_followup1_due_at', 'linkedin_followup2_due_at', 'linkedin_followup3_due_at'],
  },
]

function dateOnly(iso: string): string {
  return iso.slice(0, 10)
}

export function computeReminder(status: any): ReminderInfo {
  if (!status || status.converted || status.replied) {
    return { reminders: [], next_follow_up_due_at: null, is_overdue: false, is_due_today: false }
  }

  const today = dateOnly(new Date().toISOString())
  const reminders: ChannelReminder[] = []

  for (const { channel, sentField, stageSentFields, stageDueFields } of CHANNELS) {
    let dueAt: string | null = null
    let stage: 1 | 2 | 3 | null = null

    if (status[sentField] && !status[stageSentFields[0]]) {
      dueAt = status[stageDueFields[0]]
      stage = 1
    } else if (status[stageSentFields[0]] && !status[stageSentFields[1]]) {
      dueAt = status[stageDueFields[1]]
      stage = 2
    } else if (status[stageSentFields[1]] && !status[stageSentFields[2]]) {
      dueAt = status[stageDueFields[2]]
      stage = 3
    }

    if (dueAt && stage) {
      const due = dateOnly(dueAt)
      reminders.push({ channel, stage, due_at: dueAt, is_overdue: due < today, is_due_today: due === today })
    }
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

/** The flag→due-date-field a marking a step complete unlocks, and the one it
 * should clear if unchecked — plus which channel/stage's configured interval
 * to apply when setting it. */
export const FOLLOW_UP_DUE_TRIGGERS: Record<string, { setsDueField: string; channel: ReminderChannel; stage: 1 | 2 | 3 }> = {
  cold_email_sent: { setsDueField: 'followup1_due_at', channel: 'email', stage: 1 },
  followup1_sent: { setsDueField: 'followup2_due_at', channel: 'email', stage: 2 },
  followup2_sent: { setsDueField: 'followup3_due_at', channel: 'email', stage: 3 },
  whatsapp_sent: { setsDueField: 'whatsapp_followup1_due_at', channel: 'whatsapp', stage: 1 },
  whatsapp_followup1_sent: { setsDueField: 'whatsapp_followup2_due_at', channel: 'whatsapp', stage: 2 },
  whatsapp_followup2_sent: { setsDueField: 'whatsapp_followup3_due_at', channel: 'whatsapp', stage: 3 },
  linkedin_sent: { setsDueField: 'linkedin_followup1_due_at', channel: 'linkedin', stage: 1 },
  linkedin_followup1_sent: { setsDueField: 'linkedin_followup2_due_at', channel: 'linkedin', stage: 2 },
  linkedin_followup2_sent: { setsDueField: 'linkedin_followup3_due_at', channel: 'linkedin', stage: 3 },
}
