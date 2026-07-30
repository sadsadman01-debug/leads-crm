import { Menu, Target } from 'lucide-react'
import { NotificationBell } from '@/components/NotificationBell'
import { GlobalSearch } from '@/components/GlobalSearch'

/** Persistent header spanning the main content area on every page, at every
 * breakpoint — on mobile it also carries the hamburger trigger and the app
 * logo (the sidebar is off-screen there); on desktop the sidebar already
 * shows those, so this stays a slim strip carrying Global Search and the bell. */
export function TopBar({ onOpenMenu }: { onOpenMenu: () => void }) {
  return (
    <header className="relative flex h-14 shrink-0 items-center gap-3 border-b border-base-700/60 px-4 md:h-12 md:px-6">
      {/* A `backdrop-filter` directly on <header> would make it the CSS
          containing block for any `position: fixed` descendant (e.g. the
          Notification panel's mobile layout) — WebKit standalone/home-screen
          contexts enforce this more consistently than a regular mobile
          Safari tab, collapsing `top-14 bottom-0` to a zero-height box there.
          Isolating the blur to a non-ancestor background layer keeps the
          identical look without making <header> a containing block. */}
      <div className="absolute inset-0 -z-10 bg-base-900/95 backdrop-blur-xl md:bg-base-900/40" />
      <div className="flex shrink-0 items-center gap-3">
        <button onClick={onOpenMenu} className="btn-ghost -ml-2 h-11 w-11 px-0 md:hidden" aria-label="Open menu">
          <Menu size={22} />
        </button>
        <div className="flex items-center gap-2 md:hidden">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-accent-500">
            <Target size={13} className="text-white" />
          </div>
          <span className="text-sm font-semibold tracking-tight text-base-100">Leadify</span>
        </div>
      </div>
      <GlobalSearch />
      <NotificationBell />
    </header>
  )
}
