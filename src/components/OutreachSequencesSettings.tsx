import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, AlertCircle, Mail, MessageCircle, Linkedin } from 'lucide-react'
import { outreachSequencesApi, templatesApi } from '@/lib/api'
import type { OutreachChannel, OutreachSequenceStage } from '@/types/lead'
import { TEMPLATE_TYPE_CHANNEL } from '@/types/lead'

const CHANNELS: Array<{ key: OutreachChannel; label: string; icon: typeof Mail; initialTouchLabel: string }> = [
  { key: 'email', label: 'Email Follow-ups', icon: Mail, initialTouchLabel: 'Cold Email' },
  { key: 'whatsapp', label: 'WhatsApp Follow-ups', icon: MessageCircle, initialTouchLabel: 'WhatsApp Message' },
  { key: 'linkedin', label: 'LinkedIn Follow-ups', icon: Linkedin, initialTouchLabel: 'LinkedIn Message' },
]

const MAX_ACTIVE_STAGES_PER_CHANNEL = 6

function StageRow({
  stage,
  templates,
  onUpdate,
  onRemove,
}: {
  stage: OutreachSequenceStage
  templates: Array<{ id: string; name: string }>
  onUpdate: (id: string, patch: Partial<Pick<OutreachSequenceStage, 'stage_label' | 'interval_days' | 'default_template_id'>>) => void
  onRemove: (stage: OutreachSequenceStage) => void
}) {
  const [label, setLabel] = useState(stage.stage_label)
  const [interval, setInterval] = useState(stage.interval_days ?? 1)

  useEffect(() => setLabel(stage.stage_label), [stage.stage_label])
  useEffect(() => setInterval(stage.interval_days ?? 1), [stage.interval_days])

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-base-700/60 bg-base-850 px-3 py-2.5">
      <input
        className="input min-w-0 flex-1"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={() => {
          const trimmed = label.trim()
          if (trimmed && trimmed !== stage.stage_label) onUpdate(stage.id, { stage_label: trimmed })
          else setLabel(stage.stage_label)
        }}
      />
      {stage.stage_number > 0 && (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-base-400">Days after previous stage:</span>
          <input
            type="number"
            min={1}
            className="input w-20"
            value={interval}
            onChange={(e) => setInterval(Math.max(1, parseInt(e.target.value, 10) || 1))}
            onBlur={() => {
              if (interval !== stage.interval_days) onUpdate(stage.id, { interval_days: interval })
            }}
          />
        </div>
      )}
      <select
        className="input w-auto min-w-[160px]"
        value={stage.default_template_id ?? ''}
        onChange={(e) => onUpdate(stage.id, { default_template_id: e.target.value || null })}
      >
        <option value="">No default template</option>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>
      {stage.stage_number > 0 && (
        <button className="btn-ghost px-2 hover:text-danger" onClick={() => onRemove(stage)} title="Remove stage">
          <Trash2 size={16} />
        </button>
      )}
    </div>
  )
}

function ChannelSection({
  channel,
  label,
  icon: Icon,
  initialTouchLabel,
  stages,
  templates,
  onUpdate,
  onRemove,
  onAdd,
}: {
  channel: OutreachChannel
  label: string
  icon: typeof Mail
  initialTouchLabel: string
  stages: OutreachSequenceStage[]
  templates: Array<{ id: string; name: string }>
  onUpdate: (id: string, patch: Partial<Pick<OutreachSequenceStage, 'stage_label' | 'interval_days' | 'default_template_id'>>) => void
  onRemove: (stage: OutreachSequenceStage) => void
  onAdd: (channel: OutreachChannel) => void
}) {
  const sorted = [...stages].sort((a, b) => a.stage_number - b.stage_number)
  const atMax = sorted.length >= MAX_ACTIVE_STAGES_PER_CHANNEL

  return (
    <div className="rounded-lg border border-base-700/60 bg-base-900/40 p-4">
      <p className="mb-3 flex items-center gap-2 text-sm font-medium text-base-100">
        <Icon size={15} className="text-accent-400" />
        {label}
      </p>
      <p className="mb-3 text-xs text-base-500">
        {initialTouchLabel} → {sorted.slice(1).map((s) => s.stage_label).join(' → ') || '—'}
      </p>
      <div className="space-y-2">
        {sorted.map((stage) => (
          <StageRow key={stage.id} stage={stage} templates={templates} onUpdate={onUpdate} onRemove={onRemove} />
        ))}
      </div>
      <button
        type="button"
        className="btn-secondary mt-3"
        disabled={atMax}
        onClick={() => onAdd(channel)}
        title={atMax ? `A channel can have at most ${MAX_ACTIVE_STAGES_PER_CHANNEL} active stages` : undefined}
      >
        <Plus size={16} />
        Add Stage
      </button>
    </div>
  )
}

