import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Users,
  Mail,
  MessageCircle,
  Linkedin,
  Send,
  Phone,
  PhoneOff,
  MailWarning,
  PhoneMissed,
  Reply,
  Trophy,
  ShieldAlert,
} from 'lucide-react'
import { dashboardApi, industriesApi, revenueApi, settingsApi, teamApi } from '@/lib/api'
import { StatTile } from '@/components/charts/StatTile'
import { FunnelChart } from '@/components/charts/FunnelChart'
import { TrendChart } from '@/components/charts/TrendChart'
import { DonutChart } from '@/components/charts/DonutChart'
import { RemindersWidget } from '@/components/RemindersWidget'
import { OnboardingChecklist } from '@/components/OnboardingChecklist'
import { MfaNudgeBanner } from '@/components/MfaNudgeBanner'
import { SubscriptionStatusWidget } from '@/components/SubscriptionStatusWidget'
import { IndustryComparisonTable } from '@/components/IndustryComparisonTable'
import { TeamPerformanceTable } from '@/components/TeamPerformanceTable'
import { RevenueSection } from '@/components/RevenueSection'
import { DashboardPeriodComparisons } from '@/components/DashboardPeriodComparisons'
import { LEAD_SOURCE_COLORS, PRIORITY_COLORS, SENTIMENT_COLORS, STATUS_DIST_COLORS } from '@/lib/chartColors'
import { useAuth, isAdminOrAbove } from '@/contexts/AuthContext'
import type { RevenueSummary } from '@/types/deal'
import type { LeadFilters, OutreachChannel } from '@/types/lead'

const GRANULARITIES: Array<{ value: 'day' | 'week' | 'month'; label: string }> = [
  { value: 'day', label: 'Daily (30d)' },
  { value: 'week', label: 'Weekly (12w)' },
  { value: 'month', label: 'Monthly (12mo)' },
]

