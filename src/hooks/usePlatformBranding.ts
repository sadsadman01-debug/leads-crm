import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { platformBrandingApi } from '@/lib/api'
import { applyAccentColor } from '@/lib/brandColors'

/** For the pre-auth pages (Login, Request Access, Forgot Password) — fetches
 * Platform Default Branding and applies its accent color as the CSS custom
 * property, with cleanup on unmount so navigating away never leaves a stale
 * color applied. Callers render their own logo/name fallback from the
 * returned `data` (falls back to the hardcoded Target icon / "Leads CRM"
 * when `data` has no override, same as the authenticated Sidebar). */
export function usePlatformBranding() {
  const { data } = useQuery({ queryKey: ['platform-branding'], queryFn: platformBrandingApi.get })

  useEffect(() => {
    applyAccentColor(data?.accent_color)
    return () => applyAccentColor(null)
  }, [data?.accent_color])

  return data
}
