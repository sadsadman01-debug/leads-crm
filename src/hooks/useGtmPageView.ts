import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { pushDataLayerEvent } from '@/lib/gtm'

/** Pushes a virtual page_view event on every client-side route change,
 * across the whole app (public pages and every authenticated role) — a
 * full page reload isn't guaranteed for SPA navigation, so GTM/GA4
 * wouldn't otherwise see these. Mounted once at the App root, inside the
 * Router, so it fires for every route without each page needing its own. */
export function useGtmPageView() {
  const location = useLocation()

  useEffect(() => {
    pushDataLayerEvent('page_view', { page_path: location.pathname + location.search })
  }, [location.pathname, location.search])
}
