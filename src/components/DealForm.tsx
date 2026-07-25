import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { dealsApi, leadsApi, settingsApi, teamApi } from '@/lib/api'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useAuth, isAdminOrAbove } from '@/contexts/AuthContext'
import { CURRENCIES, currencyLabel } from '@/types/deal'
import type { Deal } from '@/types/deal'

interface DealFormState {
  lead_id: string
  company_name: string
  name: string
  value: string
  currency: string
  expected_close_date: string
  notes: string
  owner_id: string
}

const EMPTY: DealFormState = {
  lead_id: '',
  company_name: '',
  name: '',
  value: '',
  currency: 'USD',
  expected_close_date: '',
  notes: '',
  owner_id: '',
}

export function DealForm({
  open,
  onClose,
  leadId,
  leadCompanyName,
  deal,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  /** Pre-fills and locks the linked lead — pass when creating a deal from a lead's page. */
  leadId?: string
  leadCompanyName?: string
  /** Pass to edit an existing deal instead of creating one. */
  deal?: Deal
  onSaved?: (deal: Deal) => void
}) {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  const isEdit = Boolean(deal)
  const [form, setForm] = useState<DealFormState>(EMPTY)
  const [leadSearch, setLeadSearch] = useState('')
  const debouncedLeadSearch = useDebouncedValue(leadSearch, 300)

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get })
  const canReassign = isAdminOrAbove(profile?.role) || !isEdit || deal?.owner_id === profile?.id
  const { data: rosterData } = useQuery({ queryKey: ['team-roster'], queryFn: teamApi.roster, enabled: canReassign })
  const roster = rosterData?.members ?? []

  const { data: leadResults } = useQuery({
    queryKey: ['lead-search', debouncedLeadSearch],
    queryFn: () => leadsApi.list({ search: debouncedLeadSearch, pageSize: 8 }),
    enabled: open && !leadId && debouncedLeadSearch.length > 0,
  })

  useEffect(() => {
    if (!open) return
    if (deal) {
      setForm({
        lead_id: deal.lead_id,
        company_name: deal.lead?.company_name ?? '',
        name: deal.name,
        value: String(deal.value),
        currency: deal.currency,
        expected_close_date: deal.expected_close_date ?? '',
        notes: deal.notes ?? '',
        owner_id: deal.owner_id ?? '',
      })
    } else {
      setForm({
        ...EMPTY,
        lead_id: leadId ?? '',
        company_name: leadCompanyName ?? '',
        name: leadCompanyName ? `${leadCompanyName} - New Deal` : '',
        currency: settings?.default_currency ?? 'USD',
        owner_id: profile?.id ?? '',
      })
      setLeadSearch('')
    }
  }, [open, deal, leadId, leadCompanyName, settings?.default_currency, profile?.id])

  function set<K extends keyof DealFormState>(key: K, value: DealFormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      if (isEdit && deal) {
        return dealsApi.update(deal.id, {
          name: form.name.trim(),
          value: Number(form.value) || 0,
          currency: form.currency,
          expected_close_date: form.expected_close_date || null,
          notes: form.notes || null,
          owner_id: form.owner_id || null,
        })
      }
      return dealsApi.create({
        lead_id: form.lead_id,
        name: form.name.trim(),
        value: Number(form.value) || 0,
        currency: form.currency,
        expected_close_date: form.expected_close_date || undefined,
        notes: form.notes || undefined,
        owner_id: form.owner_id || undefined,
      })
    },
    onSuccess: (savedDeal) => {
      queryClient.invalidateQueries({ queryKey: ['deals'] })
      queryClient.invalidateQueries({ queryKey: ['deals-kanban'] })
      queryClient.invalidateQueries({ queryKey: ['lead-activities'] })
      queryClient.invalidateQueries({ queryKey: ['revenue-summary'] })
      onSaved?.(savedDeal)
      onClose()
    },
  })

  const canSave = form.name.trim().length > 0 && form.lead_id.length > 0

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Deal' : 'New Deal'}>
      <div className="space-y-4">
        {!leadId && !isEdit && (
          <div>
            <label className="label">Linked Lead / Company</label>
            {form.lead_id ? (
              <div className="flex items-center justify-between rounded-lg border border-base-600 bg-base-850 px-3 py-2 text-sm">
                <span className="text-base-100">{form.company_name}</span>
                <button
                  type="button"
                  className="text-xs text-accent-400 hover:underline"
                  onClick={() => set('lead_id', '')}
                >
                  Change
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base-400" />
                <input
                  className="input pl-9"
                  placeholder="Search leads by company name…"
                  value={leadSearch}
                  onChange={(e) => setLeadSearch(e.target.value)}
                />
                {leadResults && leadResults.leads.length > 0 && (
                  <div className="mt-1.5 max-h-40 overflow-y-auto rounded-lg border border-base-600 bg-base-850">
                    {leadResults.leads.map((l) => (
                      <button
                        key={l.id}
                        type="button"
                        className="block w-full px-3 py-2 text-left text-sm text-base-200 hover:bg-base-800"
                        onClick={() => {
                          set('lead_id', l.id)
                          set('company_name', l.company_name)
                          if (!form.name) set('name', `${l.company_name} - New Deal`)
                        }}
                      >
                        {l.company_name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div>
          <label className="label">Deal Name</label>
          <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Deal Value</label>
            <input
              type="number"
              min={0}
              step="0.01"
              className="input"
              value={form.value}
              onChange={(e) => set('value', e.target.value)}
            />
          </div>
          <div>
            <label className="label">Currency</label>
            <select className="input" value={form.currency} onChange={(e) => set('currency', e.target.value)}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>{currencyLabel(c)}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="label">Expected Close Date</label>
          <input
            type="date"
            className="input"
            value={form.expected_close_date}
            onChange={(e) => set('expected_close_date', e.target.value)}
          />
        </div>

        <div>
          <label className="label">Notes</label>
          <textarea
            className="input min-h-[80px] resize-y"
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
          />
        </div>

        {canReassign && (
          <div>
            <label className="label">Assigned To (Deal Owner)</label>
            <select className="input" value={form.owner_id} onChange={(e) => set('owner_id', e.target.value)}>
              {roster.map((m) => (
                <option key={m.id} value={m.id}>{m.nickname || m.email}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="mt-5 flex justify-end gap-3">
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={!canSave || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
          {saveMutation.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Deal'}
        </button>
      </div>
    </Modal>
  )
}
