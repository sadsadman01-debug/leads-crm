import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Navigate, Link, useNavigate } from 'react-router-dom'
import { ShieldCheck, AlertCircle, Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

const MAX_ATTEMPTS = 5
const COOLDOWN_SECONDS = 60

export function MfaChallenge() {
  const { mfaPending, refreshMfaStatus, signOut } = useAuth()
  const navigate = useNavigate()

  const [factorId, setFactorId] = useState<string | null>(null)
  const [challengeId, setChallengeId] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [initError, setInitError] = useState<string | null>(null)
  const [failedAttempts, setFailedAttempts] = useState(0)
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null)
  const [cooldownRemaining, setCooldownRemaining] = useState(0)
  const startedRef = useRef(false)

  async function startChallenge() {
    setInitError(null)
    const { data: factorsData, error: factorsErr } = await supabase.auth.mfa.listFactors()
    if (factorsErr) {
      setInitError(factorsErr.message)
      return
    }
    const factor = factorsData.totp.find((f) => f.status === 'verified') ?? factorsData.totp[0]
    if (!factor) {
      setInitError('No authenticator app is set up on this account.')
      return
    }
    setFactorId(factor.id)

    const { data: challengeData, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId: factor.id })
    if (challengeErr) {
      setInitError(challengeErr.message)
      return
    }
    setChallengeId(challengeData.id)
  }

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    startChallenge()
  }, [])

  useEffect(() => {
    if (!cooldownUntil) return
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000))
      setCooldownRemaining(remaining)
      if (remaining <= 0) {
        setCooldownUntil(null)
        setFailedAttempts(0)
      }
    }, 500)
    return () => clearInterval(interval)
  }, [cooldownUntil])

  if (!mfaPending) {
    return <Navigate to="/" replace />
  }

  const inCooldown = cooldownUntil !== null

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!factorId || !challengeId || inCooldown) return
    setError(null)
    setVerifying(true)
    const { error: verifyErr } = await supabase.auth.mfa.verify({ factorId, challengeId, code })
    setVerifying(false)

    if (verifyErr) {
      const attempts = failedAttempts + 1
      setFailedAttempts(attempts)
      setCode('')
      if (attempts >= MAX_ATTEMPTS) {
        setCooldownUntil(Date.now() + COOLDOWN_SECONDS * 1000)
        setError(`Too many incorrect attempts. Try again in ${COOLDOWN_SECONDS} seconds.`)
      } else {
        setError(`Incorrect code. ${MAX_ATTEMPTS - attempts} attempt${MAX_ATTEMPTS - attempts === 1 ? '' : 's'} remaining.`)
      }
      // A challenge can only be verified once (even if it fails) on some
      // configurations — request a fresh one for the retry.
      const { data: freshChallenge } = await supabase.auth.mfa.challenge({ factorId })
      if (freshChallenge) setChallengeId(freshChallenge.id)
      return
    }

    await refreshMfaStatus()
    navigate('/', { replace: true })
  }

  async function handleUseDifferentAccount() {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-base-950 px-4 py-8 animate-fadeIn">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/3 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-500/10 blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 h-[300px] w-[300px] rounded-full bg-accent-500/5 blur-[100px]" />
      </div>

      <div className="card relative w-full max-w-sm p-8 animate-slideUp">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent-500 shadow-glow">
            <ShieldCheck size={24} className="text-white" />
          </div>
          <h1 className="text-xl font-semibold text-base-100">Two-Factor Verification</h1>
          <p className="mt-1 text-sm text-base-400">Enter the 6-digit code from your authenticator app</p>
        </div>

        {initError ? (
          <div className="flex items-center gap-2 rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">
            <AlertCircle size={16} className="shrink-0" />
            {initError}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label" htmlFor="mfa-code">Authentication Code</label>
              <input
                id="mfa-code"
                name="mfa-code"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="one-time-code"
                required
                autoFocus
                maxLength={6}
                disabled={inCooldown}
                className="input text-center text-lg tracking-[0.5em]"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger animate-fadeIn">
                <AlertCircle size={16} className="shrink-0" />
                {inCooldown ? `Too many incorrect attempts. Try again in ${cooldownRemaining}s.` : error}
              </div>
            )}

            <button
              type="submit"
              disabled={verifying || inCooldown || code.length !== 6}
              className="btn-primary w-full hover:scale-[1.01] active:scale-[0.98]"
            >
              {verifying ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Verifying…
                </>
              ) : (
                'Verify'
              )}
            </button>
          </form>
        )}

        <div className="mt-6 flex flex-col items-center gap-2 text-center text-sm text-base-400">
          <Link to="/mfa-locked-out" className="font-medium text-accent-400 hover:underline">
            Locked out of Two-Factor Authentication?
          </Link>
          <button type="button" onClick={handleUseDifferentAccount} className="hover:underline">
            Use a different account
          </button>
        </div>
      </div>
    </div>
  )
}
