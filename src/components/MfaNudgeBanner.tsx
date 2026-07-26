import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Lock, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

const DISMISS_KEY = 'mfa-nudge-dismissed'

/** A one-time, locally-dismissible nudge for Admin/Super Admin accounts that
 * haven't enabled 2FA yet — not a server-persisted state (this is a soft
 * reminder, not enforcement), so it simply won't reappear in this browser
 * once dismissed. */
export function MfaNudgeBanner() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === '1')

  const isAdminOrAbove = profile?.role === 'admin' || profile?.role === 'super_admin'

  const { data: factorsData } = useQuery({
    queryKey: ['mfa-factors'],
    queryFn: async () => {
      const { data, error } = await supabase.auth.mfa.listFactors()
      if (error) throw error
      return data
    },
    enabled: isAdminOrAbove,
  })
  const hasMfa = Boolean(factorsData?.totp.some((f) => f.status === 'verified'))

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === '1')
  }, [])

  if (!isAdminOrAbove || hasMfa || dismissed || !factorsData) return null

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1')
    setDismissed(true)
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg bg-accent-500/10 px-4 py-3 text-sm text-accent-200 animate-fadeIn">
      <Lock size={16} className="shrink-0 text-accent-400" />
      <span className="flex-1">Protect your account — enable Two-Factor Authentication.</span>
      <button className="btn-secondary shrink-0 px-3 py-1 text-xs" onClick={() => navigate('/settings')}>
        Go to Settings
      </button>
      <button onClick={dismiss} className="shrink-0 text-accent-300/70 hover:text-accent-200" aria-label="Dismiss">
        <X size={16} />
      </button>
    </div>
  )
}
