import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

function SpinnerScreen() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-base-950">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
    </div>
  )
}

/** Shown instead of an infinite spinner when a session exists but its
 * profile failed to load (stale/orphaned session, deactivated account,
 * etc.) — otherwise every guard below would spin forever with no way out. */
function ProfileLoadError() {
  const { signOut } = useAuth()
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-base-950 px-6 text-center">
      <p className="max-w-sm text-sm text-base-300">
        We couldn't load your account. Your session may be stale, or this account may no longer exist.
      </p>
      <button className="btn-primary" onClick={() => signOut()}>
        Sign Out and Try Again
      </button>
    </div>
  )
}

export function ProtectedRoute() {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <SpinnerScreen />
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <Outlet />
}

/** Gates a route to Admin/Super Admin. Users navigating here directly are
 * bounced to the Dashboard with a brief access-denied message. */
export function RequireAdmin() {
  const { profile, loading } = useAuth()

  if (loading) return <SpinnerScreen />
  if (!profile) return <ProfileLoadError />

  if (profile.role === 'user') {
    return <Navigate to="/dashboard" state={{ accessDenied: true }} replace />
  }

  return <Outlet />
}

/** Gates a route to the Super Admin only (the Organizations platform view). */
export function RequireSuperAdmin() {
  const { profile, loading } = useAuth()

  if (loading) return <SpinnerScreen />
  if (!profile) return <ProfileLoadError />

  if (profile.role !== 'super_admin') {
    return <Navigate to="/dashboard" state={{ accessDenied: true }} replace />
  }

  return <Outlet />
}

/** Blocks access to the rest of the app until this session completes its MFA
 * challenge (the account has 2FA enabled but this specific session is still
 * only aal1) — sends them to the code-entry screen instead. Accounts without
 * 2FA enabled are entirely unaffected (mfaPending is simply always false). */
export function RequireMfaVerified() {
  const { mfaPending, loading } = useAuth()

  if (loading) return <SpinnerScreen />

  if (mfaPending) {
    return <Navigate to="/mfa-challenge" replace />
  }

  return <Outlet />
}

/** Blocks access to the rest of the app until a mandatory password change
 * (set on the profile by the Signup Request approve flow) is completed. */
export function RequirePasswordSet() {
  const { profile, loading } = useAuth()

  if (loading) return <SpinnerScreen />
  if (!profile) return <ProfileLoadError />

  if (profile.force_password_change) {
    return <Navigate to="/set-new-password" replace />
  }

  return <Outlet />
}

/** Gates a route to Affiliate accounts only. */
export function RequireAffiliate() {
  const { profile, loading } = useAuth()

  if (loading) return <SpinnerScreen />
  if (!profile) return <ProfileLoadError />

  if (profile.role !== 'affiliate') {
    return <Navigate to="/leads" replace />
  }

  return <Outlet />
}

/** The inverse of RequireAffiliate — keeps Affiliate accounts (who belong to
 * no Organization and have zero CRM visibility) out of the entire CRM route
 * tree, bouncing them to their own dashboard instead. */
export function RequireNotAffiliate() {
  const { profile, loading } = useAuth()

  if (loading) return <SpinnerScreen />
  if (!profile) return <ProfileLoadError />

  if (profile.role === 'affiliate') {
    return <Navigate to="/affiliate" replace />
  }

  return <Outlet />
}

/** Sends the Super Admin to the Organizations Overview, Affiliates to their
 * own Dashboard, and everyone else to Leads. */
export function DefaultLanding() {
  const { profile } = useAuth()
  const to = profile?.role === 'super_admin' ? '/organizations' : profile?.role === 'affiliate' ? '/affiliate' : '/leads'
  return <Navigate to={to} replace />
}
