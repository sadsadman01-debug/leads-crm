import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, AlertCircle, CheckCircle2, FileText, Trophy } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { affiliateSettingsApi, affiliatesApi } from '@/lib/api'
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

function LeaderboardPrivacyCard() {
  const queryClient = useQueryClient()
  const { data: affiliate } = useQuery({ queryKey: ['affiliate-me'], queryFn: affiliatesApi.getMe })

  const [displayName, setDisplayName] = useState('')
  const [optIn, setOptIn] = useState(true)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!affiliate) return
    setDisplayName(affiliate.public_display_name ?? '')
    setOptIn(affiliate.leaderboard_opt_in)
  }, [affiliate])

  const dirty =
    Boolean(affiliate) && (displayName.trim() !== (affiliate!.public_display_name ?? '') || optIn !== affiliate!.leaderboard_opt_in)

  const saveMutation = useMutation({
    mutationFn: () =>
      affiliatesApi.updateMyProfile({ public_display_name: displayName.trim() || null, leaderboard_opt_in: optIn }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['affiliate-me'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    },
  })

  return (
    <div className="card p-6">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-base-300">
        <Trophy size={15} /> Leaderboard Privacy
      </h2>
      <p className="mt-1 text-xs text-base-400">
        Other affiliates never see your real email, payout methods, or exact earnings — only your rank and converted-referral count.
      </p>

      <div className="mt-4 max-w-sm">
        <label className="label">Public Display Name (optional)</label>
        <input
          className="input"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder={affiliate?.full_name || 'Your name'}
        />
        <p className="mt-1 text-xs text-base-500">Shown to other affiliates on the leaderboard instead of your real name. Leave blank to use your name.</p>
      </div>

      <label className="mt-4 flex items-start gap-2 text-sm text-base-200">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded border-base-600 bg-base-800"
          checked={optIn}
          onChange={(e) => setOptIn(e.target.checked)}
        />
        <span>
          Show me on the public leaderboard
          <span className="block text-xs text-base-500">
            If turned off, other affiliates won't see your row — you'll still see your own rank and stats privately.
          </span>
        </span>
      </label>

      <div className="mt-4 flex items-center gap-3 border-t border-base-700/60 pt-4">
        <button className="btn-primary" disabled={!dirty || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
          {saveMutation.isPending ? 'Saving…' : 'Save'}
        </button>
        {saved && (
          <span className="flex items-center gap-1 text-sm text-success">
            <CheckCircle2 size={15} /> Saved
          </span>
        )}
      </div>
    </div>
  )
}

export function AffiliateSettingsTab() {
  const { data: programInfo } = useQuery({ queryKey: ['public-affiliate-program-info'], queryFn: affiliateSettingsApi.getPublic })

  return (
    <div className="space-y-6">
      <ChangePasswordCard />
      <LeaderboardPrivacyCard />
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
