import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2 } from 'lucide-react'
import { settingsApi } from '@/lib/api'

export function FollowUpIntervalSettings() {
  const queryClient = useQueryClient()
  const { data } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get })
  const [days, setDays] = useState(3)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (data) setDays(data.follow_up_interval_days)
  }, [data])

  const mutation = useMutation({
    mutationFn: (value: number) => settingsApi.update(value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  const dirty = data && days !== data.follow_up_interval_days

  return (
    <div className="card p-6">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-base-300">Follow-up Reminders</h2>
      <p className="mb-4 text-xs text-base-400">
        When a cold email or follow-up is marked sent, the next follow-up's suggested due date is this many days
        later. Changing it only affects follow-ups computed from now on.
      </p>

      <div className="flex items-center gap-3">
        <label className="label mb-0" htmlFor="interval-days">Interval</label>
        <input
          id="interval-days"
          type="number"
          min={1}
          className="input w-24"
          value={days}
          onChange={(e) => setDays(Math.max(1, parseInt(e.target.value, 10) || 1))}
        />
        <span className="text-sm text-base-400">days</span>

        <button
          className="btn-primary ml-auto"
          disabled={!dirty || mutation.isPending}
          onClick={() => mutation.mutate(days)}
        >
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
