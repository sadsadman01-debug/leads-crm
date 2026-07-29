import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { setSubscriptionExpiredHandler } from '@/lib/api'

/** Bridges the module-level API client (outside React) to the router — any
 * authenticated call that comes back blocked with a 402 subscription_expired
 * response redirects here immediately, on whichever request happened to
 * trigger it (login's first profile fetch, or any later page load/action for
 * an already-open session whose Organization expired in the meantime). */
export function SubscriptionGuard() {
  const navigate = useNavigate()

  useEffect(() => {
    setSubscriptionExpiredHandler(() => navigate('/subscription-expired'))
    return () => setSubscriptionExpiredHandler(null)
  }, [navigate])

  return null
}
