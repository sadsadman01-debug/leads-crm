import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Copy, Check, FileText } from 'lucide-react'
import { templatesApi, industriesApi, teamApi, customFieldsApi, outreachSequencesApi } from '@/lib/api'
import { TEMPLATE_TYPES, TEMPLATE_TYPE_CHANNEL, type Lead, type TemplateType, type OutreachChannel, type OutreachSequenceStage } from '@/types/lead'
import { fillTemplate } from '@/lib/mergeFields'

/** The stage most relevant to prefill a template for — the earliest
 * not-yet-completed stage in this channel's configured sequence (or the
 * last one, if every stage is already done), so picking "WhatsApp Follow-up
 * 2" for instance naturally follows what's actually next for this lead. */
function currentStageForChannel(
  channelStages: OutreachSequenceStage[],
  progress: Lead['outreach_progress']
): OutreachSequenceStage | undefined {
  if (channelStages.length === 0) return undefined
  const progressByStage = new Map(progress.map((p) => [p.outreach_sequence_stage_id, p]))
  for (const stage of channelStages) {
    const p = progressByStage.get(stage.id)
    if (!p || !p.completed_at) return stage
  }
  return channelStages[channelStages.length - 1]
}

export function TemplateUsePanel({ lead }: { lead: Lead }) {
  const { data } = useQuery({ queryKey: ['templates'], queryFn: templatesApi.list })
  const { data: industriesData } = useQuery({ queryKey: ['industries'], queryFn: industriesApi.list })
  const { data: rosterData } = useQuery({ queryKey: ['team-roster'], queryFn: teamApi.roster })
  const { data: customFieldsData } = useQuery({ queryKey: ['custom-fields'], queryFn: customFieldsApi.list })
  const { data: sequenceData } = useQuery({ queryKey: ['outreach-sequence-stages'], queryFn: outreachSequencesApi.list })

  const templates = data?.templates ?? []
  const stages = sequenceData?.stages ?? []
  const [templateType, setTemplateType] = useState<TemplateType | ''>('')
  const [selectedId, setSelectedId] = useState('')
  const [copied, setCopied] = useState(false)

  const defaultTemplateByChannel = useMemo(() => {
    const result: Partial<Record<OutreachChannel, string | null>> = {}
    for (const channel of ['email', 'whatsapp', 'linkedin'] as OutreachChannel[]) {
      const channelStages = stages.filter((s) => s.channel === channel).sort((a, b) => a.stage_number - b.stage_number)
      const stage = currentStageForChannel(channelStages, lead.outreach_progress)
      result[channel] = stage?.default_template_id ?? null
    }
    return result
  }, [stages, lead.outreach_progress])

  const typesWithTemplates = useMemo(() => {
    const present = new Set(templates.map((t) => t.template_type))
    return TEMPLATE_TYPES.filter((t) => present.has(t.value))
  }, [templates])

  const templatesForType = useMemo(
    () => templates.filter((t) => t.template_type === templateType),
    [templates, templateType]
  )

  const selected = templatesForType.find((t) => t.id === selectedId)
  const hasSubject = TEMPLATE_TYPES.find((t) => t.value === templateType)?.hasSubject ?? true

  const industryName = industriesData?.industries.find((i) => i.id === lead.industry_id)?.name
  const assignedToName = rosterData?.members.find((m) => m.id === lead.assigned_to)?.nickname ?? undefined

  const customFieldDefs = (customFieldsData?.fields ?? []).map((f) => ({ id: f.id, label: f.label }))

  const filled = useMemo(() => {
    if (!selected) return null
    const context = { industryName, assignedToName, customFieldDefs }
    const subjectResult = selected.subject ? fillTemplate(selected.subject, lead, context) : null
    const bodyResult = fillTemplate(selected.body, lead, context)
    const emptyFields = [...new Set([...(subjectResult?.emptyFields ?? []), ...bodyResult.emptyFields])]
    return {
      subject: subjectResult?.text ?? '',
      body: bodyResult.text,
      emptyFields,
    }
  }, [selected, lead, industryName, assignedToName, customFieldDefs])

  function selectType(value: string) {
    const type = value as TemplateType | ''
    setTemplateType(type)

    const channel = type ? TEMPLATE_TYPE_CHANNEL[type] : undefined
    const defaultId = channel ? defaultTemplateByChannel[channel] : null
    const availableForType = templates.filter((t) => t.template_type === type)
    setSelectedId(defaultId && availableForType.some((t) => t.id === defaultId) ? defaultId : '')
  }

  async function handleCopy() {
    if (!filled) return
    const text = filled.subject ? `Subject: ${filled.subject}\n\n${filled.body}` : filled.body
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (templates.length === 0) {
    return (
      <div className="card p-6">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-base-300">Template Preview</h2>
        <div className="flex items-center gap-2 text-xs text-base-500">
          <FileText size={14} />
          No templates yet. Manage templates in Settings.
        </div>
      </div>
    )
  }

  return (
    <div className="card space-y-3 p-6">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-base-300">Template Preview</h2>
      <p className="text-xs text-base-400">Fill a saved template with this lead's info, then copy it.</p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Template Type</label>
          <select className="input" value={templateType} onChange={(e) => selectType(e.target.value)}>
            <option value="">Choose a type…</option>
            {typesWithTemplates.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        {templateType && (
          <div>
            <label className="label">Template</label>
            <select className="input" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
              <option value="">Choose a template…</option>
              {templatesForType.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {filled && (
        <div className="space-y-2">
          {filled.emptyFields.length > 0 && (
            <p className="rounded-lg bg-warn-bg px-3 py-2 text-xs text-warn">
              ⚠ {filled.emptyFields.join(', ')} {filled.emptyFields.length === 1 ? 'is' : 'are'} empty for this lead.
              {filled.emptyFields.includes('Contact Person Name') && " Using \"there\" as a greeting fallback."}
            </p>
          )}
          {filled.subject && (
            <div className="rounded-lg border border-base-700/60 bg-base-850 px-3 py-2">
              <p className="text-xs uppercase tracking-wide text-base-500">Subject</p>
              <p className="text-sm font-semibold text-base-100">{filled.subject}</p>
            </div>
          )}
          <div className="rounded-lg border border-base-700/60 bg-base-850 px-3 py-2">
            <p className="mb-1 text-xs uppercase tracking-wide text-base-500">{hasSubject ? 'Body' : 'Message'}</p>
            <p className="whitespace-pre-wrap text-sm text-base-200">{filled.body}</p>
          </div>
          <button className="btn-secondary w-full" onClick={handleCopy}>
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? 'Copied ✓' : 'Copy to Clipboard'}
          </button>
        </div>
      )}
    </div>
  )
}
