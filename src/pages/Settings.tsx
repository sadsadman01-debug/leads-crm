import { type ReactNode } from 'react'
import { AlertCircle } from 'lucide-react'
import { useAuth, hasPermission } from '@/contexts/AuthContext'
import { useOrg } from '@/contexts/OrgContext'
import { RoleBadge } from '@/components/ui/RoleBadge'
import { PipelineStagesSettings } from '@/components/PipelineStagesSettings'
import { OutreachSequencesSettings } from '@/components/OutreachSequencesSettings'
import { IndustriesSettings } from '@/components/IndustriesSettings'
import { TemplatesSettings } from '@/components/TemplatesSettings'
import { DealStagesSettings } from '@/components/DealStagesSettings'
import { WinLossReasonsSettings } from '@/components/WinLossReasonsSettings'
import { DefaultCurrencySettings } from '@/components/DefaultCurrencySettings'
import { CustomFieldsSettings } from '@/components/CustomFieldsSettings'
import { QuotaSettings } from '@/components/QuotaSettings'
import { BrandingSettings } from '@/components/BrandingSettings'
import { PlatformBrandingSettings } from '@/components/PlatformBrandingSettings'
import { BillingSettings } from '@/components/BillingSettings'
import { PaymentAccountsSettings } from '@/components/PaymentAccountsSettings'
import { OrgBillingNotice } from '@/components/OrgBillingNotice'
import { SupportContactSettings } from '@/components/SupportContactSettings'
import { SecuritySettings } from '@/components/SecuritySettings'
import { ChangePasswordCard } from '@/components/ChangePasswordCard'
import { DataExportSettings } from '@/components/DataExportSettings'
import { RecentlyMergedSettings } from '@/components/RecentlyMergedSettings'
import { AffiliateProgramSettings } from '@/components/AffiliateProgramSettings'
import { BusinessReferralProgramSettings } from '@/components/BusinessReferralProgramSettings'
import { ReferAndEarnSettings } from '@/components/ReferAndEarnSettings'
import { MyFeedbackSettings } from '@/components/MyFeedbackSettings'

/** Wraps a settings section in a disabled fieldset unless the caller passes
 * (or is granted) write access — same "view only, greyed out" convention
 * used everywhere else in Settings, just decided per-section instead of
 * blanket by role, since some sections are now delegatable to Users. */
function Section({ canWrite, children }: { canWrite: boolean; children: ReactNode }) {
  return <fieldset disabled={!canWrite} className={canWrite ? '' : 'opacity-60'}>{children}</fieldset>
}

export function Settings() {
  const { session, profile } = useAuth()
  const { viewingOrgId } = useOrg()
  const isUser = profile?.role === 'user'
  const isSuperAdmin = profile?.role === 'super_admin'
  // Branding is Admin-only, scoped to a real organization — a Super Admin
  // only has one to brand once they've drilled into a specific org.
  const showBranding = !isUser && (!isSuperAdmin || typeof viewingOrgId === 'string')

  const canManageTemplates = hasPermission(profile, 'canManageTemplates')
  const canManageCustomFields = hasPermission(profile, 'canManageCustomFields')
  const canManageStages = hasPermission(profile, 'canManageStages')
  const canManageOutreachSequences = hasPermission(profile, 'canManageOutreachSequences')
  const canManageIndustries = hasPermission(profile, 'canManageIndustries')

  const anyDelegated = canManageTemplates || canManageCustomFields || canManageStages || canManageOutreachSequences || canManageIndustries

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-base-100">Settings</h1>

      <div className="card p-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-base-300">Account</h2>
        <p className="text-sm text-base-200">{session?.user.email}</p>
        {profile && <div className="mt-1"><RoleBadge role={profile.role} /></div>}
      </div>

      {isUser && (
        <div className="flex items-center gap-2.5 rounded-lg bg-warn-bg px-4 py-3 text-sm text-warn">
          <AlertCircle size={16} className="shrink-0" />
          {anyDelegated
            ? 'Some sections below are view only — contact your admin to change this. Sections your admin has granted you access to are editable.'
            : 'View only — contact your admin to change this.'}
        </div>
      )}

      <ChangePasswordCard />
      <SecuritySettings />

      <div className="space-y-6">
        {isSuperAdmin && (
          <Section canWrite>
            <PlatformBrandingSettings />
          </Section>
        )}
        {isSuperAdmin && (
          <Section canWrite>
            <BillingSettings />
          </Section>
        )}
        {isSuperAdmin && (
          <Section canWrite>
            <PaymentAccountsSettings />
          </Section>
        )}
        {isSuperAdmin && (
          <Section canWrite>
            <AffiliateProgramSettings />
          </Section>
        )}
        {isSuperAdmin && (
          <Section canWrite>
            <BusinessReferralProgramSettings />
          </Section>
        )}
        {!isSuperAdmin && !isUser && <OrgBillingNotice />}
        {!isSuperAdmin && !isUser && <ReferAndEarnSettings />}
        {isSuperAdmin && (
          <Section canWrite>
            <SupportContactSettings />
          </Section>
        )}
        {showBranding && (
          <Section canWrite>
            <BrandingSettings />
          </Section>
        )}
        {!isUser && <DataExportSettings />}
        {!isUser && <RecentlyMergedSettings />}
        <Section canWrite={canManageStages}>
          <PipelineStagesSettings />
        </Section>
        <Section canWrite={canManageOutreachSequences}>
          <OutreachSequencesSettings />
        </Section>
        <Section canWrite={canManageIndustries}>
          <IndustriesSettings />
        </Section>
        <Section canWrite={canManageTemplates}>
          <TemplatesSettings />
        </Section>
        <Section canWrite={canManageStages}>
          <DealStagesSettings />
        </Section>
        <Section canWrite={!isUser}>
          <WinLossReasonsSettings />
        </Section>
        <Section canWrite={!isUser}>
          <DefaultCurrencySettings />
        </Section>
        <Section canWrite={canManageCustomFields}>
          <CustomFieldsSettings />
        </Section>
        <Section canWrite={!isUser}>
          <QuotaSettings />
        </Section>
        {!isSuperAdmin && <MyFeedbackSettings />}
      </div>
    </div>
  )
}
