import { useState, type FormEvent } from 'react'
import { KeyRound, AlertCircle, CheckCircle2, Circle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { auditEventsApi } from '@/lib/api'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { evaluatePasswordStrength } from '@/lib/passwordStrength'

/** Self-service password change, available identically to every role —
 * this is personal account security, not organization-scoped. Requires the
 * caller's current password to be re-verified via a fresh sign-in before
 * the change is allowed, so an already-unlocked session alone can never be
 * enough to take over the password. Doesn't touch MFA enrollment/session
 * state — 2FA (if enabled) remains fully in effect afterward. */
export function ChangePasswordCard() {
  const { session } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const strength = evaluatePasswordStrength(newPassword)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    if (!strength.isValid) {
      setError('New password does not meet the minimum requirements below.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.')
      return
    }
    if (newPassword === currentPassword) {
      setError('New password must be different from your current password.')
      return
    }
    const email = session?.user.email
    if (!email) {
      setError('Could not verify your account. Please refresh the page and try again.')
      return
    }

    setLoading(true)
    // Re-verify the current password via a fresh sign-in before allowing the
    // change — an active session alone must never be sufficient.
    const { error: reauthError } = await supabase.auth.signInWithPassword({ email, password: currentPassword })
    if (reauthError) {
      setLoading(false)
      setError('Current password is incorrect.')
      return
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
    setLoading(false)
    if (updateError) {
      setError(updateError.message)
      return
    }

    auditEventsApi.logSecurityEvent('password_changed').catch(() => {})
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setSuccess(true)
    setTimeout(() => setSuccess(false), 3500)
  }

  return (
    <div className="card p-6">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-base-300">
        <KeyRound size={15} /> Change Password
      </h2>
      <p className="mb-4 text-sm text-base-400">Update the password used to sign in to your account.</p>

      <form onSubmit={handleSubmit} className="max-w-sm space-y-4">
        <div>
          <label className="label" htmlFor="current-password">
            Current Password
          </label>
          <PasswordInput
            id="current-password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={setCurrentPassword}
            required
          />
        </div>

        <div>
          <label className="label" htmlFor="new-password">
            New Password
          </label>
          <PasswordInput
            id="new-password"
            autoComplete="new-password"
            value={newPassword}
            onChange={setNewPassword}
            required
            minLength={8}
          />
          {newPassword && (
            <div className="mt-2 space-y-1.5">
              <div className="flex gap-1">
                {strength.requirements.map((_, i) => (
                  <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i < strength.score ? strength.barColor : 'bg-base-700'}`} />
                ))}
              </div>
              <p className={`text-xs font-medium ${strength.textColor}`}>{strength.label}</p>
              <ul className="space-y-0.5">
                {strength.requirements.map((r) => (
                  <li key={r.label} className={`flex items-center gap-1.5 text-xs ${r.met ? 'text-success' : 'text-base-500'}`}>
                    {r.met ? <CheckCircle2 size={12} className="shrink-0" /> : <Circle size={12} className="shrink-0" />}
                    {r.label}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div>
          <label className="label" htmlFor="confirm-new-password">
            Confirm New Password
          </label>
          <PasswordInput
            id="confirm-new-password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            required
            minLength={8}
          />
          {confirmPassword && newPassword !== confirmPassword && (
            <p className="mt-1 text-xs text-danger">Passwords do not match.</p>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">
            <AlertCircle size={14} className="shrink-0" />
            {error}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Updating…' : 'Update Password'}
          </button>
          {success && (
            <span className="flex items-center gap-1 text-sm text-success">
              <CheckCircle2 size={15} /> Password updated successfully
            </span>
          )}
        </div>
      </form>
    </div>
  )
}
