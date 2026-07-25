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
