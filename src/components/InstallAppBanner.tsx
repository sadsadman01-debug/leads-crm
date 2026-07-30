import { useState } from 'react'
import { Download, Share, X } from 'lucide-react'
import { useInstallPrompt } from '@/hooks/useInstallPrompt'
import { isIosSafari } from '@/lib/platform'

const DISMISS_KEY = 'pwa-install-banner-dismissed-until'
const DISMISS_MS = 14 * 24 * 60 * 60 * 1000 // 2 weeks

function readDismissed(): boolean {
  const until = localStorage.getItem(DISMISS_KEY)
  return until ? Date.now() < Number(until) : false
}

/** Android/Desktop Chrome+Edge get a real "Install" button wired to the
 * captured `beforeinstallprompt` event; iOS Safari (which has no such API)
 * gets a one-time educational nudge instead, since installing there is a
 * manual "Share → Add to Home Screen" step only the user can perform. Hidden
 * entirely once installed, or for two weeks after being dismissed. */
export function InstallAppBanner() {
  const { canInstall, isStandalone, promptInstall } = useInstallPrompt()
  const [dismissed, setDismissed] = useState(readDismissed)
  const showIosNudge = isIosSafari()

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_MS))
    setDismissed(true)
  }

  if (isStandalone || dismissed) return null
  if (!canInstall && !showIosNudge) return null

  return (
    <div className="fixed inset-x-0 bottom-5 z-40 flex justify-center px-4">
      <div className="flex max-w-sm items-center gap-3 rounded-xl border border-base-700/60 bg-base-900 px-4 py-3 shadow-lg animate-fadeIn">
        {canInstall ? (
          <>
            <Download size={18} className="shrink-0 text-accent-400" />
            <p className="flex-1 text-sm text-base-200">Install Leadify for quicker, full-screen access.</p>
            <button className="btn-primary shrink-0 px-3 py-1.5 text-xs" onClick={() => promptInstall()}>
              Install
            </button>
          </>
        ) : (
          <>
            <Share size={18} className="shrink-0 text-accent-400" />
            <p className="flex-1 text-sm text-base-200">
              To install this app on your iPhone: tap the <strong>Share</strong> icon, then{' '}
              <strong>Add to Home Screen</strong>.
            </p>
          </>
        )}
        <button onClick={dismiss} className="btn-ghost h-8 w-8 shrink-0 px-0" aria-label="Dismiss">
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
