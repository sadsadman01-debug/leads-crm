import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { signupRequestsApi } from '@/lib/api'
import { Modal } from '@/components/ui/Modal'
import type { SignupRequest } from '@/types/signupRequest'

export function RejectModal({ request, onClose }: { request: SignupRequest | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (request) setReason('')
  }, [request])

  const mutation = useMutation({
    mutationFn: () => signupRequestsApi.reject(request!.id, reason.trim() || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['signup-requests'] })
      onClose()
    },
  })

  if (!request) return null

  return (
    <Modal open={Boolean(request)} onClose={onClose} title={`Reject request from ${request.organization_name}?`}>
      <p className="mb-4 text-sm text-base-300">
        No account or organization will be created. This is for your own record-keeping only — nothing is sent to{' '}
        {request.email} automatically.
      </p>
      <div>
        <label className="label">Rejection reason (optional, internal only)</label>
        <textarea
          className="input min-h-[80px] resize-y"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Duplicate request, unable to verify business, etc."
        />
      </div>
      {mutation.isError && <p className="mt-3 text-sm text-danger">{(mutation.error as Error).message}</p>}
      <div className="mt-5 flex justify-end gap-3 border-t border-base-700/60 pt-4">
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-danger" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? 'Rejecting…' : 'Reject Request'}
        </button>
      </div>
    </Modal>
  )
}
