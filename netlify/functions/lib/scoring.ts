/**
 * Lead score is computed on the fly from lead_status + priority — never stored,
 * so it's always in sync with the underlying fields and needs no migration when
 * the weights change. Mirrors the reminders.ts pattern (lib/reminders.ts).
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

export function computeLeadScore(status: any, priority: string): ScoreInfo {
  let score = PRIORITY_POINTS[priority] ?? 0

  if (status) {
    if (status.cold_email_sent) score += 10
    if (status.followup1_sent) score += 5
    if (status.followup2_sent) score += 5
    if (status.followup3_sent) score += 5
    if (status.whatsapp_sent) score += 5
    if (status.linkedin_sent) score += 5
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
