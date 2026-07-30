import { Fragment, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ScrollText,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Search,
  Download,
  Filter,
  LogIn,
  LogOut,
  ShieldAlert,
  UserPlus2,
  UserCheck,
  UserX,
  Users,
  KeyRound,
  ShieldCheck,
  ShieldOff,
  ShieldQuestion,
  Building2,
  Building,
  Trash2,
  Palette,
  FileDown,
  Settings2,
  Combine,
  CircleDollarSign,
  CalendarX,
  Handshake,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { auditLogApi, organizationsApi } from '@/lib/api'
import { Badge } from '@/components/ui/Badge'
import {
  AUDIT_EVENT_LABELS,
  isSecurityEvent,
  type AuditEventType,
  type AuditLogEntry,
  type AuditLogFilters,
} from '@/types/auditLog'

const PAGE_SIZE = 25

const EVENT_ICONS: Record<AuditEventType, LucideIcon> = {
  login_success: LogIn,
  login_failure: ShieldAlert,
  logout: LogOut,
  signup_request_submitted: UserPlus2,
  signup_request_approved: UserCheck,
  signup_request_rejected: UserX,
  admin_account_created: UserPlus2,
  user_account_created: UserPlus2,
  team_member_deactivated: UserX,
  team_member_reactivated: UserCheck,
  team_member_deleted: Trash2,
  permissions_changed: Settings2,
  password_reset_request_submitted: KeyRound,
  password_reset_request_resolved: KeyRound,
  mfa_reset_request_submitted: ShieldQuestion,
  mfa_reset_request_resolved: ShieldQuestion,
  mfa_enabled: ShieldCheck,
  mfa_disabled: ShieldOff,
  password_changed: KeyRound,
  organization_created: Building2,
  organization_suspended: Building,
  organization_reactivated: Building2,
  organization_deleted: Trash2,
  organization_branding_changed: Palette,
  platform_branding_changed: Palette,
  data_export_triggered: FileDown,
  bulk_leads_deleted: Trash2,
  leads_merged: Combine,
  deals_merged: Combine,
  payment_recorded: CircleDollarSign,
  payment_status_changed: CircleDollarSign,
  subscription_expired: CalendarX,
  affiliate_application_submitted: Handshake,
  affiliate_approved: UserCheck,
  affiliate_rejected: UserX,
  affiliate_commission_generated: CircleDollarSign,
  withdrawal_requested: Wallet,
  withdrawal_status_changed: Wallet,
}

const ALL_EVENT_TYPES = Object.keys(AUDIT_EVENT_LABELS) as AuditEventType[]

function EventTypeIcon({ type }: { type: AuditEventType }) {
  const Icon = EVENT_ICONS[type] ?? Users
  const security = isSecurityEvent(type)
  return (
    <span
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
        security ? 'bg-accent-500/15 text-accent-400' : 'bg-warn-bg text-warn'
      }`}
    >
      <Icon size={14} />
    </span>
  )
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export function AuditLogPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [eventTypes, setEventTypes] = useState<AuditEventType[]>([])
  const [organizationId, setOrganizationId] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  const filters: AuditLogFilters = useMemo(
    () => ({
      eventTypes: eventTypes.length > 0 ? eventTypes : undefined,
      organizationId: organizationId || undefined,
      dateFrom: dateFrom ? new Date(dateFrom).toISOString() : undefined,
      dateTo: dateTo ? new Date(`${dateTo}T23:59:59.999`).toISOString() : undefined,
      search: search.trim() || undefined,
    }),
    [eventTypes, organizationId, dateFrom, dateTo, search]
  )

  const { data, isLoading } = useQuery({
    queryKey: ['audit-log', filters, page],
    queryFn: () => auditLogApi.list(filters, page, PAGE_SIZE),
  })

  const { data: orgsData } = useQuery({ queryKey: ['organizations'], queryFn: organizationsApi.list })
  const organizations = orgsData?.organizations ?? []

  const entries = data?.entries ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const activeFilterCount = [eventTypes.length > 0, Boolean(organizationId), Boolean(dateFrom), Boolean(dateTo)].filter(
    Boolean
  ).length

  function toggleEventType(type: AuditEventType) {
    setPage(1)
    setEventTypes((current) => (current.includes(type) ? current.filter((t) => t !== type) : [...current, type]))
  }

  function clearFilters() {
    setPage(1)
    setEventTypes([])
    setOrganizationId('')
    setDateFrom('')
    setDateTo('')
  }

  async function handleExport() {
    setExporting(true)
    try {
      await auditLogApi.downloadCsv(filters)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-base-100">Audit Log</h1>
        <p className="mt-1 text-sm text-base-400">
          Platform-wide record of security and administrative events. Visible only to you — this is never shown to
          Admins or Users, even for events touching their own organization.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base-500" />
          <input
            className="input pl-9"
            placeholder="Search actor or target…"
            value={search}
            onChange={(e) => {
              setPage(1)
              setSearch(e.target.value)
            }}
          />
        </div>

        <div className="relative">
          <button className="btn-secondary" onClick={() => setFilterOpen((o) => !o)}>
            <Filter size={15} />
            Filters
            {activeFilterCount > 0 && <span className="pill bg-accent-500/20 px-1.5 text-accent-400">{activeFilterCount}</span>}
            <ChevronDown size={13} />
          </button>

          {filterOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setFilterOpen(false)} />
              <div className="card fixed inset-x-4 top-32 z-50 max-h-[75vh] w-auto overflow-y-auto p-5 animate-slideUp sm:absolute sm:inset-x-auto sm:left-0 sm:top-auto sm:mt-2 sm:w-[380px]">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-base-100">Filter Audit Log</h3>
                  {activeFilterCount > 0 && (
                    <button className="text-xs text-accent-400 hover:underline" onClick={clearFilters}>
                      Clear all
                    </button>
                  )}
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="label">Organization</label>
                    <select
                      className="input"
                      value={organizationId}
                      onChange={(e) => {
                        setPage(1)
                        setOrganizationId(e.target.value)
                      }}
                    >
                      <option value="">All Organizations</option>
                      {organizations.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">From</label>
                      <input
                        type="date"
                        className="input"
                        value={dateFrom}
                        onChange={(e) => {
                          setPage(1)
                          setDateFrom(e.target.value)
                        }}
                      />
                    </div>
                    <div>
                      <label className="label">To</label>
                      <input
                        type="date"
                        className="input"
                        value={dateTo}
                        onChange={(e) => {
                          setPage(1)
                          setDateTo(e.target.value)
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="label">Event Type</label>
                    <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg bg-base-850 p-2">
                      {ALL_EVENT_TYPES.map((type) => (
                        <label
                          key={type}
                          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-base-300 hover:bg-base-800"
                        >
                          <input
                            type="checkbox"
                            className="accent-accent-500"
                            checked={eventTypes.includes(type)}
                            onChange={() => toggleEventType(type)}
                          />
                          {AUDIT_EVENT_LABELS[type]}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <button className="btn-secondary ml-auto" disabled={exporting} onClick={handleExport}>
          <Download size={15} />
          {exporting ? 'Exporting…' : 'Export CSV'}
        </button>
      </div>

      {isLoading ? (
        <div className="card p-12 text-center text-base-400">Loading…</div>
      ) : entries.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 p-16 text-center">
          <ScrollText size={32} className="text-base-500" />
          <p className="text-base-300">No matching audit log entries.</p>
        </div>
      ) : (
        <div className="card overflow-x-auto p-6">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead>
              <tr className="border-b border-base-700/60 text-xs uppercase tracking-wide text-base-400">
                <th className="py-2 pr-3 font-medium">Timestamp</th>
                <th className="px-3 py-2 font-medium">Event</th>
                <th className="px-3 py-2 font-medium">Actor</th>
                <th className="px-3 py-2 font-medium">Organization</th>
                <th className="px-3 py-2 font-medium">Target</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {entries.map((entry: AuditLogEntry) => {
                const expanded = expandedId === entry.id
                return (
                  <Fragment key={entry.id}>
                    <tr
                      className="cursor-pointer border-b border-base-800 align-top hover:bg-base-850"
                      onClick={() => setExpandedId(expanded ? null : entry.id)}
                    >
                      <td className="py-3 pr-3 whitespace-nowrap text-base-400">{new Date(entry.created_at).toLocaleString()}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <EventTypeIcon type={entry.event_type} />
                          <span className="text-base-100">{AUDIT_EVENT_LABELS[entry.event_type]}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-base-200">
                        {entry.actor_nickname ? (
                          <div className="flex items-center gap-1.5">
                            {entry.actor_nickname}
                            {entry.actor_role && (
                              <Badge tone={entry.actor_role === 'super_admin' ? 'accent' : entry.actor_role === 'admin' ? 'warn' : 'neutral'}>
                                {entry.actor_role.replace('_', ' ')}
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-base-500">System / Unauthenticated</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-base-300">{entry.organization_name || '—'}</td>
                      <td className="px-3 py-3 text-base-300">{entry.target_nickname || '—'}</td>
                      <td className="px-3 py-3 text-base-500">
                        <ChevronDown size={15} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="border-b border-base-800 bg-base-850/60">
                        <td colSpan={6} className="px-3 py-4">
                          <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
                            <div>
                              <p className="text-base-500">IP Address</p>
                              <p className="mt-0.5 text-base-200">{entry.ip_address || '—'}</p>
                            </div>
                            {Object.entries(entry.metadata ?? {}).map(([key, value]) => (
                              <div key={key}>
                                <p className="text-base-500">{key.replace(/_/g, ' ')}</p>
                                <p className="mt-0.5 break-all text-base-200">{formatValue(value)}</p>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>

          <div className="mt-4 flex items-center justify-between text-sm text-base-400">
            <span>
              Page {page} of {totalPages} · {total} entries
            </span>
            <div className="flex gap-2">
              <button className="btn-secondary px-2" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft size={15} />
              </button>
              <button className="btn-secondary px-2" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
