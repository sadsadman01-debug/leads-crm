import type { LeadOutreachProgressEntry, OutreachChannel } from '@/types/lead'

/** Per-channel completed-stage counts from a lead's full outreach_progress
 * array — the input OutreachChannelPills needs, for views (LeadsList) that
 * only have the full per-stage array rather than a precomputed count map. */
export function computeOutreachCompletedCounts(progress: LeadOutreachProgressEntry[] | undefined): Record<OutreachChannel, number> {
  const counts: Record<OutreachChannel, number> = { email: 0, whatsapp: 0, linkedin: 0 }
  for (const p of progress ?? []) {
    if (p.completed_at) counts[p.channel]++
  }
  return counts
}
