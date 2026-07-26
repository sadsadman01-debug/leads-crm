import { useState, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  LayoutDashboard,
  Users,
  UserPlus,
  Settings as SettingsIcon,
  LogOut,
  Target,
  X,
  Handshake,
  UsersRound,
  Building2,
  ArrowLeftRight,
  BarChart3,
  UserPlus2,
  KeyRound,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '@/contexts/AuthContext'
import { useOrg } from '@/contexts/OrgContext'
import { RoleBadge, Avatar } from '@/components/ui/RoleBadge'
import { signupRequestsApi, passwordResetRequestsApi } from '@/lib/api'

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/leads', label: 'Leads', icon: Users },
  { to: '/leads/new', label: 'Add New Lead', icon: UserPlus },
  { to: '/deals', label: 'Deals', icon: Handshake },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
]

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { session, profile, signOut } = useAuth()
  const { viewingOrgId, viewingOrgName, exitToOrganizations } = useOrg()
  const navigate = useNavigate()
  const isSuperAdmin = profile?.role === 'super_admin'

  // Tablet-only: the sidebar defaults to an icon-only rail to save width on
  // medium screens, with this toggle temporarily expanding it into the full
  // labeled sidebar as an overlay (not pushing content). Laptop/Desktop
  // always show the full sidebar regardless of this state — every `lg:`
  // class below wins over the `md:` rail classes at 1024px+ no matter what.
  const [railExpanded, setRailExpanded] = useState(false)

  const { data: signupRequestsData } = useQuery({
    queryKey: ['signup-requests'],
    queryFn: signupRequestsApi.list,
    enabled: isSuperAdmin,
    refetchInterval: 60_000,
  })
  const pendingSignupCount = (signupRequestsData?.requests ?? []).filter((r) => r.status === 'pending').length

  const { data: passwordResetData } = useQuery({
    queryKey: ['password-reset-requests'],
    queryFn: passwordResetRequestsApi.list,
    enabled: isSuperAdmin,
    refetchInterval: 60_000,
  })
  const pendingPasswordResetCount = (passwordResetData?.requests ?? []).filter((r) => r.status === 'pending').length
  const navItems =
    profile && (profile.role === 'admin' || profile.role === 'super_admin')
      ? [...NAV_ITEMS.slice(0, 5), { to: '/team', label: 'Team', icon: UsersRound }, NAV_ITEMS[5]]
      : NAV_ITEMS

  const workspaceLabel = isSuperAdmin
    ? viewingOrgId === undefined
      ? null
      : viewingOrgName
    : profile?.organization_name

  // Visible whenever the mobile drawer is open, the tablet rail is expanded,
  // or we're at Laptop+ — hidden only in the tablet-collapsed-rail gap.
  const labelClass = railExpanded ? '' : 'md:hidden lg:inline'
  const rowJustify = railExpanded ? '' : 'md:justify-center md:px-0 lg:justify-start lg:px-3'

  function NavItem({ to, end, icon: Icon, children, badge }: { to: string; end?: boolean; icon: typeof Target; children: ReactNode; badge?: number }) {
    return (
      <NavLink
        to={to}
        end={end}
        onClick={onClose}
        title={railExpanded ? undefined : undefined}
        className={({ isActive }) =>
          clsx(
            'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150',
            rowJustify,
            isActive
              ? 'bg-accent-500/15 text-accent-400 shadow-[inset_0_0_0_1px_rgba(91,108,240,0.35)]'
              : 'text-base-300 hover:bg-base-800 hover:text-base-100'
          )
        }
      >
        <Icon size={18} strokeWidth={2} className="shrink-0" />
        <span className={clsx('flex-1 truncate', labelClass)}>{children}</span>
        {Boolean(badge) && (
          <span className={clsx('flex h-5 min-w-[20px] items-center justify-center rounded-full bg-warn px-1.5 text-xs font-semibold text-base-950', labelClass)}>
            {badge}
          </span>
        )}
      </NavLink>
    )
  }

  return (
    <>
      {/* Backdrop — mobile drawer */}
      <div
        onClick={onClose}
        className={clsx(
          'fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-200 md:hidden',
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
      />
      {/* Backdrop — tablet rail expanded overlay */}
      <div
        onClick={() => setRailExpanded(false)}
        className={clsx(
          'fixed inset-0 z-40 hidden bg-black/60 backdrop-blur-sm transition-opacity duration-200 lg:hidden',
          railExpanded ? 'md:block md:opacity-100' : 'md:pointer-events-none md:opacity-0'
        )}
      />

      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-50 flex h-screen w-64 shrink-0 flex-col border-r border-base-700/60',
          'bg-base-900/95 backdrop-blur-xl transition-all duration-200 ease-out',
          open ? 'translate-x-0' : '-translate-x-full',
          railExpanded
            ? 'md:translate-x-0 md:w-64 md:shadow-2xl'
            : 'md:static md:z-auto md:w-16 md:translate-x-0 md:bg-base-900/60',
          'lg:static lg:z-auto lg:w-64 lg:translate-x-0 lg:bg-base-900/60'
        )}
      >
        <div className={clsx('px-6 py-6', !railExpanded && 'md:px-3', 'lg:px-6')}>
          <div className={clsx('flex items-center', railExpanded ? 'justify-between' : 'md:justify-center lg:justify-between', 'justify-between')}>
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-500 shadow-glow">
                <Target size={18} className="text-white" />
              </div>
              <span className={clsx('text-base font-semibold tracking-tight text-base-100', labelClass)}>Leads CRM</span>
            </div>
            <button onClick={onClose} className="btn-ghost -mr-2 h-11 w-11 px-0 md:hidden" aria-label="Close menu">
              <X size={20} />
            </button>
            <button
              onClick={() => setRailExpanded((v) => !v)}
              className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base-400 transition-colors hover:bg-base-800 hover:text-base-100 md:inline-flex lg:hidden"
              aria-label={railExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
              title={railExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
            >
              {railExpanded ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
            </button>
          </div>
          {workspaceLabel && (
            <div className={clsx('mt-3 flex items-center gap-1.5 rounded-lg bg-base-800/60 px-2.5 py-1.5 text-xs text-base-300', !railExpanded && 'md:hidden', 'lg:flex')}>
              <Building2 size={13} className="shrink-0 text-base-400" />
              <span className="truncate">{workspaceLabel}</span>
            </div>
          )}
          {isSuperAdmin && viewingOrgId !== undefined && (
            <button
              className={clsx('mt-1.5 flex items-center gap-1.5 text-xs text-accent-400 hover:underline', !railExpanded && 'md:hidden', 'lg:flex')}
              onClick={() => {
                exitToOrganizations()
                navigate('/organizations')
              }}
            >
              <ArrowLeftRight size={12} />
              Switch organization
            </button>
          )}
        </div>

        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-1">
          {isSuperAdmin && (
            <NavItem to="/organizations" icon={Building2}>
              Organizations
            </NavItem>
          )}
          {isSuperAdmin && (
            <NavItem to="/signup-requests" icon={UserPlus2} badge={pendingSignupCount}>
              Signup Requests
            </NavItem>
          )}
          {isSuperAdmin && (
            <NavItem to="/password-reset-requests" icon={KeyRound} badge={pendingPasswordResetCount}>
              Password Reset Requests
            </NavItem>
          )}
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavItem key={to} to={to} end={to === '/leads'} icon={Icon}>
              {label}
            </NavItem>
          ))}
        </nav>

        <div className={clsx('border-t border-base-700/60 p-3')}>
          <div className={clsx('mb-2 flex items-center gap-2.5 rounded-lg px-3 py-2', !railExpanded && 'md:justify-center md:px-0', 'lg:justify-start lg:px-3')}>
            <Avatar name={profile?.nickname || session?.user.email} />
            <div className={clsx('min-w-0', labelClass)}>
              <p className="truncate text-sm font-medium text-base-100">
                {profile?.nickname || session?.user.email}
              </p>
              {profile && <RoleBadge role={profile.role} />}
            </div>
          </div>
          <button
            onClick={() => signOut()}
            className={clsx('btn-ghost w-full', !railExpanded && 'md:justify-center md:px-0', 'lg:justify-start lg:px-4')}
            title="Logout"
          >
            <LogOut size={18} strokeWidth={2} className="shrink-0" />
            <span className={labelClass}>Logout</span>
          </button>
        </div>
      </aside>
    </>
  )
}
