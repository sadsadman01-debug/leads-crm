import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ShieldCheck } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Toggle } from '@/components/ui/Toggle'
import { teamApi } from '@/lib/api'
import { DEFAULT_USER_PERMISSIONS, PERMISSION_PRESETS, type TeamMember, type UserPermissions } from '@/types/team'

interface ToggleField {
  key: keyof UserPermissions
  label: string
  hint?: string
}

const DATA_ACCESS_TOGGLES: ToggleField[] = [
  { key: 'canEditAny', label: 'Can edit/update any Lead or Deal they can see', hint: 'If off, they can only edit records where they are the assigned owner or creator.' },
  { key: 'canDelete', label: 'Can delete Leads/Deals', hint: 'Only within whatever edit scope they already have — never grants deleting records they cannot edit.' },
  { key: 'canViewDealValues', label: 'Can view Deal monetary values', hint: 'If off, deal/revenue amounts show as "•••" everywhere this user sees deals.' },
]

const FEATURE_ACCESS_TOGGLES: ToggleField[] = [
  { key: 'canImport', label: 'Can import Leads via CSV/Google Sheets' },
  { key: 'canExport', label: 'Can export data (CSV/PDF)' },
  { key: 'canManageTemplates', label: 'Can manage Email/Message Templates' },
  { key: 'canManageCustomFields', label: 'Can manage Custom Fields' },
  { key: 'canManageStages', label: 'Can manage Pipeline Stages and Deal Stages' },
  { key: 'canManageIndustries', label: 'Can manage Industries' },
  { key: 'canViewTeamPerformance', label: 'Can view Team Performance Analytics' },
  { key: 'canAccessReportBuilder', label: 'Can access the Report Builder' },
]

export function PermissionsPanel({
  member,
  onClose,
  onSaved,
}: {
  member: TeamMember | null
  onClose: () => void
  onSaved?: () => void
}) {
  const queryClient = useQueryClient()
  const [perms, setPerms] = useState<UserPermissions>(member?.permissions ?? DEFAULT_USER_PERMISSIONS)
  const [preset, setPreset] = useState('')

  const saveMutation = useMutation({
    mutationFn: () => teamApi.updatePermissions(member!.id, perms),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] })
      onSaved?.()
      onClose()
    },
  })

  const resetMutation = useMutation({
    mutationFn: () => teamApi.resetPermissions(member!.id),
    onSuccess: () => {
      setPerms({ ...DEFAULT_USER_PERMISSIONS })
      setPreset('standard')
      queryClient.invalidateQueries({ queryKey: ['team-members'] })
      onSaved?.()
    },
  })

  if (!member) return null

  function set<K extends keyof UserPermissions>(key: K, value: UserPermissions[K]) {
    setPerms((p) => ({ ...p, [key]: value }))
    setPreset('')
  }

  function applyPreset(key: string) {
    setPreset(key)
    const found = PERMISSION_PRESETS.find((p) => p.key === key)
    if (found) setPerms({ ...found.values })
  }

  return (
    <Modal open={Boolean(member)} onClose={onClose} title={`Permissions — ${member.nickname || member.email}`} size="lg">
      <div className="space-y-6">
        <div>
          <label className="label">Quick Presets</label>
          <select className="input" value={preset} onChange={(e) => applyPreset(e.target.value)}>
            <option value="">Choose a preset to pre-fill (still editable below)…</option>
            {PERMISSION_PRESETS.map((p) => (
              <option key={p.key} value={p.key}>{p.label}</option>
            ))}
          </select>
        </div>

        <div>
          <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-base-300">Data Access</h3>
          <div className="space-y-3 rounded-lg border border-base-700/60 bg-base-850 p-4">
            <div>
              <p className="mb-1.5 text-sm text-base-200">Lead Visibility</p>
              <select
                className="input"
                value={perms.leadVisibility}
                onChange={(e) => set('leadVisibility', e.target.value as UserPermissions['leadVisibility'])}
              >
                <option value="all">Can view all Leads in the Organization</option>
                <option value="own">Can only view Leads assigned to or created by them</option>
              </select>
            </div>
            <div>
              <p className="mb-1.5 text-sm text-base-200">Deal Visibility</p>
              <select
                className="input"
                value={perms.dealVisibility}
                onChange={(e) => set('dealVisibility', e.target.value as UserPermissions['dealVisibility'])}
              >
                <option value="all">Can view all Deals in the Organization</option>
                <option value="own">Can only view Deals assigned to or created by them</option>
              </select>
            </div>
            {DATA_ACCESS_TOGGLES.map((f) => (
              <label key={f.key} className="flex items-start justify-between gap-4 pt-1">
                <span className="min-w-0">
                  <span className="block text-sm text-base-200">{f.label}</span>
                  {f.hint && <span className="block text-xs text-base-500">{f.hint}</span>}
                </span>
                <Toggle checked={Boolean(perms[f.key])} onChange={(v) => set(f.key, v as any)} />
              </label>
            ))}
          </div>
        </div>

        <div>
          <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-base-300">Feature Access</h3>
          <div className="space-y-3 rounded-lg border border-base-700/60 bg-base-850 p-4">
            {FEATURE_ACCESS_TOGGLES.map((f) => (
              <label key={f.key} className="flex items-center justify-between gap-4">
                <span className="text-sm text-base-200">{f.label}</span>
                <Toggle checked={Boolean(perms[f.key])} onChange={(v) => set(f.key, v as any)} />
              </label>
            ))}
          </div>
        </div>

        <p className="flex items-center gap-2 text-xs text-base-500">
          <ShieldCheck size={14} className="shrink-0" />
          Team Management (adding/removing/deactivating members, changing roles) always stays Admin/Super-Admin-only.
        </p>

        {saveMutation.isError && <p className="text-sm text-danger">{(saveMutation.error as Error).message}</p>}
      </div>

      <div className="mt-5 flex flex-wrap justify-between gap-3 border-t border-base-700/60 pt-4">
        <button className="btn-secondary" disabled={resetMutation.isPending} onClick={() => resetMutation.mutate()}>
          Reset to Standard Defaults
        </button>
        <div className="flex gap-3">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            {saveMutation.isPending ? 'Saving…' : 'Save Permissions'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
