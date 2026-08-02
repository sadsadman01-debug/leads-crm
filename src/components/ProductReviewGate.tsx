import { useAuth } from '@/contexts/AuthContext'
import { ProductReviewPopup } from './ProductReviewPopup'

/** Mounted at the app root alongside `SubscriptionGuard` — a pure `profile`-
 * driven overlay with no route/navigation logic. Re-evaluates whenever
 * `profile` changes (login, tab refocus refetch, or the popup's own
 * post-submit `refreshProfile()` call), so it disappears the moment the
 * account is no longer due and never reappears until the next fixed date. */
export function ProductReviewGate() {
  const { profile } = useAuth()
  if (!profile?.review_due || !profile.pending_review_number) return null
  return <ProductReviewPopup pendingReviewNumber={profile.pending_review_number} />
}
