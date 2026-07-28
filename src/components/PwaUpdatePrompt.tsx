import { useRegisterSW } from 'virtual:pwa-register/react'
import { RefreshCw, X } from 'lucide-react'

/** Registers the service worker once at app root and shows a small toast
 * whenever a newly-deployed version has finished precaching in the
 * background — refreshing calls `updateServiceWorker`, which activates the
 * new worker (skipWaiting + clientsClaim, configured in vite.config.ts) and
 * reloads, so users are never silently stuck on a stale cached build. */
export function PwaUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return
      // Check for a new deployment periodically while the tab stays open.
      setInterval(() => registration.update(), 60 * 60 * 1000)
    },
  })

  if (!needRefresh) return null

  return (
    <div className="fixed bottom-5 left-5 z-40 flex items-center gap-3 rounded-xl border border-base-700/60 bg-base-900 px-4 py-3 shadow-lg animate-fadeIn">
      <p className="text-sm text-base-200">New version available</p>
      <button className="btn-primary px-3 py-1.5 text-xs" onClick={() => updateServiceWorker(true)}>
        <RefreshCw size={13} />
        Refresh
      </button>
      <button onClick={() => setNeedRefresh(false)} className="btn-ghost h-8 w-8 px-0" aria-label="Dismiss">
        <X size={14} />
      </button>
    </div>
  )
}
