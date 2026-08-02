import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2 } from 'lucide-react'
import { settingsApi } from '@/lib/api'
import type { AppSettings } from '@/types/lead'

type IntervalField = Exclude<keyof AppSettings, 'default_currency'>

interface Group {
  label: string
  description: string
  stages: Array<{ field: IntervalField; label: string }>
}

const GROUPS: Group[] = [
  {
    label: 'Email Follow-ups',
    description: 'Cold Email → Follow-up 1 → 2 → 3',
    stages: [
      { field: 'email_followup1_interval_days', label: 'Cold Email Sent → Follow-up 1' },
      { field: 'email_followup2_interval_days', label: 'Follow-up 1 → Follow-up 2' },
      { field: 'email_followup3_interval_days', label: 'Follow-up 2 → Follow-up 3' },
    ],
  },
  {
    label: 'WhatsApp Follow-ups',
    description: 'WhatsApp Message → Follow-up 1 → 2 → 3',
    stages: [
      { field: 'whatsapp_followup1_interval_days', label: 'WhatsApp Message Sent → Follow-up 1' },
      { field: 'whatsapp_followup2_interval_days', label: 'Follow-up 1 → Follow-up 2' },
      { field: 'whatsapp_followup3_interval_days', label: 'Follow-up 2 → Follow-up 3' },
    ],
  },
  {
    label: 'LinkedIn Follow-ups',
    description: 'LinkedIn Message → Follow-up 1 → 2 → 3',
    stages: [
      { field: 'linkedin_followup1_interval_days', label: 'LinkedIn Message Sent → Follow-up 1' },
      { field: 'linkedin_followup2_interval_days', label: 'Follow-up 1 → Follow-up 2' },
      { field: 'linkedin_followup3_interval_days', label: 'Follow-up 2 → Follow-up 3' },
    ],
  },
]

const ALL_FIELDS = GROUPS.flatMap((g) => g.stages.map((s) => s.field))

export function FollowUpIntervalSettings() {
  const queryClient = useQueryClient()
  const { data } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get })
  const [values, setValues] = useState<Record<string, number>>({})
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!data) return
    const next: Record<string, number> = {}
    for (const field of ALL_FIELDS) next[field] = data[field]
    setValues(next)
  }, [data])

  const dirty = Boolean(data) && ALL_FIELDS.some((field) => values[field] !== data![field])

  const mutation = useMutation({
    mutationFn: () => settingsApi.update(values as Partial<AppSettings>),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  return (
    <div className="card p-6">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-base-300">Follow-up Reminders</h2>
      <p className="mb-5 text-xs text-base-400">
        When an outreach message or follow-up is marked sent, the next follow-up's suggested due date is set this
        many days later — independently per channel and per stage. Changing an interval only affects follow-ups
        computed from now on.
      </p>

      <div className="space-y-5">
        {GROUPS.map((group) => (
          <div key={group.label} className="rounded-lg border border-base-700/60 bg-base-850 p-4">
            <p className="text-sm font-medium text-base-100">{group.label}</p>
            <p className="mb-3 text-xs text-base-500">{group.description}</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {group.stages.map(({ field, label }) => (
                <div key={field}>
                  <label className="label" htmlFor={field}>{label}</label>
                  <div className="flex items-center gap-2">
                    <input
                      id={field}
                      type="number"
                      min={1}
                      className="input w-24"
                      value={values[field] ?? ''}
                      onChange={(e) =>
                        setValues((prev) => ({ ...prev, [field]: Math.max(1, parseInt(e.target.value, 10) || 1) }))
                      }
                    />
                    <span className="text-sm text-base-400">days</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-base-700/60 pt-4">
        <button className="btn-primary" disabled={!dirty || mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? 'Saving…' : 'Save'}
        </button>
        {saved && (
          <span className="flex items-center gap-1 text-sm text-success">
            <CheckCircle2 size={16} />
            Saved
          </span>
        )}
      </div>
    </div>
  )
}
