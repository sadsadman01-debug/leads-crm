import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, XCircle, Clock, History } from 'lucide-react'
import { withdrawalsApi } from '@/lib/api'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import type { WithdrawalStatus, BankAccountDetails, MfsDetails, CryptoDetails } from '@/types/affiliate'

const STATUS_TONE: Record<WithdrawalStatus, 'neutral' | 'accent' | 'success' | 'danger'> = {
  pending: 'neutral',
  processing: 'accent',
  approved: 'success',
  rejected: 'danger',
}

function FullPayoutDetails({ methodType, details }: { methodType: string; details: Record<string, any> }) {
  if (methodType === 'mfs') {
    const d = details as MfsDetails
    return (
      <div className="space-y-1 text-sm">
        <p><span className="text-base-500">Provider:</span> {d.provider}</p>
        <p><span className="text-base-500">Account/Phone Number:</span> <span className="font-mono">{d.account_number}</span></p>
        {d.account_holder_name && <p><span className="text-base-500">Account Holder Name:</span> {d.account_holder_name}</p>}
      </div>
    )
  }
  if (methodType === 'bank_account') {
    const d = details as BankAccountDetails
    return (
      <div className="space-y-1 text-sm">
        <p><span className="text-base-500">Account Holder Name:</span> {d.account_holder_name}</p>
        <p><span className="text-base-500">Bank Name:</span> {d.bank_name}</p>
        <p><span className="text-base-500">Branch Name:</span> {d.branch_name}</p>
        <p><span className="text-base-500">Account Number:</span> <span className="font-mono">{d.account_number}</span></p>
        <p><span className="text-base-500">Routing Number:</span> <span className="font-mono">{d.routing_number}</span></p>
      </div>
    )
  }
  const d = details as CryptoDetails
  return (
    <div className="space-y-1 text-sm">
      <p><span className="text-base-500">Network:</span> {d.network}</p>
      <p><span className="text-base-500">Wallet Address:</span> <span className="break-all font-mono text-xs">{d.wallet_address}</span></p>
    </div>
  )
}

export function WithdrawalDetailModal({ withdrawalId, onClose }: { withdrawalId: string | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const { data } = useQuery({
    queryKey: ['withdrawal-detail', withdrawalId],
    queryFn: () => withdrawalsApi.getDetail(withdrawalId!),
    enabled: Boolean(withdrawalId),
  })

  const [actualAmount, setActualAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [rejectionReason, setRejectionReason] = useState('')
  const [confirmingAction, setConfirmingAction] = useState<'approved' | 'rejected' | null>(null)

  useEffect(() => {
    if (data) setActualAmount(String(data.request.amount_usd))
  }, [data])

  const mutation = useMutation({
    mutationFn: (status: WithdrawalStatus) =>
      withdrawalsApi.updateStatus(withdrawalId!, {
        status,
        actual_amount_sent_usd: status === 'approved' ? Number(actualAmount) : undefined,
        notes: status === 'approved' ? notes.trim() || undefined : undefined,
        rejection_reason: status === 'rejected' ? rejectionReason.trim() || undefined : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['withdrawal-requests'] })
      queryClient.invalidateQueries({ queryKey: ['withdrawal-detail', withdrawalId] })
      setConfirmingAction(null)
    },
  })

  if (!withdrawalId || !data) return null
  const { request, affiliate, payout_method, status_log } = data

  return (
    <Modal open onClose={onClose} title="Withdrawal Request" size="lg">
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div className="rounded-lg bg-base-850 p-3">
            <p className="text-xs text-base-500">Affiliate</p>
            <p className="text-base-200">{affiliate?.full_name}</p>
          </div>
          <div className="rounded-lg bg-base-850 p-3">
            <p className="text-xs text-base-500">Email</p>
            <p className="truncate text-base-200">{affiliate?.email}</p>
          </div>
          <div className="rounded-lg bg-base-850 p-3">
            <p className="text-xs text-base-500">Amount Requested</p>
            <p className="text-base-100">${request.amount_usd}</p>
          </div>
          <div className="rounded-lg bg-base-850 p-3">
            <p className="text-xs text-base-500">Status</p>
            <Badge tone={STATUS_TONE[request.status]}>{request.status}</Badge>
          </div>
        </div>

        {payout_method && (
          <div className="rounded-lg border border-base-700/60 bg-base-850 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-base-400">
              Payout Method — {payout_method.label} (full details, for sending payment)
            </p>
            <FullPayoutDetails methodType={payout_method.method_type} details={payout_method.details} />
          </div>
        )}

        {(request.status === 'pending' || request.status === 'processing') && (
          <div className="flex flex-wrap gap-2 border-t border-base-700/60 pt-4">
            {request.status === 'pending' && (
              <button className="btn-secondary" disabled={mutation.isPending} onClick={() => mutation.mutate('processing')}>
                <Clock size={14} /> Mark Processing
              </button>
            )}
            <button className="btn-primary" onClick={() => setConfirmingAction('approved')}>
              <CheckCircle2 size={14} /> Approve
            </button>
            <button className="btn-danger" onClick={() => setConfirmingAction('rejected')}>
              <XCircle size={14} /> Reject
            </button>
          </div>
        )}

        {confirmingAction === 'approved' && (
          <div className="space-y-3 rounded-lg border border-success/30 bg-success-bg p-4">
            <div>
              <label className="label">Actual Amount Sent ($)</label>
              <input type="number" step={0.01} className="input" value={actualAmount} onChange={(e) => setActualAmount(e.target.value)} />
            </div>
            <div>
              <label className="label">Notes (optional — e.g. transaction reference)</label>
              <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setConfirmingAction(null)}>Cancel</button>
              <button className="btn-primary" disabled={mutation.isPending} onClick={() => mutation.mutate('approved')}>
                {mutation.isPending ? 'Saving…' : 'Confirm Approval'}
              </button>
            </div>
          </div>
        )}

        {confirmingAction === 'rejected' && (
          <div className="space-y-3 rounded-lg border border-danger/30 bg-danger-bg p-4">
            <div>
              <label className="label">Rejection Reason (optional)</label>
              <textarea className="input min-h-[70px] resize-y" value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} />
            </div>
            <p className="text-xs text-base-400">The reserved amount will be released back into the affiliate's available balance.</p>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setConfirmingAction(null)}>Cancel</button>
              <button className="btn-danger" disabled={mutation.isPending} onClick={() => mutation.mutate('rejected')}>
                {mutation.isPending ? 'Saving…' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        )}

        {request.rejection_reason && <p className="text-sm text-danger">Rejection reason: {request.rejection_reason}</p>}
        {request.notes && <p className="text-sm text-base-300">Notes: {request.notes}</p>}

        <div>
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-base-400">
            <History size={13} /> Activity Log
          </h3>
          <div className="space-y-1.5">
            {status_log.map((log) => (
              <div key={log.id} className="flex items-center justify-between rounded-md bg-base-850 px-3 py-2 text-xs">
                <span className="text-base-300">
                  {log.from_status ? `${log.from_status} → ${log.to_status}` : `Created (${log.to_status})`}
                  {log.changed_by_name && ` by ${log.changed_by_name}`}
                </span>
                <span className="text-base-500">{new Date(log.changed_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  )
}
