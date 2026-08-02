import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Mail, MessageCircle, Linkedin } from 'lucide-react'
import { Toggle } from '@/components/ui/Toggle'
import { leadsApi, outreachSequencesApi } from '@/lib/api'
import {
  COLD_CALL_OUTCOMES,
  REPLY_SENTIMENTS,
  type ColdCallOutcome,
  type Lead,
  type LeadStatus,
  type OutreachChannel,
  type ReplySentiment,
} from '@/types/lead'

type ToggleTone = 'success' | 'danger' | 'warn'

interface ToggleDef {
  key: keyof LeadStatus
  tsKey: keyof LeadStatus
  label: string
  tone: ToggleTone
}

/** The non-sequence toggles only — Cold-Contact/Follow-up completion across
 * Email/WhatsApp/LinkedIn is rendered dynamically below, one group per
 * channel, from the Organization's currently configured outreach sequence. */
const TOGGLES: ToggleDef[] = [
  { key: 'no_whatsapp', tsKey: 'no_whatsapp_at', label: 'No WhatsApp Available', tone: 'warn' },
  { key: 'email_invalid', tsKey: 'email_invalid_at', label: 'Email Invalid', tone: 'danger' },
  { key: 'phone_invalid', tsKey: 'phone_invalid_at', label: 'Phone Invalid', tone: 'danger' },
  { key: 'sms_sent', tsKey: 'sms_sent_at', label: 'SMS Sent', tone: 'success' },
  { key: 'converted', tsKey: 'converted_at', label: 'Converted to Client', tone: 'success' },
]

const TONE_TEXT: Record<ToggleTone, string> = {
  success: 'text-success',
  danger: 'text-danger',
  warn: 'text-warn',
}

const CHANNEL_GROUPS: Array<{ key: OutreachChannel; label: string; icon: typeof Mail }> = [
  { key: 'email', label: 'Email', icon: Mail },
  { key: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { key: 'linkedin', label: 'LinkedIn', icon: Linkedin },
]

export function StatusPanel({ lead, readOnly }: { lead: Lead; readOnly?: boolean }) {
  const queryClient = useQueryClient()
  const status = lead.status
  const { data: sequenceData } = useQuery({ queryKey: ['outreach-sequence-stages'], queryFn: outreachSequencesApi.list })
  const stages = sequenceData?.stages ?? []

  const mutation = useMutation({
    mutationFn: (payload: Partial<LeadStatus>) => leadsApi.updateStatus(lead.id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lead', lead.id] }),
  })

  const progressMutation = useMutation({
    mutationFn: (payload: { outreach_sequence_stage_id: string; completed: boolean }) =>
      leadsApi.updateOutreachProgress(lead.id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lead', lead.id] }),
  })

  if (!status) return null

  return (
    <div className="card p-6">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-base-300">
        Outreach Status
      </h2>

      <fieldset disabled={readOnly} className={readOnly ? 'opacity-60' : ''}>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {CHANNEL_GROUPS.map(({ key, label, icon: Icon }) => {
          const channelStages = stages.filter((s) => s.channel === key).sort((a, b) => a.stage_number - b.stage_number)
          if (channelStages.length === 0) return null
          return (
            <div key={key} className="rounded-lg border border-base-700/60 bg-base-850 p-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-base-400">
                <Icon size={13} />
                {label}
              </p>
              <div className="space-y-2">
                {channelStages.map((stage) => {
                  const progress = lead.outreach_progress.find((p) => p.outreach_sequence_stage_id === stage.id)
                  const checked = Boolean(progress?.completed_at)
                  return (
                    <div key={stage.id} className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-base-100">{stage.stage_label}</p>
                        {checked && progress?.completed_at && (
                          <p className="text-xs text-success">{format(new Date(progress.completed_at), 'MMM d, yyyy · h:mm a')}</p>
                        )}
                      </div>
                      <Toggle
                        checked={checked}
                        disabled={progressMutation.isPending}
                        onChange={(value) => progressMutation.mutate({ outreach_sequence_stage_id: stage.id, completed: value })}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {TOGGLES.map(({ key, tsKey, label, tone }) => {
          const checked = Boolean(status[key])
          const timestamp = status[tsKey] as string | null
          return (
            <div
              key={key}
              className="flex items-center justify-between rounded-lg border border-base-700/60 bg-base-850 px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium text-base-100">{label}</p>
                {checked && timestamp && (
                  <p className={`text-xs ${TONE_TEXT[tone]}`}>
                    {format(new Date(timestamp), 'MMM d, yyyy · h:mm a')}
                  </p>
                )}
              </div>
              <Toggle
                checked={checked}
                disabled={mutation.isPending}
                onChange={(value) => mutation.mutate({ [key]: value } as Partial<LeadStatus>)}
              />
            </div>
          )
        })}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 border-t border-base-700/60 pt-4 sm:grid-cols-2">
        <div className="rounded-lg border border-base-700/60 bg-base-850 p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium text-base-100">Replied</p>
            <Toggle
              checked={status.replied}
              disabled={mutation.isPending}
              onChange={(value) => mutation.mutate({ replied: value })}
            />
          </div>
          {status.replied && (
            <>
              {status.replied_at && (
                <p className="mb-2 text-xs text-accent-400">
                  {format(new Date(status.replied_at), 'MMM d, yyyy · h:mm a')}
                </p>
              )}
              <select
                className="input"
                value={status.reply_sentiment ?? ''}
                onChange={(e) =>
                  mutation.mutate({ reply_sentiment: (e.target.value || null) as ReplySentiment | null })
                }
              >
                <option value="">Select sentiment…</option>
                {REPLY_SENTIMENTS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </>
          )}
        </div>

        <div className="rounded-lg border border-base-700/60 bg-base-850 p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium text-base-100">Cold Call Made</p>
            <Toggle
              checked={status.cold_call_made}
              disabled={mutation.isPending}
              onChange={(value) => mutation.mutate({ cold_call_made: value })}
            />
          </div>
          {status.cold_call_made && (
            <>
              {status.cold_call_made_at && (
                <p className="mb-2 text-xs text-success">
                  {format(new Date(status.cold_call_made_at), 'MMM d, yyyy · h:mm a')}
                </p>
              )}
              <select
                className="input"
                value={status.cold_call_outcome ?? ''}
                onChange={(e) =>
                  mutation.mutate({
                    cold_call_outcome: (e.target.value || null) as ColdCallOutcome | null,
                  })
                }
              >
                <option value="">Select outcome…</option>
                {COLD_CALL_OUTCOMES.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </>
          )}
        </div>
      </div>
      </fieldset>
    </div>
  )
}
