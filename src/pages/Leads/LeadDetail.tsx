import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Globe,
  Mail,
  Phone,
  MapPin,
  Facebook,
  Linkedin,
  Twitter,
  Link as LinkIcon,
  AlertCircle,
  Clock,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { leadsApi, pipelineStagesApi, industriesApi, dealsApi, teamApi, customFieldsApi } from '@/lib/api'
import { CustomFieldsDisplay } from '@/components/CustomFieldsDisplay'
import { PriorityBadge, TagPill, Badge, ScoreBadge } from '@/components/ui/Badge'
import { StatusPanel } from '@/components/StatusPanel'
import { AttachmentsPanel } from '@/components/AttachmentsPanel'
import { LeadTimeline } from '@/components/LeadTimeline'
import { TemplateUsePanel } from '@/components/TemplateUsePanel'
import { LeadDealsPanel } from '@/components/LeadDealsPanel'
import { DealForm } from '@/components/DealForm'
import { Modal } from '@/components/ui/Modal'
import { Handshake } from 'lucide-react'
import { useAuth, isAdminOrAbove } from '@/contexts/AuthContext'

const PLATFORM_ICON: Record<string, typeof Globe> = {
  Facebook,
  'X/Twitter': Twitter,
  LinkedIn: Linkedin,
}

