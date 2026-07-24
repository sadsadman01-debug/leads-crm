import { Menu, Target } from 'lucide-react'

export function MobileTopBar({ onOpenMenu }: { onOpenMenu: () => void }) {
  return (
    <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-base-700/60 bg-base-900/95 px-4 backdrop-blur-xl md:hidden">
      <button onClick={onOpenMenu} className="btn-ghost -ml-2 h-11 w-11 px-0" aria-label="Open menu">
        <Menu size={22} />
      </button>
      <div className="flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-accent-500">
          <Target size={13} className="text-white" />
        </div>
        <span className="text-sm font-semibold tracking-tight text-base-100">Leads CRM</span>
      </div>
    </header>
  )
}
