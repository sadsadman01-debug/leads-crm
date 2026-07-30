import { useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { KeyRound, AlertCircle, CheckCircle2, FileText } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { affiliateSettingsApi } from '@/lib/api'
import { SecuritySettings } from '@/components/SecuritySettings'

function ChangePasswordCard() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    const { error: updateErr } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (updateErr) {
      setError(updateErr.message)
      return
    }
    setPassword('')
    setConfirmPassword('')
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="card p-6">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-base-300">
        <KeyRound size={15} /> Change Password
      </h2>
      <form onSubmit={handleSubmit} className="mt-4 max-w-sm space-y-3">
        <div>
          <label className="label">New Password</label>
          <input type="password" minLength={8} required className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div>
          <label className="label">Confirm New Password</label>
          <input type="password" minLength={8} required className="input" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
        </div>
        {error && (
          <div className="flex items-center gap-2 text-sm text-danger">
            <AlertCircle size={14} className="shrink-0" />
            {error}
          </div>
        )}
        <div className="flex items-center gap-3">
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Saving…' : 'Update Password'}
          </button>
          {saved && (
            <span className="flex items-center gap-1 text-sm text-success">
              <CheckCircle2 size={15} /> Saved
            </span>
          )}
        </div>
      </form>
    </div>
  )
}

export function AffiliateSettingsTab() {
  const { data: programInfo } = useQuery({ queryKey: ['public-affiliate-program-info'], queryFn: affiliateSettingsApi.getPublic })

  return (
    <div className="space-y-6">
      <ChangePasswordCard />
      <SecuritySettings />
      {programInfo?.terms && (
        <div className="card p-6">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-base-300">
            <FileText size={15} /> Affiliate Program Terms
          </h2>
          <p className="whitespace-pre-wrap text-sm text-base-300">{programInfo.terms}</p>
          <p className="mt-3 text-xs text-base-500">
            Commission: {programInfo.first_payment_commission_pct}% on first payment, {programInfo.recurring_commission_pct}% on renewals.
          </p>
        </div>
      )}
    </div>
  )
}
