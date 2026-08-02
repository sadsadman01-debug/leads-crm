import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { teamApi, auditEventsApi } from '@/lib/api'
import { pushDataLayerEvent } from '@/lib/gtm'
import { DEFAULT_USER_PERMISSIONS, type Role, type UserPermissions } from '@/types/team'

export interface CurrentProfile {
  id: string
  email: string
  nickname: string | null
  role: Role
  is_active: boolean
  organization_id: string | null
  organization_name: string | null
  permissions: UserPermissions
  force_password_change: boolean
  review_due: boolean
  pending_review_number: number | null
}

interface AuthContextValue {
  session: Session | null
  profile: CurrentProfile | null
  loading: boolean
  /** True once email+password succeeds but this session hasn't completed an
   * MFA challenge yet (the account has a verified TOTP factor, current AAL is
   * still aal1). While true, the rest of the app is inaccessible — see
   * `RequireMfaVerified` in ProtectedRoute.tsx. */
  mfaPending: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<CurrentProfile | null>
  refreshMfaStatus: () => Promise<boolean>
  /** Called by MfaChallenge right after a successful code verification —
   * completes the login_attempt GTM event that signIn() deferred, now that
   * the full flow (password + 2FA) has actually finished. */
  completeMfaVerification: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<CurrentProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [mfaPending, setMfaPending] = useState(false)

  // Set by signIn() right after a successful password step, so the
  // login_attempt GTM event can be deferred until the FULL flow resolves —
  // fired either from syncAuthState below (no 2FA required) or from
  // completeMfaVerification() once the MFA challenge is also verified. Never
  // set on a plain session restore (page reload), so those never fire a
  // stray event.
  const awaitingLoginEventRef = useRef(false)

  async function loadProfile() {
    try {
      const me = await teamApi.me()
      setProfile(me)
      return me
    } catch {
      setProfile(null)
      return null
    }
  }

  async function refreshMfaStatus() {
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    const pending = Boolean(data && data.nextLevel === 'aal2' && data.currentLevel !== data.nextLevel)
    setMfaPending(pending)
    return pending
  }

  async function syncAuthState(newSession: Session | null) {
    setSession(newSession)
    if (newSession) {
      const [loadedProfile, pending] = await Promise.all([loadProfile(), refreshMfaStatus()])
      // Using the values Promise.all just resolved (not React state, which
      // may not have committed yet) avoids a race between the two calls.
      if (awaitingLoginEventRef.current && !pending) {
        awaitingLoginEventRef.current = false
        pushDataLayerEvent('login_attempt', { login_success: true, login_role: loadedProfile?.role ?? null })
      }
    } else {
      setProfile(null)
      setMfaPending(false)
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      await syncAuthState(data.session)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      syncAuthState(newSession)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    auditEventsApi.logAuthEvent(error ? 'login_failure' : 'login_success', email).catch(() => {})

    if (error) {
      // A failed password step is itself the final outcome — no 2FA step follows.
      pushDataLayerEvent('login_attempt', { login_success: false, login_role: null })
    } else {
      // Defer: syncAuthState (triggered by the auth state change this
      // triggers) fires the event once it knows whether 2FA is required.
      awaitingLoginEventRef.current = true
    }

    return { error: error?.message ?? null }
  }

  async function completeMfaVerification() {
    const pending = await refreshMfaStatus()
    if (awaitingLoginEventRef.current && !pending) {
      awaitingLoginEventRef.current = false
      pushDataLayerEvent('login_attempt', { login_success: true, login_role: profile?.role ?? null })
    }
  }

  async function signOut() {
    // Logged before signing out — once the session is gone there's no
    // bearer token left to authenticate this call with.
    await auditEventsApi.logSecurityEvent('logout').catch(() => {})
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        profile,
        loading,
        mfaPending,
        signIn,
        signOut,
        refreshProfile: loadProfile,
        refreshMfaStatus,
        completeMfaVerification,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export function isAdminOrAbove(role: Role | undefined): boolean {
  return role === 'admin' || role === 'super_admin'
}

/** Admins/super admins always pass; a User's access is gated by their
 * individually configured permissions jsonb, defaulted server-side. */
export function hasPermission(profile: CurrentProfile | null | undefined, key: keyof UserPermissions): boolean {
  if (!profile) return false
  if (isAdminOrAbove(profile.role)) return true
  return Boolean(profile.permissions?.[key])
}
