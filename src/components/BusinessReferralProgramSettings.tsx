import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2 } from 'lucide-react'
import { orgReferralsApi } from '@/lib/api'

/** Super Admin config for the Business Referral Program ("Refer a Business,
 * Get a Free Month") — entirely separate from the Affiliate Program above,
 * even though the settings card mirrors its shape. */
export function BusinessReferralProgramSettings() {
  const queryClient = useQueryClient()
  const { data } = useQuery({ queryKey: ['org-referral-settings'], queryFn: orgReferralsApi.getSettings })

  const [enabled, setEnabled] = useState(true)
  const [rewardMonths, setRewardMonths] = useState('1')
  const [maxRewards, setMaxRewards] = useState('')
  const [terms, setTerms] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!data) return
    setEnabled(data.org_referral_program_enabled)
    setRewardMonths(String(data.org_referral_reward_months))
    setMaxRewards(data.org_referral_max_rewards != null ? String(data.org_referral_max_rewards) : '')
    setTerms(data.org_referral_terms ?? '')
  }, [data])

  const saveMutation = useMutation({
    mutationFn: () =>
      orgReferralsApi.updateSettings({
        org_referral_program_enabled: enabled,
        org_referral_reward_months: Number(rewardMonths),
        org_referral_max_rewards: maxRewards ? Number(maxRewards) : null,
        org_referral_terms: terms.trim() || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-referral-settings'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  return (
    <div className="card p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-base-300">Business Referral Program</h2>
          <p className="mt-1 text-xs text-base-400">Existing Organizations refer another business and earn free subscription months — no cash involved.</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-base-200">
          <input type="checkbox" className="h-4 w-4 rounded border-base-600 bg-base-800" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Enable Business Referral Program
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Reward: Free Months per Successful Referral</label>
          <input type="number" min={1} step={1} className="input" value={rewardMonths} onChange={(e) => setRewardMonths(e.target.value)} />
        </div>
        <div>
          <label className="label">Maximum Rewarded Referrals per Organization (optional)</label>
          <input type="number" min={1} step={1} className="input" value={maxRewards} onChange={(e) => setMaxRewards(e.target.value)} placeholder="Unlimited" />
        </div>
      </div>

      <div className="mt-4">
        <label className="label">Referral Program Terms</label>
        <textarea
          className="input min-h-[90px] resize-y"
          value={terms}
          onChange={(e) => setTerms(e.target.value)}
          placeholder="e.g. Refer another business — when they become a paying customer, you earn 1 free month on your subscription."
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-base-700/60 pt-4">
        <button className="btn-primary" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
          {saveMutation.isPending ? 'Saving…' : 'Save'}
        </button>
        {saved && (
          <span className="flex items-center gap-1 text-sm text-success">
            <CheckCircle2 size={16} /> Saved
          </span>
        )}
      </div>
    </div>
  )
}
