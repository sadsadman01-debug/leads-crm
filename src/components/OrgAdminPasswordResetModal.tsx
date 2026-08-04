import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { organizationsApi } from '@/lib/api'
import { Modal } from '@/components/ui/Modal'
import { TempPasswordResult } from '@/components/TempPasswordResult'
import type { OrganizationSummary } from '@/types/organization'
import type { PasswordResetResult } from '@/types/passwordResetRequest'

function draftResetMessage(result: PasswordResetResult): string {
  const loginUrl = `${window.location.origin}/login`
  return `Hi ${result.nickname},

Your password has been reset.

Login URL: ${loginUrl}
Email: ${result.email}
Temporary Password: ${result.temporary_password}

Please log in and set a new password when prompted.`
}

/** A shortcut from the Organizations table — resets this Organization's
 * single Admin account's password directly, reusing the exact same
 * performPasswordReset mechanism (and result screen) as Team Management's
 * per-user reset and DirectPasswordResetModal. */
export function OrgAdminPasswordResetModal({ org, onClose }: { org: OrganizationSummary | null; onClose: () => void }) {
  const [result, setResult] = useState<PasswordResetResult | null>(null)
  const [draft, setDraft] = useState('')

  useEffect(() => {
    if (org) {
      setResult(null)
      setDraft('')
    }
  }, [org])

  const mutation = useMutation({
    mutationFn: () => organizationsApi.resetAdminPassword(org!.id),
    onSuccess: (data) => {
      setResult(data.admin)
      setDraft(draftResetMessage(data.admin))
    },
  })

  if (!org) return null

  if (result) {
    return (
      <Modal open onClose={onClose} title="Password reset" size="lg">
        <TempPasswordResult email={result.email} temporaryPassword={result.temporary_password} draft={draft} onDraftChange={setDraft} />
        <div className="mt-5 flex justify-end border-t border-base-700/60 pt-4">
          <button className="btn-primary" onClick={onClose}>Done</button>
        </div>
      </Modal>
    )
  }

  if (!org.admin) {
    return (
      <Modal open onClose={onClose} title={`Reset Admin password for ${org.name}?`}>
        <p className="text-sm text-base-300">This organization has no Admin account.</p>
        <div className="mt-5 flex justify-end border-t border-base-700/60 pt-4">
          <button className="btn-secondary" onClick={onClose}>Close</button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal open onClose={onClose} title={`Reset Admin password for ${org.name}?`}>
      <p className="mb-3 text-sm text-base-300">
        This generates a new temporary password for <strong className="text-base-200">{org.admin.email}</strong> (this
        organization's Admin) and requires them to set a new one on their next login.
      </p>
      {mutation.isError && (
        <div className="mb-3 flex items-center gap-2 text-sm text-danger">
          <AlertTriangle size={15} className="shrink-0" />
          {(mutation.error as Error).message}
        </div>
      )}
      <div className="flex justify-end gap-3 border-t border-base-700/60 pt-4">
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? 'Resetting…' : 'Reset Password'}
        </button>
      </div>
    </Modal>
  )
}
