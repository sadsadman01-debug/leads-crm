/**
 * Lead score is computed on the fly from lead_status + priority + outreach
 * sequence progress — never stored, so it's always in sync with the
 * underlying fields and needs no migration when the weights change. Mirrors
 * the reminders.ts pattern (lib/reminders.ts).
 */
export interface ScoreInfo {
  score: number
  band: 'Hot' | 'Warm' | 'Cold'
}

const SENTIMENT_POINTS: Record<string, number> = {
  Positive: 30,
  Neutral: 15,
  Negative: -10,
  'Not Interested': -20,
}

const PRIORITY_POINTS: Record<string, number> = {
  High: 10,
  Medium: 5,
  Low: 0,
}

/** First completed stage in a channel is worth more (it's the "did we even
 * reach out at all" signal); each subsequent completed stage in the same
 * channel adds a smaller amount — same weighting the old fixed-column scoring
 * used (+10 for the first touch, +5 per follow-up). */
function channelPoints(completedCount: number): number {
  if (completedCount <= 0) return 0
  return 10 + (completedCount - 1) * 5
}

export interface SequenceCompletionCounts {
  email: number
  whatsapp: number
  linkedin: number
}

export function computeLeadScore(status: any, priority: string, sequenceCounts?: SequenceCompletionCounts): ScoreInfo {
  let score = PRIORITY_POINTS[priority] ?? 0

  if (sequenceCounts) {
    score += channelPoints(sequenceCounts.email)
    score += channelPoints(sequenceCounts.whatsapp)
    score += channelPoints(sequenceCounts.linkedin)
  }

  if (status) {
    if (status.sms_sent) score += 5
    if (status.cold_call_made) score += 5
    if (status.replied) score += SENTIMENT_POINTS[status.reply_sentiment] ?? 15
    if (status.converted) score += 100
    if (status.email_invalid) score -= 15
    if (status.phone_invalid) score -= 15
  }

  const band: ScoreInfo['band'] = score >= 70 ? 'Hot' : score >= 30 ? 'Warm' : 'Cold'
  return { score, band }
}

/** Counts completed (not just unlocked) progress rows per channel from a
 * lead's joined lead_outreach_progress array — the shared input both scoring
 * and the Kanban/List compact "N/total" pills need. */
export function computeSequenceCompletionCounts(progressRows: any[] | null | undefined): SequenceCompletionCounts {
  const counts: SequenceCompletionCounts = { email: 0, whatsapp: 0, linkedin: 0 }
  for (const row of progressRows ?? []) {
    const stage = row.outreach_sequence_stages
    if (!stage || !stage.is_active || !row.completed_at) continue
    if (stage.channel === 'email' || stage.channel === 'whatsapp' || stage.channel === 'linkedin') {
      counts[stage.channel as keyof SequenceCompletionCounts]++
    }
  }
  return counts
}
