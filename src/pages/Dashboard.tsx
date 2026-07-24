import { useState } from 'react'
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
} from 'lucide-react'
import { dashboardApi } from '@/lib/api'
import { StatTile } from '@/components/charts/StatTile'
import { FunnelChart } from '@/components/charts/FunnelChart'
import { TrendChart } from '@/components/charts/TrendChart'
import { DonutChart } from '@/components/charts/DonutChart'
import { RemindersWidget } from '@/components/RemindersWidget'
import { LEAD_SOURCE_COLORS, PRIORITY_COLORS, SENTIMENT_COLORS, STATUS_DIST_COLORS } from '@/lib/chartColors'

const GRANULARITIES: Array<{ value: 'day' | 'week' | 'month'; label: string }> = [
  { value: 'day', label: 'Daily (30d)' },
  { value: 'week', label: 'Weekly (12w)' },
  { value: 'month', label: 'Monthly (12mo)' },
]

export function Dashboard() {
  const [granularity, setGranularity] = useState<'day' | 'week' | 'month'>('day')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['dashboard-summary', granularity],
    queryFn: () => dashboardApi.summary(granularity),
    placeholderData: (prev) => prev,
  })

  if (isLoading && !data) {
    return <div className="p-12 text-center text-base-400">Loading dashboard…</div>
  }
  if (isError || !data) {
    return <div className="p-12 text-center text-danger">Failed to load dashboard data.</div>
  }

  const sentimentData = Object.entries(data.replies.sentiment).map(([label, count]) => ({ label, count }))

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-base-100">Dashboard</h1>
          <p className="mt-1 text-sm text-base-400">Outreach performance at a glance</p>
        </div>
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

      <RemindersWidget reminders={data.reminders} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        <StatTile label="Total Leads" value={data.totals.leads} icon={Users} tone="accent" />
        <StatTile
          label="Cold Emails Sent"
          value={data.outreach.cold_email_sent.count}
          subvalue={`${data.outreach.cold_email_sent.pct}%`}
          icon={Mail}
          tone="accent"
        />
        <StatTile
          label="1st Follow-up"
          value={data.outreach.followup1_sent.count}
          subvalue={`${data.outreach.followup1_sent.pct}%`}
          icon={Send}
          tone="neutral"
        />
        <StatTile
          label="2nd Follow-up"
          value={data.outreach.followup2_sent.count}
          subvalue={`${data.outreach.followup2_sent.pct}%`}
          icon={Send}
          tone="neutral"
        />
        <StatTile
          label="3rd Follow-up"
          value={data.outreach.followup3_sent.count}
          subvalue={`${data.outreach.followup3_sent.pct}%`}
          icon={Send}
          tone="neutral"
        />
        <StatTile
          label="Replies"
          value={data.replies.total}
          subvalue={`${data.replies.rate}% rate`}
          icon={Reply}
          tone="accent"
        />
        <StatTile
          label="Converted to Client"
          value={data.conversion.count}
          subvalue={`${data.conversion.rate}% rate`}
          icon={Trophy}
          tone="success"
        />
        <StatTile
          label="WhatsApp Sent"
          value={data.outreach.whatsapp_sent.count}
          subvalue={`${data.outreach.whatsapp_sent.pct}%`}
          icon={MessageCircle}
          tone="success"
        />
        <StatTile
          label="LinkedIn Sent"
          value={data.outreach.linkedin_sent.count}
          subvalue={`${data.outreach.linkedin_sent.pct}%`}
          icon={Linkedin}
          tone="success"
        />
        <StatTile
          label="SMS Sent"
          value={data.outreach.sms_sent.count}
          subvalue={`${data.outreach.sms_sent.pct}%`}
          icon={Send}
          tone="success"
        />
        <StatTile
          label="Cold Calls Made"
          value={data.outreach.cold_call_made.count}
          subvalue={`${data.outreach.cold_call_made.pct}%`}
          icon={Phone}
          tone="success"
        />
        <StatTile
          label="No WhatsApp Available"
          value={data.outreach.no_whatsapp.count}
          subvalue={`${data.outreach.no_whatsapp.pct}%`}
          icon={PhoneOff}
          tone="warn"
        />
        <StatTile
          label="Invalid Email"
          value={data.outreach.email_invalid.count}
          subvalue={`${data.outreach.email_invalid.pct}%`}
          icon={MailWarning}
          tone="danger"
        />
        <StatTile
          label="Invalid Phone"
          value={data.outreach.phone_invalid.count}
          subvalue={`${data.outreach.phone_invalid.pct}%`}
          icon={PhoneMissed}
          tone="danger"
        />
      </div>

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
    </div>
  )
}