export function LeadDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const { data: lead, isLoading } = useQuery({
    queryKey: ['lead', id],
    queryFn: () => leadsApi.get(id!),
    enabled: Boolean(id),
  })

  const { data: stagesData } = useQuery({ queryKey: ['pipeline-stages'], queryFn: pipelineStagesApi.list })
  const { data: industriesData } = useQuery({ queryKey: ['industries'], queryFn: industriesApi.list })
  const { data: rosterData } = useQuery({ queryKey: ['team-roster'], queryFn: teamApi.roster })
  const roster = rosterData?.members ?? []
  const { data: customFieldsData } = useQuery({ queryKey: ['custom-fields'], queryFn: customFieldsApi.list })
  const leadCustomFields = (customFieldsData?.fields ?? []).filter((f) => f.applies_to === 'leads' || f.applies_to === 'both')
  const { data: leadDeals } = useQuery({
    queryKey: ['deals', { leadId: id }],
    queryFn: () => dealsApi.list({ filters: { leadId: id } }),
    enabled: Boolean(id),
  })
  const [showConvertedPrompt, setShowConvertedPrompt] = useState(true)
  const [quickDealFormOpen, setQuickDealFormOpen] = useState(false)

  const deleteMutation = useMutation({
    mutationFn: () => leadsApi.remove(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      navigate('/leads')
    },
  })

  const stageMutation = useMutation({
    mutationFn: (stageId: string) => leadsApi.updateStage(id!, stageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead', id] })
      queryClient.invalidateQueries({ queryKey: ['leads'] })
    },
  })

  const industryMutation = useMutation({
    mutationFn: (industryId: string) => leadsApi.update(id!, { industry_id: industryId || null } as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead', id] })
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['lead-activities', id] })
    },
  })

  const assignMutation = useMutation({
    mutationFn: (assignedTo: string) => leadsApi.update(id!, { assigned_to: assignedTo || null } as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead', id] })
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['lead-activities', id] })
    },
  })

  if (isLoading || !lead) {
    return <div className="p-12 text-center text-base-400">Loading lead…</div>
  }

  const canEdit =
    isAdminOrAbove(profile?.role) || lead.assigned_to === profile?.id || lead.created_by === profile?.id
  const canReassign = isAdminOrAbove(profile?.role) || lead.assigned_to === profile?.id

  return (
    <div>
      <button className="btn-ghost mb-4 -ml-2" onClick={() => navigate('/leads')}>
        <ArrowLeft size={16} />
        Back to Leads
      </button>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-base-100">{lead.company_name}</h1>
            <PriorityBadge priority={lead.priority} />
            <ScoreBadge score={lead.score} band={lead.band} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {lead.tags.map((t) => (
              <TagPill key={t.id} label={t.name} />
            ))}
            <Badge tone="neutral">{lead.lead_source}</Badge>
          </div>
        </div>
        {canEdit && (
          <div className="flex shrink-0 gap-2">
            <button className="btn-secondary" onClick={() => navigate(`/leads/${lead.id}/edit`)}>
              <Pencil size={16} />
              Edit
            </button>
            <button className="btn-danger" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={16} />
              Delete
            </button>
          </div>
        )}
      </div>

      {lead.status?.next_follow_up_due_at && (
        <div
          className={`mb-6 flex items-center gap-2.5 rounded-lg px-4 py-3 text-sm ${
            lead.status.is_overdue ? 'bg-danger-bg text-danger' : lead.status.is_due_today ? 'bg-warn-bg text-warn' : 'bg-base-800 text-base-300'
          }`}
        >
          {lead.status.is_overdue ? <AlertCircle size={16} /> : <Clock size={16} />}
          <span>
            {lead.status.is_overdue ? 'Follow-up overdue since ' : lead.status.is_due_today ? 'Follow-up due today' : 'Next follow-up due '}
            {!lead.status.is_due_today && format(parseISO(lead.status.next_follow_up_due_at), 'MMM d, yyyy')}
          </span>
        </div>
      )}

      {lead.status?.converted && (leadDeals?.deals.length ?? 0) === 0 && showConvertedPrompt && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg bg-success-bg px-4 py-3 text-sm text-success">
          <Handshake size={16} className="shrink-0" />
          <span className="flex-1">This lead was converted to a client — create a Deal for it now?</span>
          <button className="btn-primary" onClick={() => setQuickDealFormOpen(true)}>
            Create Deal
          </button>
          <button className="text-success/70 hover:text-success" onClick={() => setShowConvertedPrompt(false)}>
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-1">
          <div className="card space-y-3 p-6">
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-base-300">
              Pipeline Stage
            </h2>
            <select
              className="input"
              value={lead.stage_id ?? ''}
              disabled={!canEdit || stageMutation.isPending}
              onChange={(e) => stageMutation.mutate(e.target.value)}
            >
              {(stagesData?.stages ?? []).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="card space-y-3 p-6">
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-base-300">
              Industry
            </h2>
            <select
              className="input"
              value={lead.industry_id ?? ''}
              disabled={!canEdit || industryMutation.isPending}
              onChange={(e) => industryMutation.mutate(e.target.value)}
            >
              <option value="">Unassigned</option>
              {(industriesData?.industries ?? []).map((i) => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </select>
          </div>

          <div className="card space-y-3 p-6">
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-base-300">
              Assigned To
            </h2>
            <select
              className="input"
              value={lead.assigned_to ?? ''}
              disabled={!canReassign || assignMutation.isPending}
              onChange={(e) => assignMutation.mutate(e.target.value)}
            >
              <option value="">Unassigned</option>
              {roster.map((m) => (
                <option key={m.id} value={m.id}>{m.nickname || m.email}</option>
              ))}
            </select>
          </div>

          <div className="card space-y-3 p-6">
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-base-300">
              Contact Info
            </h2>
            <InfoRow icon={MapPin} value={lead.address} />
            <InfoRow icon={Phone} value={lead.phone} href={lead.phone ? `tel:${lead.phone}` : undefined} />
            <InfoRow icon={Mail} value={lead.email} href={lead.email ? `mailto:${lead.email}` : undefined} />
            <InfoRow
              icon={Globe}
              value={lead.website}
              href={lead.website ? normalizeUrl(lead.website) : undefined}
            />
          </div>

          {lead.social_profiles.length > 0 && (
            <div className="card space-y-2 p-6">
              <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-base-300">
                Social Profiles
              </h2>
              {lead.social_profiles.map((p) => {
                const Icon = PLATFORM_ICON[p.platform] ?? LinkIcon
                return (
                  <a
                    key={p.id ?? p.url}
                    href={normalizeUrl(p.url)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-w-0 items-center gap-2.5 text-sm text-base-300 hover:text-accent-400"
                  >
                    <Icon size={16} className="shrink-0" />
                    <span className="min-w-0 truncate">{p.platform}</span>
                  </a>
                )
              })}
            </div>
          )}

          <div className="card space-y-1 p-6 text-xs text-base-400">
            <p>Created {new Date(lead.created_at).toLocaleString()}</p>
            <p>Updated {new Date(lead.updated_at).toLocaleString()}</p>
          </div>

          {lead.notes && (
            <div className="card space-y-2 p-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-base-300">Notes</h2>
              <p className="whitespace-pre-wrap text-sm text-base-200">{lead.notes}</p>
            </div>
          )}

          <CustomFieldsDisplay fields={leadCustomFields} values={lead.custom_fields ?? {}} />
          <AttachmentsPanel leadId={lead.id} attachments={lead.attachments ?? []} />
          <TemplateUsePanel lead={lead} />
        </div>

        <div className="space-y-6 lg:col-span-2">
          <StatusPanel lead={lead} readOnly={!canEdit} />
          <LeadDealsPanel leadId={lead.id} companyName={lead.company_name} />
          <LeadTimeline leadId={lead.id} />
        </div>
      </div>

      <DealForm
        open={quickDealFormOpen}
        leadId={lead.id}
        leadCompanyName={lead.company_name}
        onClose={() => setQuickDealFormOpen(false)}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['deals', { leadId: id }] })
          setShowConvertedPrompt(false)
        }}
      />

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete this lead?">
        <p className="mb-5 text-sm text-base-300">
          This will permanently delete <strong>{lead.company_name}</strong> and all associated status
          history and attachments. This cannot be undone.
        </p>
        <div className="flex justify-end gap-3">
          <button className="btn-secondary" onClick={() => setConfirmDelete(false)}>
            Cancel
          </button>
          <button
            className="btn-danger"
            disabled={deleteMutation.isPending}
            onClick={() => deleteMutation.mutate()}
          >
            {deleteMutation.isPending ? 'Deleting…' : 'Delete Lead'}
          </button>
        </div>
      </Modal>
    </div>
  )
}

function normalizeUrl(url: string) {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`
}

function InfoRow({
  icon: Icon,
  value,
  href,
}: {
  icon: typeof Globe
  value: string | null
  href?: string
}) {
  if (!value) return null
  const content = (
    <div className="flex min-w-0 items-center gap-2.5 text-sm text-base-200">
      <Icon size={16} className="shrink-0 text-base-400" />
      <span className="min-w-0 truncate">{value}</span>
    </div>
  )
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className="block hover:text-accent-400">
      {content}
    </a>
  ) : (
    content
  )
}
