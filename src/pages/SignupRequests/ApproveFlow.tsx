import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CircleDollarSign } from 'lucide-react'
import { signupRequestsApi } from '@/lib/api'
import { Modal } from '@/components/ui/Modal'
import { TempPasswordResult } from '@/components/TempPasswordResult'
import { PRICING_TIER_LABELS, amountForCycle } from '@/types/billing'
import type { ApproveSignupRequestResult, SignupRequest } from '@/types/signupRequest'

function draftWelcomeMessage(result: ApproveSignupRequestResult): string {
  const loginUrl = `${window.location.origin}/login`
  return `Hi ${result.admin.nickname},

Welcome to Leadify! Your organization "${result.organization.name}" is now set up.

Here are your login details:
Login URL: ${loginUrl}
Email: ${result.admin.email}
Temporary Password: ${result.admin.temporary_password}

You'll be asked to set a new password the first time you log in.

Best,
The Team`
}

export function ApproveFlow({ request, onClose }: { request: SignupRequest | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [result, setResult] = useState<ApproveSignupRequestResult | null>(null)
  const [draft, setDraft] = useState('')

  useEffect(() => {
    if (request) {
      setResult(null)
      setDraft('')
    }
  }, [request])

  const mutation = useMutation({
    mutationFn: () => signupRequestsApi.approve(request!.id),
    onSuccess: (data) => {
      setResult(data)
      setDraft(draftWelcomeMessage(data))
      queryClient.invalidateQueries({ queryKey: ['signup-requests'] })
    },
  })

  function handleClose() {
    onClose()
  }

  if (!request) return null

  if (result) {
    return (
      <Modal open onClose={handleClose} title="Account created" size="lg">
        {result.organization.pricing_tier && (
          <p className="mb-3 text-xs text-base-400">
            Billing: {amountForCycle(result.organization.billing_cycle, result.organization.monthly_price_usd, result.organization.annual_total_usd)} (
            {PRICING_TIER_LABELS[result.organization.pricing_tier]}) — subscription ends{' '}
            {result.organization.subscription_end_date ? new Date(result.organization.subscription_end_date).toLocaleDateString() : '—'}.
          </p>
        )}
        <TempPasswordResult
          email={result.admin.email}
          temporaryPassword={result.admin.temporary_password}
          draft={draft}
          onDraftChange={setDraft}
        />
        <div className="mt-5 flex justify-end border-t border-base-700/60 pt-4">
          <button className="btn-primary" onClick={handleClose}>Done</button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal open onClose={handleClose} title={`Approve ${request.organization_name}?`}>
      <div className="space-y-3 text-sm text-base-300">
        <p>This will:</p>
        <ul className="list-inside list-disc space-y-1 text-base-400">
          <li>Create a new organization named <strong className="text-base-200">{request.organization_name}</strong></li>
          <li>Create an Admin account for <strong className="text-base-200">{request.email}</strong> ({request.contact_name})</li>
          <li>Generate a secure temporary password (shown once, next screen)</li>
          <li>Require them to set a new password on first login</li>
        </ul>
        <div className="rounded-lg border border-base-700/60 bg-base-850 p-3 text-xs text-base-400">
          <p><span className="text-base-500">Phone:</span> {request.phone || '—'}</p>
          <p className="mt-1"><span className="text-base-500">Message:</span> {request.message || '—'}</p>
          <p className="mt-1">
            <span className="text-base-500">Address:</span> {request.city}, {request.country} {request.zip_code}
          </p>
        </div>

        {request.pricing_tier && (
          <div
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm ${
              request.payment_status === 'pending' ? 'bg-warn-bg text-warn' : 'bg-success-bg text-success'
            }`}
          >
            <CircleDollarSign size={16} className="shrink-0" />
            <p>
              <strong>{amountForCycle(request.billing_cycle, request.monthly_price_usd, request.annual_total_usd)}</strong> (
              {PRICING_TIER_LABELS[request.pricing_tier]}, {request.billing_cycle === 'annual' ? 'annual' : 'monthly'}) — Payment status:{' '}
              <strong className="capitalize">{request.payment_status}</strong>
              {request.payment_status === 'pending' && ' — approving now will not change this.'}
            </p>
          </div>
        )}
      </div>

      {mutation.isError && (
        <div className="mt-3 flex items-center gap-2 text-sm text-danger">
          <AlertTriangle size={15} className="shrink-0" />
          {(mutation.error as Error).message}
        </div>
      )}

      <div className="mt-5 flex justify-end gap-3 border-t border-base-700/60 pt-4">
        <button className="btn-secondary" onClick={handleClose}>Cancel</button>
        <button className="btn-primary" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? 'Creating…' : 'Approve & Create Account'}
        </button>
      </div>
    </Modal>
  )
}
