import { useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Toggle } from '@/components/ui/Toggle'
import { leadsApi } from '@/lib/api'
import {
  COLD_CALL_OUTCOMES,
  REPLY_SENTIMENTS,
  type ColdCallOutcome,
  type Lead,
  type LeadStatus,
  type ReplySentiment,
} from '@/types/lead'

type ToggleTone = 'success' | 'danger' | 'warn'

interface ToggleDef {
  key: keyof LeadStatus
  tsKey: keyof LeadStatus
  label: string
  tone: ToggleTone
}

const TOGGLES: ToggleDef[] = [
  { key: 'cold_email_sent', tsKey: 'cold_email_sent_at', label: 'Cold Email Sent', tone: 'success' },
  { key: 'followup1_sent', tsKey: 'followup1_sent_at', label: '1st Follow-up Sent', tone: 'success' },
  { key: 'followup2_sent', tsKey: 'followup2_sent_at', label: '2nd Follow-up Sent', tone: 'success' },
  { key: 'followup3_sent', tsKey: 'followup3_sent_at', label: '3rd Follow-up Sent', tone: 'success' },
  { key: 'whatsapp_sent', tsKey: 'whatsapp_sent_at', label: 'WhatsApp Message Sent', tone: 'success' },
  { key: 'no_whatsapp', tsKey: 'no_whatsapp_at', label: 'No WhatsApp Available', tone: 'warn' },
  { key: 'linkedin_sent', tsKey: 'linkedin_sent_at', label: 'LinkedIn Message Sent', tone: 'success' },
  { key: 'sms_sent', tsKey: 'sms_sent_at', label: 'SMS Sent', tone: 'success' },
  { key: 'email_invalid', tsKey: 'email_invalid_at', label: 'Email Invalid', tone: 'danger' },
  { key: 'phone_invalid', tsKey: 'phone_invalid_at', label: 'Phone Invalid', tone: 'danger' },
  { key: 'converted', tsKey: 'converted_at', label: 'Converted to Client', tone: 'success' },
]

const TONE_TEXT: Record<ToggleTone, string> = {
  success: 'text-success',
  danger: 'text-danger',
  warn: 'text-warn',
}

export function StatusPanel({ lead }: { lead: Lead }) {
  const queryClient = useQueryClient()
  const status = lead.status

  const mutation = useMutation({
    mutationFn: (payload: Partial<LeadStatus>) => leadsApi.updateStatus(lead.id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lead', lead.id] }),
  })

  if (!status) return null

  return (
    <div className="card p-6">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-base-300">
        Outreach Status
      </h2>

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
    </div>
  )
}
