import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Tag, Plus, Pencil, Trash2, AlertTriangle } from 'lucide-react'
import { promoCodesApi } from '@/lib/api'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { formatPromoDiscount, getPromoCodeAutoStatus, type PromoCode, type PromoCodeDiscountType } from '@/types/promoCode'

export function PromoCodesPage() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['promo-codes'], queryFn: promoCodesApi.list })
  const promoCodes = data?.promo_codes ?? []

  const [editing, setEditing] = useState<PromoCode | 'new' | null>(null)
  const [deleting, setDeleting] = useState<PromoCode | null>(null)

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) => promoCodesApi.update(id, { is_active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['promo-codes'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => promoCodesApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['promo-codes'] })
      setDeleting(null)
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-base-100">Promo Codes</h1>
          <p className="mt-1 text-sm text-base-400">Configure discount codes applicable at signup.</p>
        </div>
        <button className="btn-primary" onClick={() => setEditing('new')}>
          <Plus size={16} />
          New Promo Code
        </button>
      </div>

      {isLoading ? (
        <div className="card p-12 text-center text-base-400">Loading…</div>
      ) : promoCodes.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 p-16 text-center">
          <Tag size={32} className="text-base-500" />
          <p className="text-base-300">No promo codes yet.</p>
        </div>
      ) : (
        <div className="card overflow-x-auto p-6">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-base-700/60 text-xs uppercase tracking-wide text-base-400">
                <th className="py-2 pr-3 font-medium">Code</th>
                <th className="px-3 py-2 font-medium">Discount</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Times Used</th>
                <th className="px-3 py-2 font-medium">Max Uses</th>
                <th className="px-3 py-2 font-medium">Expiry Date</th>
                <th className="px-3 py-2 font-medium">Created</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {promoCodes.map((pc) => {
                const autoStatus = getPromoCodeAutoStatus(pc)
                return (
                  <tr key={pc.id} className="border-b border-base-800">
                    <td className="py-3 pr-3 font-mono font-medium text-base-100">{pc.code}</td>
                    <td className="px-3 py-3 text-base-300">{formatPromoDiscount(pc.discount_type, pc.discount_value)}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col items-start gap-1">
                        <button
                          onClick={() => toggleActiveMutation.mutate({ id: pc.id, is_active: !pc.is_active })}
                          disabled={toggleActiveMutation.isPending}
                        >
                          <Badge tone={pc.is_active ? 'success' : 'neutral'}>{pc.is_active ? 'Active' : 'Inactive'}</Badge>
                        </button>
                        {pc.is_active && autoStatus === 'limit_reached' && <Badge tone="warn">Limit Reached</Badge>}
                        {pc.is_active && autoStatus === 'expired' && <Badge tone="warn">Expired</Badge>}
                      </div>
                    </td>
                    <td className="px-3 py-3 tabular-nums text-base-300">{pc.times_used}</td>
                    <td className="px-3 py-3 tabular-nums text-base-300">{pc.max_uses ?? <span className="text-base-500">Unlimited</span>}</td>
                    <td className="px-3 py-3 text-base-300">
                      {pc.expires_at ? new Date(pc.expires_at).toLocaleDateString() : <span className="text-base-500">No expiry</span>}
                    </td>
                    <td className="px-3 py-3 text-base-400">{new Date(pc.created_at).toLocaleDateString()}</td>
                    <td className="px-3 py-3">
                      <div className="flex gap-2">
                        <button className="btn-ghost px-2" onClick={() => setEditing(pc)}>
                          <Pencil size={14} />
                        </button>
                        <button className="btn-ghost px-2 text-danger" onClick={() => setDeleting(pc)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && <PromoCodeFormModal promoCode={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}

      {deleting && (
        <Modal open onClose={() => setDeleting(null)} title={`Delete promo code "${deleting.code}"?`}>
          <div className="space-y-3 text-sm text-base-300">
            {deleting.times_used > 0 && (
              <div className="flex items-center gap-2.5 rounded-lg bg-warn-bg px-3 py-2.5 text-sm text-warn">
                <AlertTriangle size={16} className="shrink-0" />
                This code has already been used {deleting.times_used} time{deleting.times_used === 1 ? '' : 's'}. Deleting it won't
                change those historical discounts — it will only stop it from being used for new signups.
              </div>
            )}
            <p>Are you sure you want to delete this promo code?</p>
          </div>
          {deleteMutation.isError && <p className="mt-2 text-sm text-danger">{(deleteMutation.error as Error).message}</p>}
          <div className="mt-5 flex justify-end gap-3 border-t border-base-700/60 pt-4">
            <button className="btn-secondary" onClick={() => setDeleting(null)}>Cancel</button>
            <button className="btn-danger" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate(deleting.id)}>
              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function PromoCodeFormModal({ promoCode, onClose }: { promoCode: PromoCode | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const isEdit = Boolean(promoCode)
  const [code, setCode] = useState(promoCode?.code ?? '')
  const [discountType, setDiscountType] = useState<PromoCodeDiscountType>(promoCode?.discount_type ?? 'flat')
  const [discountValue, setDiscountValue] = useState(promoCode ? String(promoCode.discount_value) : '')
  const [maxUses, setMaxUses] = useState(promoCode?.max_uses != null ? String(promoCode.max_uses) : '')
  const [expiresAt, setExpiresAt] = useState(promoCode?.expires_at ? promoCode.expires_at.slice(0, 10) : '')

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        discount_type: discountType,
        discount_value: Number(discountValue),
        max_uses: maxUses.trim() ? Number(maxUses) : null,
        expires_at: expiresAt || null,
      }
      return isEdit
        ? promoCodesApi.update(promoCode!.id, payload)
        : promoCodesApi.create({ code: code.trim().toUpperCase(), ...payload })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['promo-codes'] })
      onClose()
    },
  })

  return (
    <Modal open onClose={onClose} title={isEdit ? `Edit "${promoCode!.code}"` : 'New Promo Code'}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          mutation.mutate()
        }}
        className="space-y-4"
      >
        <div>
          <label className="label" htmlFor="promo-code-input">Code</label>
          <input
            id="promo-code-input"
            required
            disabled={isEdit}
            className="input font-mono uppercase"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="WELCOME15"
          />
        </div>

        <div>
          <label className="label">Discount Type</label>
          <div className="flex gap-2">
            {(['flat', 'percent'] as PromoCodeDiscountType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setDiscountType(t)}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  discountType === t ? 'border-accent-500 bg-accent-500/15 text-accent-400' : 'border-base-700/60 text-base-300 hover:bg-base-800'
                }`}
              >
                {t === 'flat' ? 'Flat (৳)' : 'Percentage (%)'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label" htmlFor="discount-value">
            {discountType === 'percent' ? 'Discount Percentage' : 'Discount Amount (৳)'}
          </label>
          <input
            id="discount-value"
            type="number"
            min={0}
            max={discountType === 'percent' ? 100 : undefined}
            step={discountType === 'percent' ? 1 : 0.01}
            required
            className="input"
            value={discountValue}
            onChange={(e) => setDiscountValue(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 border-t border-base-700/60 pt-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="max-uses">Maximum Uses</label>
            <input
              id="max-uses"
              type="number"
              min={1}
              step={1}
              className="input"
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
              placeholder="Unlimited"
            />
          </div>
          <div>
            <label className="label" htmlFor="expires-at">Expiry Date</label>
            <input
              id="expires-at"
              type="date"
              className="input"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>
        </div>
        <p className="text-xs text-base-500">Leave either field blank for no limit. If both are set, the code stops working as soon as either is reached.</p>

        {mutation.isError && <p className="text-sm text-danger">{(mutation.error as Error).message}</p>}

        <div className="flex justify-end gap-3 border-t border-base-700/60 pt-4">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
