import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { passwordResetRequestsApi } from '@/lib/api'
import { Modal } from '@/components/ui/Modal'
import { TempPasswordResult } from '@/components/TempPasswordResult'
import type { PasswordResetRequest, PasswordResetResult } from '@/types/passwordResetRequest'

function draftResetMessage(result: PasswordResetResult): string {
  const loginUrl = `${window.location.origin}/login`
  return `Hi ${result.nickname},

Your password has been reset.

Login URL: ${loginUrl}
Email: ${result.email}
Temporary Password: ${result.temporary_password}

Please log in and set a new password when prompted.`
}

/** Shared by both the Admin's Team Management tab and the Super Admin's
 * platform-wide Password Reset Requests page — resolving a request always
 * runs through the same reuse-the-signup-flow result screen. */
export function PasswordResetResolveModal({
  request,
  onClose,
}: {
  request: PasswordResetRequest | null
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [result, setResult] = useState<PasswordResetResult | null>(null)
  const [draft, setDraft] = useState('')

  useEffect(() => {
    if (request) {
      setResult(null)
      setDraft('')
    }
  }, [request])

  const mutation = useMutation({
    mutationFn: () => passwordResetRequestsApi.resolve(request!.id),
    onSuccess: (data) => {
      setResult(data.admin)
      setDraft(draftResetMessage(data.admin))
      queryClient.invalidateQueries({ queryKey: ['password-reset-requests'] })
    },
  })

  if (!request) return null

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

  return (
    <Modal open onClose={onClose} title={`Reset password for ${request.target_nickname || request.target_email}?`}>
      <p className="mb-3 text-sm text-base-300">
        This generates a new temporary password for <strong className="text-base-200">{request.target_email}</strong>{' '}
        and requires them to set a new one on their next login.
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
