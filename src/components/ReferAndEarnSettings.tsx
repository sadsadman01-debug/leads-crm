import { useQuery } from '@tanstack/react-query'
import { Link2, Users, CheckCircle2, Gift } from 'lucide-react'
import { orgReferralsApi } from '@/lib/api'
import { StatTile } from '@/components/charts/StatTile'
import { CopyButton } from '@/components/TempPasswordResult'
import { Badge } from '@/components/ui/Badge'

const STATUS_TONE: Record<string, 'success' | 'warn' | 'danger' | 'neutral'> = {
  approved: 'success',
  pending: 'warn',
  rejected: 'danger',
}

/** Every Organization's own "Refer & Earn" section — automatic, no
 * application/approval needed. Entirely separate from the Affiliate Program:
 * this rewards free subscription months, not cash. */
export function ReferAndEarnSettings() {
  const { data } = useQuery({ queryKey: ['org-referral-my-info'], queryFn: orgReferralsApi.getMyInfo })

  if (!data) return null

  if (!data.program_enabled) {
    return (
      <div className="card p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-base-300">Refer & Earn</h2>
        <p className="mt-2 text-sm text-base-400">The Business Referral Program isn't currently active.</p>
      </div>
    )
  }

  const referralLink = `${window.location.origin}/request-access?org_ref=${data.org_referral_code}`

  return (
    <div className="card p-6">
      <div className="mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-base-300">Refer & Earn</h2>
        <p className="mt-1 text-xs text-base-400">
          Refer another business — when they become a paying customer, you earn {data.reward_months} free month{data.reward_months === 1 ? '' : 's'} on your
          subscription.
        </p>
      </div>

      <div className="mb-5">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-base-400">Your Referral Link</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="flex flex-1 items-center gap-2 rounded-lg bg-base-850 px-3 py-2 text-sm text-base-200">
            <Link2 size={14} className="shrink-0 text-base-500" />
            <span className="truncate">{referralLink}</span>
          </div>
          <CopyButton text={referralLink} label="Copy Link" />
        </div>
        <p className="mt-2 text-xs text-base-500">
          Referral code: <span className="font-mono text-base-300">{data.org_referral_code}</span>
        </p>
      </div>

      {data.terms && (
        <div className="mb-5 rounded-lg bg-base-850 px-4 py-3 text-xs text-base-400">{data.terms}</div>
      )}

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="Businesses Referred" value={String(data.stats.total_referred)} icon={Users} tone="neutral" />
        <StatTile label="Successfully Converted" value={String(data.stats.converted)} icon={CheckCircle2} tone="success" />
        <StatTile label="Free Months Earned" value={String(data.stats.months_earned)} icon={Gift} tone="accent" />
      </div>

      {data.referrals.length > 0 && (
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-base-400">Referral History</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-base-700/60 text-left text-xs uppercase tracking-wide text-base-500">
                  <th className="pb-2 pr-3">Business</th>
                  <th className="px-3 pb-2">Status</th>
                  <th className="px-3 pb-2">Date</th>
                  <th className="px-3 pb-2">Reward</th>
                </tr>
              </thead>
              <tbody>
                {data.referrals.map((r) => (
                  <tr key={r.id} className="border-b border-base-800">
                    <td className="py-2.5 pr-3 font-medium text-base-100">{r.organization_name}</td>
                    <td className="px-3 py-2.5">
                      <Badge tone={STATUS_TONE[r.status] ?? 'neutral'}>{r.status}</Badge>
                    </td>
                    <td className="px-3 py-2.5 text-base-400">{new Date(r.requested_at).toLocaleDateString()}</td>
                    <td className="px-3 py-2.5 text-base-300">
                      {r.reward_earned ? (
                        <span className="flex items-center gap-1 text-success">
                          <Gift size={13} /> Earned
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
