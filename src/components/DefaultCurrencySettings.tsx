import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2 } from 'lucide-react'
import { settingsApi } from '@/lib/api'
import { CURRENCIES } from '@/types/deal'

export function DefaultCurrencySettings() {
  const queryClient = useQueryClient()
  const { data } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get })
  const [currency, setCurrency] = useState('USD')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (data) setCurrency(data.default_currency)
  }, [data])

  const mutation = useMutation({
    mutationFn: (value: string) => settingsApi.update({ default_currency: value }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  const dirty = data && currency !== data.default_currency

  return (
    <div className="card p-6">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-base-300">Default Currency</h2>
      <p className="mb-4 text-xs text-base-400">
        Used for new deals unless overridden per-deal. Deal totals are summed as raw numbers with no currency
        conversion, so mixing currencies across deals will skew revenue totals.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <select className="input w-auto" value={currency} onChange={(e) => setCurrency(e.target.value)}>
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <button
          className="btn-primary sm:ml-auto"
          disabled={!dirty || mutation.isPending}
          onClick={() => mutation.mutate(currency)}
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
