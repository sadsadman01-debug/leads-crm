import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Smartphone, Landmark, Bitcoin, Wallet, ChevronUp, ChevronDown } from 'lucide-react'
import { paymentAccountsApi } from '@/lib/api'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { maskPayoutDetails, MFS_PROVIDERS, CRYPTO_NETWORKS } from '@/types/affiliate'
import type { ReceivingPaymentAccount, PaymentAccountMethodType } from '@/types/paymentAccount'

const METHOD_ICON: Record<PaymentAccountMethodType, typeof Smartphone> = {
  mfs: Smartphone,
  bank_account: Landmark,
  crypto: Bitcoin,
}

export function PaymentAccountsSettings() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['payment-accounts'], queryFn: paymentAccountsApi.list })
  const accounts = data?.accounts ?? []

  const [adding, setAdding] = useState<PaymentAccountMethodType | null>(null)
  const [editing, setEditing] = useState<ReceivingPaymentAccount | null>(null)
  const [deleting, setDeleting] = useState<ReceivingPaymentAccount | null>(null)

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['payment-accounts'] })
  }

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) => paymentAccountsApi.update(id, { is_active }),
    onSuccess: invalidate,
  })

  const reorderMutation = useMutation({
    mutationFn: (orderedIds: string[]) => paymentAccountsApi.reorder(orderedIds),
    onSuccess: invalidate,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => paymentAccountsApi.remove(id),
    onSuccess: () => {
      invalidate()
      setDeleting(null)
    },
  })

  function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= accounts.length) return
    const reordered = [...accounts]
    const [moved] = reordered.splice(index, 1)
    reordered.splice(target, 0, moved)
    reorderMutation.mutate(reordered.map((a) => a.id))
  }

  return (
    <div className="card p-6">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-base-300">Payment Accounts</h2>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={() => setAdding('mfs')}>
            <Plus size={14} /> Add MFS
          </button>
          <button className="btn-secondary" onClick={() => setAdding('bank_account')}>
            <Plus size={14} /> Add Bank Account
          </button>
          <button className="btn-secondary" onClick={() => setAdding('crypto')}>
            <Plus size={14} /> Add Crypto Wallet
          </button>
        </div>
      </div>
      <p className="mb-5 text-xs text-base-400">
        The accounts you personally receive customer payments into — shown on the public payment instructions page
        (<code className="text-base-300">/pay</code>) so requesters know where to send money. Distinct from Affiliate
        Payout Methods, which pay affiliates out.
      </p>

      {isLoading ? (
        <p className="text-sm text-base-400">Loading…</p>
      ) : accounts.length === 0 ? (
        <div className="flex flex-col items-center gap-3 p-12 text-center">
          <Wallet size={32} className="text-base-500" />
          <p className="text-base-300">No payment accounts configured yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map((a, index) => {
            const Icon = METHOD_ICON[a.method_type]
            return (
              <div key={a.id} className="flex items-center gap-3 rounded-lg border border-base-700/60 bg-base-850 p-4">
                <div className="flex flex-col">
                  <button
                    className="text-base-500 hover:text-base-200 disabled:opacity-30"
                    disabled={index === 0 || reorderMutation.isPending}
                    onClick={() => move(index, -1)}
                  >
                    <ChevronUp size={15} />
                  </button>
                  <button
                    className="text-base-500 hover:text-base-200 disabled:opacity-30"
                    disabled={index === accounts.length - 1 || reorderMutation.isPending}
                    onClick={() => move(index, 1)}
                  >
                    <ChevronDown size={15} />
                  </button>
                </div>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-500/15 text-accent-400">
                  <Icon size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-base-100">{a.label}</p>
                  <p className="truncate text-xs text-base-400">{maskPayoutDetails(a.method_type, a.details)}</p>
                </div>
                <button onClick={() => toggleActiveMutation.mutate({ id: a.id, is_active: !a.is_active })} disabled={toggleActiveMutation.isPending}>
                  <Badge tone={a.is_active ? 'success' : 'neutral'}>{a.is_active ? 'Active' : 'Inactive'}</Badge>
                </button>
                <div className="flex shrink-0 gap-1">
                  <button className="btn-ghost px-2 text-xs" onClick={() => setEditing(a)}>
                    <Pencil size={13} />
                  </button>
                  <button className="btn-ghost px-2 text-xs text-danger" onClick={() => setDeleting(a)}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {adding && <PaymentAccountFormModal methodType={adding} onClose={() => setAdding(null)} onSaved={invalidate} />}
      {editing && (
        <PaymentAccountFormModal methodType={editing.method_type} existing={editing} onClose={() => setEditing(null)} onSaved={invalidate} />
      )}

      <Modal open={Boolean(deleting)} onClose={() => setDeleting(null)} title={`Delete "${deleting?.label}"?`}>
        <p className="mb-4 text-sm text-base-300">
          This payment account will be permanently removed and will stop appearing on the public payment page.
        </p>
        <div className="flex justify-end gap-3">
          <button className="btn-secondary" onClick={() => setDeleting(null)}>Cancel</button>
          <button className="btn-danger" disabled={deleteMutation.isPending} onClick={() => deleting && deleteMutation.mutate(deleting.id)}>
            {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </Modal>
    </div>
  )
}

function PaymentAccountFormModal({
  methodType,
  existing,
  onClose,
  onSaved,
}: {
  methodType: PaymentAccountMethodType
  existing?: ReceivingPaymentAccount
  onClose: () => void
  onSaved: () => void
}) {
  const [label, setLabel] = useState(existing?.label ?? '')

  // MFS fields
  const [provider, setProvider] = useState(existing?.details.provider ?? MFS_PROVIDERS[0])
  const [providerOther, setProviderOther] = useState('')
  const [accountNumber, setAccountNumber] = useState(existing?.details.account_number ?? '')
  const [accountHolderName, setAccountHolderName] = useState(existing?.details.account_holder_name ?? '')

  // Bank fields
  const [bankAccountHolder, setBankAccountHolder] = useState(existing?.details.account_holder_name ?? '')
  const [bankName, setBankName] = useState(existing?.details.bank_name ?? '')
  const [branchName, setBranchName] = useState(existing?.details.branch_name ?? '')
  const [bankAccountNumber, setBankAccountNumber] = useState(existing?.details.account_number ?? '')
  const [routingNumber, setRoutingNumber] = useState(existing?.details.routing_number ?? '')

  // Crypto fields
  const [network, setNetwork] = useState(existing?.details.network ?? CRYPTO_NETWORKS[0])
  const [networkOther, setNetworkOther] = useState('')
  const [walletAddress, setWalletAddress] = useState(existing?.details.wallet_address ?? '')

  function buildDetails(): Record<string, any> {
    if (methodType === 'mfs') {
      return {
        provider: provider === 'Other' ? providerOther.trim() || 'Other' : provider,
        account_number: accountNumber.trim(),
        account_holder_name: accountHolderName.trim() || null,
      }
    }
    if (methodType === 'bank_account') {
      return {
        account_holder_name: bankAccountHolder.trim(),
        bank_name: bankName.trim(),
        branch_name: branchName.trim(),
        account_number: bankAccountNumber.trim(),
        routing_number: routingNumber.trim(),
      }
    }
    return {
      network: network === 'Other' ? networkOther.trim() || 'Other' : network,
      wallet_address: walletAddress.trim(),
    }
  }

  const mutation = useMutation({
    mutationFn: () => {
      const payload = { label: label.trim(), details: buildDetails() }
      return existing ? paymentAccountsApi.update(existing.id, payload) : paymentAccountsApi.create({ method_type: methodType, ...payload })
    },
    onSuccess: () => {
      onSaved()
      onClose()
    },
  })

  const title =
    methodType === 'mfs'
      ? existing ? 'Edit MFS Account' : 'Add Mobile Financial Service'
      : methodType === 'bank_account'
        ? existing ? 'Edit Bank Account' : 'Add Bank Account'
        : existing ? 'Edit Crypto Wallet' : 'Add Cryptocurrency Wallet'

  return (
    <Modal open onClose={onClose} title={title}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          mutation.mutate()
        }}
        className="space-y-4"
      >
        <div>
          <label className="label">Label</label>
          <input required className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Main bKash" />
        </div>

        {methodType === 'mfs' && (
          <>
            <div>
              <label className="label">Provider</label>
              <select className="input" value={provider} onChange={(e) => setProvider(e.target.value)}>
                {MFS_PROVIDERS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              {provider === 'Other' && (
                <input className="input mt-2" value={providerOther} onChange={(e) => setProviderOther(e.target.value)} placeholder="Provider name" />
              )}
            </div>
            <div>
              <label className="label">Account/Phone Number</label>
              <input required className="input" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="01XXXXXXXXX" />
            </div>
            <div>
              <label className="label">Account Holder Name (optional)</label>
              <input className="input" value={accountHolderName} onChange={(e) => setAccountHolderName(e.target.value)} />
            </div>
          </>
        )}

        {methodType === 'bank_account' && (
          <>
            <div>
              <label className="label">Account Holder Name</label>
              <input required className="input" value={bankAccountHolder} onChange={(e) => setBankAccountHolder(e.target.value)} />
            </div>
            <div>
              <label className="label">Bank Name</label>
              <input required className="input" value={bankName} onChange={(e) => setBankName(e.target.value)} />
            </div>
            <div>
              <label className="label">Branch Name</label>
              <input required className="input" value={branchName} onChange={(e) => setBranchName(e.target.value)} />
            </div>
            <div>
              <label className="label">Account Number (max 17 digits)</label>
              <input
                required
                inputMode="numeric"
                maxLength={17}
                className="input"
                value={bankAccountNumber}
                onChange={(e) => setBankAccountNumber(e.target.value.replace(/\D/g, ''))}
              />
            </div>
            <div>
              <label className="label">Routing Number (9 digits)</label>
              <input
                required
                inputMode="numeric"
                maxLength={9}
                className="input"
                value={routingNumber}
                onChange={(e) => setRoutingNumber(e.target.value.replace(/\D/g, ''))}
              />
            </div>
          </>
        )}

        {methodType === 'crypto' && (
          <>
            <div>
              <label className="label">Cryptocurrency/Network</label>
              <select className="input" value={network} onChange={(e) => setNetwork(e.target.value)}>
                {CRYPTO_NETWORKS.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              {network === 'Other' && (
                <input className="input mt-2" value={networkOther} onChange={(e) => setNetworkOther(e.target.value)} placeholder="Network name" />
              )}
              <p className="mt-1 text-xs text-warn">Double-check the network — payers sending on the wrong network can lose funds.</p>
            </div>
            <div>
              <label className="label">Wallet Address</label>
              <input required className="input font-mono text-xs" value={walletAddress} onChange={(e) => setWalletAddress(e.target.value)} />
            </div>
          </>
        )}

        {mutation.isError && <p className="text-sm text-danger">{(mutation.error as Error).message}</p>}

        <div className="flex justify-end gap-3 border-t border-base-700/60 pt-4">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
