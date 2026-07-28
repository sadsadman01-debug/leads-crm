import { useEffect, useState } from 'react'

/** Tracks `navigator.onLine`, updated live via the `online`/`offline` window
 * events — used to show a friendly "you're offline" state instead of letting
 * every individual data fetch fail silently/confusingly. */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))

  useEffect(() => {
    function goOnline() {
      setOnline(true)
    }
    function goOffline() {
      setOnline(false)
    }
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  return online
}
