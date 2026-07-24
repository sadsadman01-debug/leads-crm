import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Users, UserPlus, Settings as SettingsIcon, LogOut, Target } from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '@/contexts/AuthContext'

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/leads', label: 'Leads', icon: Users },
  { to: '/leads/new', label: 'Add New Lead', icon: UserPlus },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
]

export function Sidebar() {
  const { session, signOut } = useAuth()

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-base-700/60 bg-base-900/60 backdrop-blur-xl">
      <div className="flex items-center gap-2.5 px-6 py-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-500 shadow-glow">
          <Target size={18} className="text-white" />
        </div>
        <span className="text-base font-semibold tracking-tight text-base-100">Leads CRM</span>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/leads'}
            className={({ isActive }) =>
              clsx(
                'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150',
                isActive
                  ? 'bg-accent-500/15 text-accent-400 shadow-[inset_0_0_0_1px_rgba(91,108,240,0.35)]'
                  : 'text-base-300 hover:bg-base-800 hover:text-base-100'
              )
            }
          >
            <Icon size={18} strokeWidth={2} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-base-700/60 p-3">
        <div className="mb-2 flex items-center gap-2.5 rounded-lg px-3 py-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-base-700 text-xs font-semibold text-base-200">
            {session?.user.email?.[0]?.toUpperCase() ?? 'A'}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-base-100">{session?.user.email}</p>
            <p className="text-xs text-base-400">Admin</p>
          </div>
        </div>
        <button onClick={() => signOut()} className="btn-ghost w-full justify-start">
          <LogOut size={18} strokeWidth={2} />
          Logout
        </button>
      </div>
    </aside>
  )
}
