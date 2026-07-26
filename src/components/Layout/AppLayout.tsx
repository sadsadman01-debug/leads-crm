import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { brandingApi } from '@/lib/api'
import { applyAccentColor } from '@/lib/brandColors'

export function AppLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  const { data: branding } = useQuery({ queryKey: ['org-branding'], queryFn: brandingApi.get })

  // Applied to `document.documentElement` (rather than a wrapper div) so the
  // CSS vars are still in scope for portal-rendered content (modals, etc.).
  // Cleanup on unmount guarantees a later Login/RequestAccess/ForgotPassword
  // render (which mounts outside this layout) never inherits a stale org's color.
  useEffect(() => {
    applyAccentColor(branding?.accent_color)
    return () => applyAccentColor(null)
  }, [branding?.accent_color])

  return (
    <div className="flex h-screen overflow-hidden bg-base-950">
      <Sidebar open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar onOpenMenu={() => setMobileNavOpen(true)} />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl px-4 py-6 animate-fadeIn sm:px-6 md:px-8 md:py-8 desktop:max-w-7xl desktop:px-10">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
