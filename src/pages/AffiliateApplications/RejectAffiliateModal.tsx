import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { affiliateApplicationsApi } from '@/lib/api'
import { Modal } from '@/components/ui/Modal'
import type { AffiliateApplication } from '@/types/affiliate'

export function RejectAffiliateModal({ application, onClose }: { application: AffiliateApplication | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (application) setReason('')
  }, [application])

  const mutation = useMutation({
    mutationFn: () => affiliateApplicationsApi.reject(application!.id, reason.trim() || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['affiliate-applications'] })
      onClose()
    },
  })

  if (!application) return null

  return (
    <Modal open={Boolean(application)} onClose={onClose} title={`Reject application from ${application.full_name}?`}>
      <p className="mb-4 text-sm text-base-300">
        No account will be created. This is for your own record-keeping only — nothing is sent to {application.email} automatically.
      </p>
      <div>
        <label className="label">Rejection reason (optional, internal only)</label>
        <textarea
          className="input min-h-[80px] resize-y"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Unclear promotion plan, spam, etc."
        />
      </div>
      {mutation.isError && <p className="mt-3 text-sm text-danger">{(mutation.error as Error).message}</p>}
      <div className="mt-5 flex justify-end gap-3 border-t border-base-700/60 pt-4">
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-danger" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? 'Rejecting…' : 'Reject Application'}
        </button>
      </div>
    </Modal>
  )
}
