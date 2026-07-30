import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { affiliateApplicationsApi } from '@/lib/api'
import { Modal } from '@/components/ui/Modal'
import { TempPasswordResult } from '@/components/TempPasswordResult'
import type { AffiliateApplication, ApproveAffiliateApplicationResult } from '@/types/affiliate'

function draftWelcomeMessage(result: ApproveAffiliateApplicationResult): string {
  const loginUrl = `${window.location.origin}/login`
  return `Hi ${result.admin.nickname},

Welcome to our Affiliate Program! Your account is now set up.

Here are your login details:
Login URL: ${loginUrl}
Email: ${result.admin.email}
Temporary Password: ${result.admin.temporary_password}

You'll be asked to set a new password the first time you log in. Once in, you'll find your unique referral link on your Affiliate Dashboard.

Your referral code: ${result.affiliate.referral_code}

Best,
The Team`
}

export function ApproveAffiliateFlow({ application, onClose }: { application: AffiliateApplication | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [result, setResult] = useState<ApproveAffiliateApplicationResult | null>(null)
  const [draft, setDraft] = useState('')

  useEffect(() => {
    if (application) {
      setResult(null)
      setDraft('')
    }
  }, [application])

  const mutation = useMutation({
    mutationFn: () => affiliateApplicationsApi.approve(application!.id),
    onSuccess: (data) => {
      setResult(data)
      setDraft(draftWelcomeMessage(data))
      queryClient.invalidateQueries({ queryKey: ['affiliate-applications'] })
    },
  })

  function handleClose() {
    onClose()
  }

  if (!application) return null

  if (result) {
    return (
      <Modal open onClose={handleClose} title="Affiliate account created" size="lg">
        <p className="mb-3 text-xs text-base-400">
          Referral code: <span className="font-mono text-base-200">{result.affiliate.referral_code}</span>
        </p>
        <TempPasswordResult email={result.admin.email} temporaryPassword={result.admin.temporary_password} draft={draft} onDraftChange={setDraft} />
        <div className="mt-5 flex justify-end border-t border-base-700/60 pt-4">
          <button className="btn-primary" onClick={handleClose}>Done</button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal open onClose={handleClose} title={`Approve ${application.full_name}?`}>
      <div className="space-y-3 text-sm text-base-300">
        <p>This will:</p>
        <ul className="list-inside list-disc space-y-1 text-base-400">
          <li>Create an Affiliate account for <strong className="text-base-200">{application.email}</strong></li>
          <li>Generate a secure temporary password (shown once, next screen)</li>
          <li>Generate a unique referral code and link</li>
          <li>Require them to set a new password on first login</li>
        </ul>
        <div className="rounded-lg border border-base-700/60 bg-base-850 p-3 text-xs text-base-400">
          <p><span className="text-base-500">Promotion plan:</span> {application.how_they_plan_to_promote || '—'}</p>
        </div>
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
