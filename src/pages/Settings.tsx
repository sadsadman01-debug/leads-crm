import { AlertCircle } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { RoleBadge } from '@/components/ui/RoleBadge'
import { PipelineStagesSettings } from '@/components/PipelineStagesSettings'
import { FollowUpIntervalSettings } from '@/components/FollowUpIntervalSettings'
import { IndustriesSettings } from '@/components/IndustriesSettings'
import { TemplatesSettings } from '@/components/TemplatesSettings'
import { DealStagesSettings } from '@/components/DealStagesSettings'
import { WinLossReasonsSettings } from '@/components/WinLossReasonsSettings'
import { DefaultCurrencySettings } from '@/components/DefaultCurrencySettings'

export function Settings() {
  const { session, profile } = useAuth()
  const readOnly = profile?.role === 'user'

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-base-100">Settings</h1>

      <div className="card p-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-base-300">Account</h2>
        <p className="text-sm text-base-200">{session?.user.email}</p>
        {profile && <div className="mt-1"><RoleBadge role={profile.role} /></div>}
      </div>

      {readOnly && (
        <div className="flex items-center gap-2.5 rounded-lg bg-warn-bg px-4 py-3 text-sm text-warn">
          <AlertCircle size={16} className="shrink-0" />
          View only — contact your admin to change this.
        </div>
      )}

      <fieldset disabled={readOnly} className={readOnly ? 'space-y-6 opacity-60' : 'space-y-6'}>
        <PipelineStagesSettings />
        <FollowUpIntervalSettings />
        <IndustriesSettings />
        <TemplatesSettings />
        <DealStagesSettings />
        <WinLossReasonsSettings />
        <DefaultCurrencySettings />
      </fieldset>
    </div>
  )
}
