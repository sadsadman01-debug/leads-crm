import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { LayoutDashboard, Users, Wallet, CreditCard, Megaphone, Settings as SettingsIcon, LogOut, Target, Menu, X } from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '@/contexts/AuthContext'
import { usePlatformBranding } from '@/hooks/usePlatformBranding'
import { affiliatesApi } from '@/lib/api'
import { HelpWidget } from '@/components/HelpWidget'
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
 * from the spec as internal tabs navigated via its own left sidebar, rather
 * than separate routes or a top tab bar. */
export function AffiliateDashboardPage() {
  const { profile, signOut } = useAuth()
  const platformBranding = usePlatformBranding()
  const { data: affiliate } = useQuery({ queryKey: ['affiliate-me'], queryFn: affiliatesApi.getMe })
  const [tab, setTab] = useState<Tab>('overview')
  const [mobileOpen, setMobileOpen] = useState(false)

  function NavItem({ id, icon: Icon, children }: { id: Tab; icon: typeof LayoutDashboard; children: ReactNode }) {
    const active = tab === id
    return (
      <button
        onClick={() => {
          setTab(id)
          setMobileOpen(false)
        }}
        className={clsx(
          'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
          active
            ? 'bg-accent-500/15 text-accent-400 shadow-[inset_0_0_0_1px_rgb(var(--accent-500)/0.35)]'
            : 'text-base-300 hover:bg-base-800 hover:text-base-100'
        )}
      >
        <Icon size={18} strokeWidth={2} className="shrink-0" />
        <span className="flex-1 truncate text-left">{children}</span>
      </button>
    )
  }

  const sidebarContent = (
    <>
      <div className="px-6 py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {platformBranding?.logo_url ? (
              <img src={platformBranding.logo_url} alt="" className="h-8 w-8 shrink-0 rounded-lg object-cover" />
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-500 shadow-glow">
                <Target size={18} className="text-white" />
              </div>
            )}
            <div>
              <p className="text-sm font-semibold text-base-100">{platformBranding?.platform_name || 'Leadify'}</p>
              <p className="text-xs text-base-400">Affiliate Dashboard</p>
            </div>
          </div>
          <button onClick={() => setMobileOpen(false)} className="btn-ghost -mr-2 h-11 w-11 px-0 md:hidden" aria-label="Close menu">
            <X size={20} />
          </button>
        </div>
      </div>

      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-1">
        {TABS.map((t) => (
          <NavItem key={t.id} id={t.id} icon={t.icon}>
            {t.label}
          </NavItem>
        ))}
      </nav>

      <div className="border-t border-base-700/60 px-3 py-4">
        <div className="mb-2 truncate px-3 text-sm text-base-300">{profile?.nickname || profile?.email}</div>
        <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-base-300 transition-colors hover:bg-base-800 hover:text-base-100" onClick={() => signOut()}>
          <LogOut size={18} className="shrink-0" />
          Logout
        </button>
      </div>
    </>
  )

  return (
    <div className="min-h-screen bg-base-950 md:flex">
      {/* Backdrop — mobile drawer */}
      <div
        onClick={() => setMobileOpen(false)}
        className={clsx(
          'fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-200 md:hidden',
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
      />

      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-50 flex h-screen w-64 shrink-0 flex-col border-r border-base-700/60',
          'bg-base-900/95 backdrop-blur-xl transition-transform duration-200 ease-out',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          'md:static md:z-auto md:translate-x-0 md:bg-base-900/60'
        )}
      >
        {sidebarContent}
      </aside>

      <div className="flex-1">
        <div className="flex items-center gap-3 border-b border-base-700/60 bg-base-900/95 px-4 py-3 backdrop-blur-xl md:hidden">
          <button onClick={() => setMobileOpen(true)} className="btn-ghost -ml-2 h-10 w-10 px-0" aria-label="Open menu">
            <Menu size={20} />
          </button>
          <p className="text-sm font-semibold text-base-100">{platformBranding?.platform_name || 'Leadify'}</p>
        </div>

        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 md:py-8">
          {tab === 'overview' && <OverviewTab />}
          {tab === 'referrals' && <ReferralsTab />}
          {tab === 'withdrawals' && <WithdrawalsTab />}
          {tab === 'payout-methods' && <PayoutMethodsTab />}
          {tab === 'marketing' && <MarketingTab />}
          {tab === 'settings' && <AffiliateSettingsTab />}
        </div>
      </div>

      <HelpWidget
        affiliateContext={
          affiliate ? { fullName: affiliate.full_name, email: affiliate.email, referralCode: affiliate.referral_code } : undefined
        }
      />
    </div>
  )
}
