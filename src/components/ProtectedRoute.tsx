import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

export function ProtectedRoute() {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-base-950">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
      </div>
    )
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

  if (loading || !profile) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-base-950">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
      </div>
    )
  }

  if (profile.role === 'user') {
    return <Navigate to="/dashboard" state={{ accessDenied: true }} replace />
  }

  return <Outlet />
}

/** Gates a route to the Super Admin only (the Organizations platform view). */
export function RequireSuperAdmin() {
  const { profile, loading } = useAuth()

  if (loading || !profile) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-base-950">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
      </div>
    )
  }

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

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-base-950">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
      </div>
    )
  }

  if (mfaPending) {
    return <Navigate to="/mfa-challenge" replace />
  }

  return <Outlet />
}

/** Blocks access to the rest of the app until a mandatory password change
 * (set on the profile by the Signup Request approve flow) is completed. */
export function RequirePasswordSet() {
  const { profile, loading } = useAuth()

  if (loading || !profile) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-base-950">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
      </div>
    )
  }

  if (profile.force_password_change) {
    return <Navigate to="/set-new-password" replace />
  }

  return <Outlet />
}

/** Sends the Super Admin to the Organizations Overview by default; everyone else to Leads. */
export function DefaultLanding() {
  const { profile } = useAuth()
  return <Navigate to={profile?.role === 'super_admin' ? '/organizations' : '/leads'} replace />
}
