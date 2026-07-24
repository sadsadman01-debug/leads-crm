/**
 * A lead's "next follow-up due" is whichever due date belongs to the next unmarked
 * follow-up step — cold email → followup1 → followup2 → followup3 — and only while
 * the lead hasn't replied or converted (those end the sequence). Computed here from
 * the stored due_at columns so every read path (list, detail, kanban, dashboard)
 * agrees, rather than recomputing slightly differently in each place.
 */
export interface ReminderInfo {
  next_follow_up_due_at: string | null
  is_overdue: boolean
  is_due_today: boolean
}

function dateOnly(iso: string): string {
  return iso.slice(0, 10)
}

export function computeReminder(status: any): ReminderInfo {
  if (!status || status.converted || status.replied) {
    return { next_follow_up_due_at: null, is_overdue: false, is_due_today: false }
  }

  let dueAt: string | null = null
  if (status.cold_email_sent && !status.followup1_sent) dueAt = status.followup1_due_at
  else if (status.followup1_sent && !status.followup2_sent) dueAt = status.followup2_due_at
  else if (status.followup2_sent && !status.followup3_sent) dueAt = status.followup3_due_at

  if (!dueAt) {
    return { next_follow_up_due_at: null, is_overdue: false, is_due_today: false }
  }

  const today = dateOnly(new Date().toISOString())
  const due = dateOnly(dueAt)

  return {
    next_follow_up_due_at: dueAt,
    is_overdue: due < today,
    is_due_today: due === today,
  }
}

/** The flag→due-date-field a marking a step complete unlocks, and the one it should clear if unchecked. */
export const FOLLOW_UP_DUE_TRIGGERS: Record<string, { setsDueField: string }> = {
  cold_email_sent: { setsDueField: 'followup1_due_at' },
  followup1_sent: { setsDueField: 'followup2_due_at' },
  followup2_sent: { setsDueField: 'followup3_due_at' },
}
