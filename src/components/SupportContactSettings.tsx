import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, LifeBuoy } from 'lucide-react'
import { platformBrandingApi } from '@/lib/api'

export function SupportContactSettings() {
  const queryClient = useQueryClient()
  const { data } = useQuery({ queryKey: ['platform-branding'], queryFn: platformBrandingApi.get })

  const [email, setEmail] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!data) return
    setEmail(data.support_email ?? '')
  }, [data])

  const dirty = Boolean(data) && email.trim() !== (data!.support_email ?? '')

  const saveMutation = useMutation({
    mutationFn: () => platformBrandingApi.update({ support_email: email.trim() || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-branding'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  return (
    <div className="card p-6">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-base-300">
        <LifeBuoy size={15} className="text-base-400" />
        Support Contact
      </h2>
      <p className="mb-5 text-xs text-base-400">
        Your own support email — shown to every Admin/User via the floating Help button so they can reach you
        directly. Clear this field to hide the Help button entirely.
      </p>

      <div className="max-w-sm">
        <label className="label">Support Email</label>
        <input
          type="email"
          className="input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="support@example.com"
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-base-700/60 pt-4">
        <button className="btn-primary" disabled={!dirty || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
          {saveMutation.isPending ? 'Saving…' : 'Save'}
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
