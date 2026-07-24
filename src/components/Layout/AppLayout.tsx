import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { MobileTopBar } from './MobileTopBar'

export function AppLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-base-950">
      <Sidebar open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      <MobileTopBar onOpenMenu={() => setMobileNavOpen(true)} />
      <main className="flex-1 overflow-y-auto pt-14 md:pt-0">
        <div className="mx-auto max-w-6xl px-4 py-6 animate-fadeIn sm:px-6 md:px-8 md:py-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
