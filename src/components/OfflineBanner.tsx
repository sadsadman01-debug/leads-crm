import { WifiOff } from 'lucide-react'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'

/** A friendly, app-wide notice in place of every individual page's data
 * fetches failing with a confusing/broken-looking error — the app itself
 * (already cached by the service worker) still loads offline, only live
 * Supabase data cannot. */
export function OfflineBanner() {
  const online = useOnlineStatus()
  if (online) return null

  return (
    <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-warn-bg px-4 py-2 text-center text-sm font-medium text-warn animate-fadeIn">
      <WifiOff size={15} className="shrink-0" />
      You're offline — reconnect to load your data.
    </div>
  )
}
