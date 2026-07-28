import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Loader2, ShieldCheck, ShieldOff, Smartphone } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { auditEventsApi } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { Modal } from '@/components/ui/Modal'

type EnrollState = {
  factorId: string
  qrCode: string
  secret: string
} | null

export function SecuritySettings() {
  const { profile, refreshMfaStatus } = useAuth()
  const queryClient = useQueryClient()
  const isAdminOrAbove = profile?.role === 'admin' || profile?.role === 'super_admin'

  const { data: factorsData, isLoading } = useQuery({
    queryKey: ['mfa-factors'],
    queryFn: async () => {
      const { data, error } = await supabase.auth.mfa.listFactors()
      if (error) throw error
      return data
    },
  })
  const verifiedFactor = factorsData?.totp.find((f) => f.status === 'verified') ?? null

  const [enroll, setEnroll] = useState<EnrollState>(null)
  const [enrollCode, setEnrollCode] = useState('')
  const [enrollError, setEnrollError] = useState<string | null>(null)
  const [enrolling, setEnrolling] = useState(false)
  const [justEnabled, setJustEnabled] = useState(false)

  const [disableOpen, setDisableOpen] = useState(false)
  const [reverifyNeeded, setReverifyNeeded] = useState(false)
  const [reverifyCode, setReverifyCode] = useState('')
  const [reverifyError, setReverifyError] = useState<string | null>(null)
  const [reverifying, setReverifying] = useState(false)

  function invalidateFactors() {
    queryClient.invalidateQueries({ queryKey: ['mfa-factors'] })
  }

  async function startEnroll() {
    setEnrollError(null)
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Authenticator App' })
    if (error) {
      setEnrollError(error.message)
      return
    }
    setEnroll({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret })
    setEnrollCode('')
  }

  async function confirmEnroll() {
    if (!enroll) return
    setEnrollError(null)
    setEnrolling(true)
    const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId: enroll.factorId })
    if (challengeErr) {
      setEnrolling(false)
      setEnrollError(challengeErr.message)
      return
    }
    const { error: verifyErr } = await supabase.auth.mfa.verify({
      factorId: enroll.factorId,
      challengeId: challenge.id,
      code: enrollCode,
    })
    setEnrolling(false)
    if (verifyErr) {
      setEnrollError('Incorrect code — check your authenticator app and try again.')
      return
    }
    setEnroll(null)
    setJustEnabled(true)
    setTimeout(() => setJustEnabled(false), 5000)
    auditEventsApi.logSecurityEvent('mfa_enabled').catch(() => {})
    await refreshMfaStatus()
    invalidateFactors()
  }

  function cancelEnroll() {
    if (enroll) supabase.auth.mfa.unenroll({ factorId: enroll.factorId })
    setEnroll(null)
    setEnrollError(null)
  }

  async function openDisable() {
    setReverifyError(null)
    setReverifyCode('')
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    setReverifyNeeded(data?.currentLevel !== 'aal2')
    setDisableOpen(true)
  }

  async function handleReverify() {
    if (!verifiedFactor) return
    setReverifyError(null)
    setReverifying(true)
    const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId: verifiedFactor.id })
    if (challengeErr) {
      setReverifying(false)
      setReverifyError(challengeErr.message)
      return
    }
    const { error: verifyErr } = await supabase.auth.mfa.verify({
      factorId: verifiedFactor.id,
      challengeId: challenge.id,
      code: reverifyCode,
    })
    setReverifying(false)
    if (verifyErr) {
      setReverifyError('Incorrect code — try again.')
      return
    }
    setReverifyNeeded(false)
  }

  const disableMutation = useMutation({
    mutationFn: async () => {
      if (!verifiedFactor) throw new Error('No factor to disable')
      const { error } = await supabase.auth.mfa.unenroll({ factorId: verifiedFactor.id })
      if (error) throw error
    },
    onSuccess: () => {
      setDisableOpen(false)
      auditEventsApi.logSecurityEvent('mfa_disabled').catch(() => {})
      invalidateFactors()
      refreshMfaStatus()
    },
  })

  return (
    <div className="card p-6">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-base-300">Security</h2>
      <p className="mb-5 text-xs text-base-400">
        Add an extra layer of protection to your own account with an authenticator app (Google Authenticator, Authy,
        1Password, etc.).
      </p>

      {isLoading ? (
        <p className="text-sm text-base-400">Loading…</p>
      ) : enroll ? (
        <div className="max-w-md space-y-4">
          <div className="flex flex-col items-center gap-3 rounded-lg bg-base-850 p-4 text-center sm:flex-row sm:text-left">
            <img src={enroll.qrCode} alt="Scan with your authenticator app" className="h-40 w-40 shrink-0 rounded-lg bg-white p-2" />
            <div className="min-w-0">
              <p className="text-sm text-base-200">Scan this QR code with your authenticator app.</p>
              <p className="mt-2 text-xs text-base-400">Can't scan? Enter this key manually:</p>
              <p className="mt-1 break-all rounded bg-base-900 px-2 py-1.5 font-mono text-xs text-base-200">{enroll.secret}</p>
            </div>
          </div>

          <div>
            <label className="label">Enter the 6-digit code from your app</label>
            <input
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              autoFocus
              className="input text-center text-lg tracking-[0.5em]"
              value={enrollCode}
              onChange={(e) => setEnrollCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
            />
          </div>

          {enrollError && <p className="text-sm text-danger">{enrollError}</p>}

          <div className="flex flex-wrap gap-3">
            <button className="btn-secondary" onClick={cancelEnroll}>Cancel</button>
            <button
              className="btn-primary"
              disabled={enrolling || enrollCode.length !== 6}
              onClick={confirmEnroll}
            >
              {enrolling ? <Loader2 size={16} className="animate-spin" /> : null}
              {enrolling ? 'Verifying…' : 'Verify & Enable'}
            </button>
          </div>
        </div>
      ) : verifiedFactor ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-success-bg px-4 py-3">
          <div className="flex items-center gap-2.5">
            <ShieldCheck size={18} className="shrink-0 text-success" />
            <div>
              <p className="text-sm font-medium text-base-100">Two-factor authentication is enabled</p>
              <p className="text-xs text-base-400">
                {verifiedFactor.friendly_name || 'Authenticator App'} · added{' '}
                {new Date(verifiedFactor.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>
          <button className="btn-secondary" onClick={openDisable}>
            <ShieldOff size={15} />
            Disable
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-base-850 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <Smartphone size={18} className="shrink-0 text-base-400" />
            <div>
              <p className="text-sm font-medium text-base-100">Two-factor authentication is not enabled</p>
              {isAdminOrAbove && (
                <span className="mt-0.5 inline-flex items-center rounded-full bg-accent-500/15 px-2 py-0.5 text-[11px] font-medium text-accent-400">
                  Recommended for your role
                </span>
              )}
            </div>
          </div>
          <button className="btn-primary" onClick={startEnroll}>
            Enable Two-Factor Authentication
          </button>
        </div>
      )}

      {justEnabled && (
        <div className="mt-3 flex items-center gap-2 text-sm text-success animate-fadeIn">
          <CheckCircle2 size={16} />
          Two-factor authentication is now enabled.
        </div>
      )}

      <Modal open={disableOpen} onClose={() => setDisableOpen(false)} title="Disable Two-Factor Authentication?">
        {reverifyNeeded ? (
          <div className="space-y-4">
            <p className="text-sm text-base-300">
              For your security, please re-enter a code from your authenticator app before disabling two-factor
              authentication.
            </p>
            <input
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              autoFocus
              className="input text-center text-lg tracking-[0.5em]"
              value={reverifyCode}
              onChange={(e) => setReverifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
            />
            {reverifyError && <p className="text-sm text-danger">{reverifyError}</p>}
            <div className="flex justify-end gap-3 border-t border-base-700/60 pt-4">
              <button className="btn-secondary" onClick={() => setDisableOpen(false)}>Cancel</button>
              <button className="btn-primary" disabled={reverifying || reverifyCode.length !== 6} onClick={handleReverify}>
                {reverifying ? 'Verifying…' : 'Verify'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-base-300">
              This removes the extra layer of protection from your account. You can re-enable it any time.
            </p>
            {disableMutation.isError && (
              <p className="text-sm text-danger">{(disableMutation.error as Error).message}</p>
            )}
            <div className="flex justify-end gap-3 border-t border-base-700/60 pt-4">
              <button className="btn-secondary" onClick={() => setDisableOpen(false)}>Cancel</button>
              <button className="btn-danger" disabled={disableMutation.isPending} onClick={() => disableMutation.mutate()}>
                {disableMutation.isPending ? 'Disabling…' : 'Disable Two-Factor Authentication'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
