import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { mfaResetRequestsApi } from '@/lib/api'
import { Modal } from '@/components/ui/Modal'
import type { MfaResetRequest, MfaResetResult } from '@/types/mfaResetRequest'

/** Shared by both the Admin's Team Management tab and the Super Admin's
 * platform-wide MFA Reset Requests page — mirrors PasswordResetResolveModal. */
export function MfaResetResolveModal({
  request,
  onClose,
}: {
  request: MfaResetRequest | null
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [result, setResult] = useState<MfaResetResult | null>(null)

  useEffect(() => {
    if (request) setResult(null)
  }, [request])

  const mutation = useMutation({
    mutationFn: () => mfaResetRequestsApi.resolve(request!.id),
    onSuccess: (data) => {
      setResult(data.account)
      queryClient.invalidateQueries({ queryKey: ['mfa-reset-requests'] })
    },
  })

  if (!request) return null

  if (result) {
    return (
      <Modal open onClose={onClose} title="Two-factor authentication reset">
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/15">
            <CheckCircle2 size={24} className="text-success" />
          </div>
          <p className="text-sm text-base-200">
            Two-factor authentication has been disabled for <strong className="text-base-100">{result.email}</strong>.
            They can now log in with just their email and password, and set up a new authenticator from Settings →
            Security afterward.
          </p>
        </div>
        <div className="mt-5 flex justify-end border-t border-base-700/60 pt-4">
          <button className="btn-primary" onClick={onClose}>Done</button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal open onClose={onClose} title={`Reset two-factor authentication for ${request.target_nickname || request.target_email}?`}>
      <p className="mb-3 text-sm text-base-300">
        This removes every authenticator device registered to{' '}
        <strong className="text-base-200">{request.target_email}</strong>, letting them sign in with just email and
        password. They'll be able to set up a new authenticator afterward.
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
          {mutation.isPending ? 'Resetting…' : 'Reset Two-Factor Authentication'}
        </button>
      </div>
    </Modal>
  )
}
