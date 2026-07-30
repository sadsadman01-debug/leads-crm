import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Star, Smartphone, Landmark, Bitcoin, CreditCard } from 'lucide-react'
import { payoutMethodsApi } from '@/lib/api'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import {
  maskPayoutDetails,
  MFS_PROVIDERS,
  CRYPTO_NETWORKS,
  type PayoutMethod,
  type PayoutMethodType,
} from '@/types/affiliate'

const METHOD_ICON: Record<PayoutMethodType, typeof Smartphone> = {
  mfs: Smartphone,
  bank_account: Landmark,
  crypto: Bitcoin,
}

export function PayoutMethodsTab() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['my-payout-methods'], queryFn: payoutMethodsApi.list })
  const methods = data?.methods ?? []

  const [adding, setAdding] = useState<PayoutMethodType | null>(null)
  const [editing, setEditing] = useState<PayoutMethod | null>(null)
  const [deleting, setDeleting] = useState<PayoutMethod | null>(null)

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['my-payout-methods'] })
  }

  const setDefaultMutation = useMutation({
    mutationFn: (id: string) => payoutMethodsApi.update(id, { is_default: true }),
    onSuccess: invalidate,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => payoutMethodsApi.remove(id),
    onSuccess: () => {
      invalidate()
      setDeleting(null)
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-base-300">Payout Methods</h2>
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

      {isLoading ? (
        <p className="text-sm text-base-400">Loading…</p>
      ) : methods.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 p-16 text-center">
          <CreditCard size={32} className="text-base-500" />
          <p className="text-base-300">No payout methods saved yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {methods.map((m) => {
            const Icon = METHOD_ICON[m.method_type]
            return (
              <div key={m.id} className="card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-500/15 text-accent-400">
                      <Icon size={16} />
                    </span>
                    <div>
                      <p className="text-sm font-medium text-base-100">{m.label}</p>
                      <p className="text-xs text-base-400">{maskPayoutDetails(m.method_type, m.details)}</p>
                    </div>
                  </div>
                  {m.is_default && <Badge tone="success">Default</Badge>}
                </div>
                <div className="mt-3 flex items-center gap-2 border-t border-base-700/60 pt-3">
                  {!m.is_default && (
                    <button className="btn-ghost px-2 text-xs" disabled={setDefaultMutation.isPending} onClick={() => setDefaultMutation.mutate(m.id)}>
                      <Star size={13} /> Set Default
                    </button>
                  )}
                  <button className="btn-ghost px-2 text-xs" onClick={() => setEditing(m)}>
                    <Pencil size={13} /> Edit
                  </button>
                  <button className="btn-ghost px-2 text-xs text-danger" onClick={() => setDeleting(m)}>
                    <Trash2 size={13} /> Delete
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {adding && <PayoutMethodFormModal methodType={adding} onClose={() => setAdding(null)} onSaved={invalidate} />}
      {editing && (
        <PayoutMethodFormModal methodType={editing.method_type} existing={editing} onClose={() => setEditing(null)} onSaved={invalidate} />
      )}

      <Modal open={Boolean(deleting)} onClose={() => setDeleting(null)} title={`Delete "${deleting?.label}"?`}>
        <p className="mb-4 text-sm text-base-300">This payout method will be permanently removed.</p>
        <div className="flex justify-end gap-3">
          <button className="btn-secondary" onClick={() => setDeleting(null)}>
            Cancel
          </button>
          <button className="btn-danger" disabled={deleteMutation.isPending} onClick={() => deleting && deleteMutation.mutate(deleting.id)}>
            {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </Modal>
    </div>
  )
}

function PayoutMethodFormModal({
  methodType,
  existing,
  onClose,
  onSaved,
}: {
  methodType: PayoutMethodType
  existing?: PayoutMethod
  onClose: () => void
  onSaved: () => void
}) {
  const [label, setLabel] = useState(existing?.label ?? '')
  const [isDefault, setIsDefault] = useState(existing?.is_default ?? false)

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
      const payload = { label: label.trim(), details: buildDetails(), is_default: isDefault }
      return existing ? payoutMethodsApi.update(existing.id, payload) : payoutMethodsApi.create({ method_type: methodType, ...payload })
    },
    onSuccess: () => {
      onSaved()
      onClose()
    },
  })

  const title =
    methodType === 'mfs'
      ? existing ? 'Edit MFS Method' : 'Add Mobile Financial Service'
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
          <input required className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. My bKash" />
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
              <label className="label">Account Holder Name (recommended for verification)</label>
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
              <p className="mt-1 text-xs text-warn">Double-check the network — sending to the wrong network can lose funds.</p>
            </div>
            <div>
              <label className="label">Wallet Address</label>
              <input required className="input font-mono text-xs" value={walletAddress} onChange={(e) => setWalletAddress(e.target.value)} />
            </div>
          </>
        )}

        <label className="flex items-center gap-2 text-sm text-base-300">
          <input type="checkbox" className="h-4 w-4 rounded border-base-600 bg-base-800" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
          Set as default
        </label>

        {mutation.isError && <p className="text-sm text-danger">{(mutation.error as Error).message}</p>}

        <div className="flex justify-end gap-3 border-t border-base-700/60 pt-4">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