export function Dashboard() {
  const { profile } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const isAdmin = isAdminOrAbove(profile?.role)
  const [granularity, setGranularity] = useState<'day' | 'week' | 'month'>('day')
  const [industryId, setIndustryId] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [closedRange, setClosedRange] = useState<RevenueSummary['closedRange']>('all')
  const [displayCurrency, setDisplayCurrency] = useState('')
  const [accessDeniedDismissed, setAccessDeniedDismissed] = useState(false)

  // Users are always auto-scoped to their own stats; the selector is admin/super-admin only.
  const effectiveAssignedTo = isAdmin ? assignedTo || undefined : profile?.id

  const { data, isLoading, isError } = useQuery({
    queryKey: ['dashboard-summary', granularity, industryId, effectiveAssignedTo],
    queryFn: () => dashboardApi.summary(granularity, industryId || undefined, effectiveAssignedTo),
    placeholderData: (prev) => prev,
  })

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get })
  const effectiveDisplayCurrency = displayCurrency || settings?.default_currency || 'USD'

  const { data: revenue } = useQuery({
    queryKey: ['revenue-summary', closedRange, industryId, effectiveAssignedTo, effectiveDisplayCurrency],
    queryFn: () => revenueApi.summary(closedRange, industryId || undefined, effectiveAssignedTo, effectiveDisplayCurrency),
    placeholderData: (prev) => prev,
  })

  const { data: industriesData } = useQuery({ queryKey: ['industries'], queryFn: industriesApi.list })
  const industries = industriesData?.industries ?? []

  const { data: teamData } = useQuery({ queryKey: ['team-members'], queryFn: teamApi.list, enabled: isAdmin })
  const members = teamData?.members.filter((m) => m.is_active) ?? []

  const accessDenied = Boolean((location.state as any)?.accessDenied) && !accessDeniedDismissed

  /** Drills down from a stat card into the Leads table, pre-filtered to match
   * exactly what the card counted — carrying over the Dashboard's own
   * Industry/Team-Member scoping so the results stay consistent with the number. */
  function drillDown(statusField: keyof import('@/types/lead').LeadStatus | undefined, label: string) {
    const drillFilters: LeadFilters = {
      industryId: industryId || undefined,
      assignedTo: effectiveAssignedTo || undefined,
      statusChecks: statusField ? [{ field: statusField, value: true }] : undefined,
    }
    navigate('/leads', { state: { initialFilters: drillFilters, drillLabel: label } })
  }

  /** Same drill-down, but for a specific configured outreach-sequence stage
   * rather than a fixed lead_status column. */
  function drillDownStage(stageId: string, label: string) {
    const drillFilters: LeadFilters = {
      industryId: industryId || undefined,
      assignedTo: effectiveAssignedTo || undefined,
      outreachStageId: stageId,
    }
    navigate('/leads', { state: { initialFilters: drillFilters, drillLabel: label } })
  }

  if (isLoading && !data) {
    return <div className="p-12 text-center text-base-400">Loading dashboard…</div>
  }
  if (isError || !data) {
    return <div className="p-12 text-center text-danger">Failed to load dashboard data.</div>
  }

  const sentimentData = Object.entries(data.replies.sentiment).map(([label, count]) => ({ label, count }))

  return (
    <div className="space-y-6">
      {accessDenied && (
        <div className="flex items-center gap-2.5 rounded-lg bg-warn-bg px-4 py-3 text-sm text-warn">
          <ShieldAlert size={16} className="shrink-0" />
          <span className="flex-1">You don't have access to that section.</span>
          <button className="text-warn/70 hover:text-warn" onClick={() => setAccessDeniedDismissed(true)}>
            Dismiss
          </button>
        </div>
      )}

      <SubscriptionStatusWidget />
      <MfaNudgeBanner />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-base-100">Dashboard</h1>
          <p className="mt-1 text-sm text-base-400">Outreach performance at a glance</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isAdmin && members.length > 0 && (
            <select
              className="input w-full sm:w-auto"
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
            >
              <option value="">All Team Members</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.nickname || m.email}</option>
              ))}
            </select>
          )}
          {industries.length > 0 && (
            <select
              className="input w-full sm:w-auto"
              value={industryId}
              onChange={(e) => setIndustryId(e.target.value)}
            >
              <option value="">All Industries</option>
              {industries.map((i) => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </select>
          )}
          <select
            className="input w-full sm:w-auto"
            value={granularity}
            onChange={(e) => setGranularity(e.target.value as any)}
          >
            {GRANULARITIES.map((g) => (
              <option key={g.value} value={g.value}>{g.label}</option>
            ))}
          </select>
        </div>
      </div>

      <DashboardPeriodComparisons currency={settings?.default_currency ?? 'USD'} />

      <RemindersWidget reminders={data.reminders} />

      {profile?.role === 'admin' && <OnboardingChecklist />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 desktop:grid-cols-4">
        <StatTile label="Total Leads" value={data.totals.leads} icon={Users} tone="accent" onClick={() => drillDown(undefined, 'Total Leads')} />
        <StatTile
          label="Replies"
          value={data.replies.total}
          subvalue={`${data.replies.rate}% rate`}
          icon={Reply}
          tone="accent"
          onClick={() => drillDown('replied', 'Replied ✓')}
        />
        <StatTile
          label="Converted to Client"
          value={data.conversion.count}
          subvalue={`${data.conversion.rate}% rate`}
          icon={Trophy}
          tone="success"
          onClick={() => drillDown('converted', 'Converted to Client ✓')}
        />
        <StatTile
          label="SMS Sent"
          value={data.outreach.sms_sent.count}
          subvalue={`${data.outreach.sms_sent.pct}%`}
          icon={Send}
          tone="success"
          onClick={() => drillDown('sms_sent', 'SMS Sent ✓')}
        />
        <StatTile
          label="Cold Calls Made"
          value={data.outreach.cold_call_made.count}
          subvalue={`${data.outreach.cold_call_made.pct}%`}
          icon={Phone}
          tone="success"
          onClick={() => drillDown('cold_call_made', 'Cold Call Made ✓')}
        />
        <StatTile
          label="No WhatsApp Available"
          value={data.outreach.no_whatsapp.count}
          subvalue={`${data.outreach.no_whatsapp.pct}%`}
          icon={PhoneOff}
          tone="warn"
          onClick={() => drillDown('no_whatsapp', 'No WhatsApp Available ✓')}
        />
        <StatTile
          label="Invalid Email"
          value={data.outreach.email_invalid.count}
          subvalue={`${data.outreach.email_invalid.pct}%`}
          icon={MailWarning}
          tone="danger"
          onClick={() => drillDown('email_invalid', 'Email Invalid ✓')}
        />
        <StatTile
          label="Invalid Phone"
          value={data.outreach.phone_invalid.count}
          subvalue={`${data.outreach.phone_invalid.pct}%`}
          icon={PhoneMissed}
          tone="danger"
          onClick={() => drillDown('phone_invalid', 'Phone Invalid ✓')}
        />
      </div>

      {(['email', 'whatsapp', 'linkedin'] as OutreachChannel[]).map((channel) => {
        const channelStages = data.outreachStages.filter((s) => s.channel === channel)
        if (channelStages.length === 0) return null
        const Icon = channel === 'email' ? Mail : channel === 'whatsapp' ? MessageCircle : Linkedin
        const sectionLabel = channel === 'email' ? 'Email Sequence' : channel === 'whatsapp' ? 'WhatsApp Sequence' : 'LinkedIn Sequence'
        return (
          <div key={channel}>
            <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-base-300">
              <Icon size={14} />
              {sectionLabel}
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 desktop:grid-cols-4">
              {channelStages.map((stage) => (
                <StatTile
                  key={stage.id}
                  label={stage.stage_label}
                  value={stage.count}
                  subvalue={`${stage.pct}%`}
                  icon={stage.stage_number === 0 ? Icon : Send}
                  tone={stage.stage_number === 0 ? 'accent' : 'neutral'}
                  onClick={() => drillDownStage(stage.id, `${stage.stage_label} ✓`)}
                />
              ))}
            </div>
          </div>
        )
      })}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-base-300">Outreach Funnel</h2>
          <FunnelChart data={data.funnel} />
        </div>

        <div className="card p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-base-300">Reply Sentiment</h2>
          <DonutChart data={sentimentData} colors={SENTIMENT_COLORS} />
        </div>
      </div>

      <div className="card p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-base-300">
          Leads Added &amp; Cold Emails Sent
        </h2>
        <TrendChart points={data.trend.points} granularity={data.trend.granularity} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="card p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-base-300">Status Distribution</h2>
          <DonutChart data={data.distributions.status} colors={STATUS_DIST_COLORS} />
        </div>
        <div className="card p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-base-300">Lead Source</h2>
          <DonutChart data={data.distributions.leadSource} colors={LEAD_SOURCE_COLORS} />
        </div>
        <div className="card p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-base-300">Priority</h2>
          <DonutChart data={data.distributions.priority} colors={PRIORITY_COLORS} />
        </div>
      </div>

      {data.industryComparison.length > 0 && <IndustryComparisonTable rows={data.industryComparison} />}

      {data.teamPerformance && data.teamPerformance.length > 0 && (
        <TeamPerformanceTable rows={data.teamPerformance} currency={settings?.default_currency ?? 'USD'} />
      )}

      <div className="border-t border-base-700/60 pt-6">
        {revenue && (
          <RevenueSection
            revenue={revenue}
            closedRange={closedRange}
            onClosedRangeChange={setClosedRange}
            displayCurrency={effectiveDisplayCurrency}
            onDisplayCurrencyChange={setDisplayCurrency}
          />
        )}
      </div>
    </div>
  )
}