export function OutreachSequencesSettings() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['outreach-sequence-stages'], queryFn: outreachSequencesApi.list })
  const { data: templatesData } = useQuery({ queryKey: ['templates'], queryFn: templatesApi.list })
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<{ stage: OutreachSequenceStage; affectedCount: number } | null>(null)

  const stages = data?.stages ?? []
  const templatesByChannel = (channel: OutreachChannel) =>
    (templatesData?.templates ?? []).filter((t) => TEMPLATE_TYPE_CHANNEL[t.template_type] === channel)

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['outreach-sequence-stages'] })
  }

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<OutreachSequenceStage> }) => outreachSequencesApi.update(id, patch),
    onSuccess: invalidate,
    onError: (e: any) => setError(e?.message ?? 'Could not update stage'),
  })

  const createMutation = useMutation({
    mutationFn: (channel: OutreachChannel) => outreachSequencesApi.create({ channel }),
    onSuccess: invalidate,
    onError: (e: any) => setError(e?.message ?? 'Could not add stage'),
  })

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => outreachSequencesApi.deactivate(id),
    onSuccess: () => {
      invalidate()
      setConfirming(null)
    },
    onError: (e: any) => {
      setError(e?.message ?? 'Could not remove stage')
      setConfirming(null)
    },
  })

  /** Dry-runs the deactivation first so the confirmation dialog can show the
   * real affected-lead count before anything actually changes. */
  async function requestRemove(stage: OutreachSequenceStage) {
    setError(null)
    try {
      const result = await outreachSequencesApi.deactivate(stage.id, true)
      setConfirming({ stage, affectedCount: result.affected_lead_count })
    } catch (e: any) {
      setError(e?.message ?? 'Could not check this stage')
    }
  }

  return (
    <div className="card p-6">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-base-300">Outreach Sequences</h2>
      <p className="mb-4 text-xs text-base-400">
        Define exactly how many outreach stages exist per channel, the interval between each, and an optional default
        template pre-assigned to each stage. Removing a stage never deletes any lead's history — it just stops being
        offered for new outreach going forward.
      </p>

      {error && (
        <div className="mb-3 flex items-start gap-2 rounded-lg bg-danger-bg px-3 py-2.5 text-sm text-danger">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {confirming && (
        <div className="mb-3 space-y-2 rounded-lg border border-warn/30 bg-warn-bg px-3 py-2.5 text-sm text-warn">
          <p>
            {confirming.affectedCount > 0
              ? `${confirming.affectedCount} lead${confirming.affectedCount === 1 ? '' : 's'} have history on "${confirming.stage.stage_label}" — it will stop being tracked for new outreach, but nothing is deleted.`
              : `Remove "${confirming.stage.stage_label}"? It can be re-added later, but this won't restore its position.`}{' '}
            Continue?
          </p>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setConfirming(null)}>Cancel</button>
            <button className="btn-danger" disabled={deactivateMutation.isPending} onClick={() => deactivateMutation.mutate(confirming.stage.id)}>
              {deactivateMutation.isPending ? 'Removing…' : 'Remove Stage'}
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-base-400">Loading sequences…</p>
      ) : (
        <div className="space-y-4">
          {CHANNELS.map(({ key, label, icon, initialTouchLabel }) => (
            <ChannelSection
              key={key}
              channel={key}
              label={label}
              icon={icon}
              initialTouchLabel={initialTouchLabel}
              stages={stages.filter((s) => s.channel === key)}
              templates={templatesByChannel(key)}
              onUpdate={(id, patch) => {
                setError(null)
                updateMutation.mutate({ id, patch })
              }}
              onRemove={requestRemove}
              onAdd={(channel) => {
                setError(null)
                createMutation.mutate(channel)
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
