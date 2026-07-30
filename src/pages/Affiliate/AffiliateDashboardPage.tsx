import { useState } from 'react'
import { LayoutDashboard, Users, Wallet, CreditCard, Megaphone, Settings as SettingsIcon, LogOut, Target } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { usePlatformBranding } from '@/hooks/usePlatformBranding'
import { OverviewTab } from './OverviewTab'
import { ReferralsTab } from './ReferralsTab'
import { WithdrawalsTab } from './WithdrawalsTab'
import { PayoutMethodsTab } from './PayoutMethodsTab'
import { MarketingTab } from './MarketingTab'
import { AffiliateSettingsTab } from './AffiliateSettingsTab'

type Tab = 'overview' | 'referrals' | 'withdrawals' | 'payout-methods' | 'marketing' | 'settings'

const TABS: Array<{ id: Tab; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'referrals', label: 'Referrals', icon: Users },
  { id: 'withdrawals', label: 'Withdrawals', icon: Wallet },
  { id: 'payout-methods', label: 'Payout Methods', icon: CreditCard },
  { id: 'marketing', label: 'Marketing', icon: Megaphone },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
]

/** A self-contained shell — deliberately NOT using AppLayout/Sidebar, since
 * Affiliate accounts belong to no Organization and must have zero CRM
 * visibility. This single page holds every "Affiliate Dashboard" surface
 * from the spec as internal tabs, rather than separate routes. */
export function AffiliateDashboardPage() {
  const { profile, signOut } = useAuth()
  const platformBranding = usePlatformBranding()
  const [tab, setTab] = useState<Tab>('overview')

  return (
    <div className="min-h-screen bg-base-950">
      <header className="border-b border-base-700/60 bg-base-900/95 px-4 py-3 backdrop-blur-xl sm:px-6">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-2.5">
            {platformBranding?.logo_url ? (
              <img src={platformBranding.logo_url} alt="" className="h-8 w-8 rounded-lg object-cover" />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-500 shadow-glow">
                <Target size={16} className="text-white" />
              </div>
            )}
            <div>
              <p className="text-sm font-semibold text-base-100">{platformBranding?.platform_name || 'Leads CRM'}</p>
              <p className="text-xs text-base-400">Affiliate Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-base-300 sm:inline">{profile?.nickname || profile?.email}</span>
            <button className="btn-ghost px-2" onClick={() => signOut()} title="Logout">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 md:py-8">
        <div className="mb-6 flex gap-1 overflow-x-auto rounded-lg bg-base-850 p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === t.id ? 'bg-accent-500 text-white' : 'text-base-300 hover:text-base-100'
              }`}
            >
              <t.icon size={14} />
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'overview' && <OverviewTab />}
        {tab === 'referrals' && <ReferralsTab />}
        {tab === 'withdrawals' && <WithdrawalsTab />}
        {tab === 'payout-methods' && <PayoutMethodsTab />}
        {tab === 'marketing' && <MarketingTab />}
        {tab === 'settings' && <AffiliateSettingsTab />}
      </div>
    </div>
  )
}
