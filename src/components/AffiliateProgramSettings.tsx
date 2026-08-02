import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2 } from 'lucide-react'
import { affiliateSettingsApi } from '@/lib/api'

const TEMPLATE_HELP = 'Merge fields available: {{affiliate_name}}, {{referral_link}}, {{price}}, {{platform_name}}'

export function AffiliateProgramSettings() {
  const queryClient = useQueryClient()
  const { data } = useQuery({ queryKey: ['affiliate-settings'], queryFn: affiliateSettingsApi.get })

  const [enabled, setEnabled] = useState(false)
  const [firstPct, setFirstPct] = useState('20')
  const [recurringPct, setRecurringPct] = useState('10')
  const [durationType, setDurationType] = useState<'lifetime' | 'capped'>('lifetime')
  const [durationCount, setDurationCount] = useState('')
  const [minWithdrawal, setMinWithdrawal] = useState('')
  const [terms, setTerms] = useState('')
  const [fbTemplate, setFbTemplate] = useState('')
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [promoHeadline, setPromoHeadline] = useState('')
  const [promoSubheadline, setPromoSubheadline] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!data) return
    setEnabled(data.affiliate_program_enabled)
    setFirstPct(String(data.affiliate_first_payment_commission_pct))
    setRecurringPct(String(data.affiliate_recurring_commission_pct))
    setDurationType(data.affiliate_recurring_duration_type)
    setDurationCount(data.affiliate_recurring_duration_count != null ? String(data.affiliate_recurring_duration_count) : '')
    setMinWithdrawal(data.affiliate_min_withdrawal_usd != null ? String(data.affiliate_min_withdrawal_usd) : '')
    setTerms(data.affiliate_program_terms ?? '')
    setFbTemplate(data.affiliate_fb_post_template ?? '')
    setEmailSubject(data.affiliate_email_subject_template ?? '')
    setEmailBody(data.affiliate_email_body_template ?? '')
    setPromoHeadline(data.affiliate_promo_headline ?? '')
    setPromoSubheadline(data.affiliate_promo_subheadline ?? '')
  }, [data])

  const saveMutation = useMutation({
    mutationFn: () =>
      affiliateSettingsApi.update({
        affiliate_program_enabled: enabled,
        affiliate_first_payment_commission_pct: Number(firstPct),
        affiliate_recurring_commission_pct: Number(recurringPct),
        affiliate_recurring_duration_type: durationType,
        affiliate_recurring_duration_count: durationType === 'capped' && durationCount ? Number(durationCount) : null,
        affiliate_min_withdrawal_usd: minWithdrawal ? Number(minWithdrawal) : null,
        affiliate_program_terms: terms.trim() || null,
        affiliate_fb_post_template: fbTemplate.trim() || null,
        affiliate_email_subject_template: emailSubject.trim() || null,
        affiliate_email_body_template: emailBody.trim() || null,
        affiliate_promo_headline: promoHeadline.trim() || null,
        affiliate_promo_subheadline: promoSubheadline.trim() || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['affiliate-settings'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  return (
    <div className="card p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-base-300">Affiliate Program</h2>
          <p className="mt-1 text-xs text-base-400">No payment gateway involved — all commission payouts are manual, tracked here.</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-base-200">
          <input type="checkbox" className="h-4 w-4 rounded border-base-600 bg-base-800" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Enable Affiliate Program
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="label">First-Payment Commission (%)</label>
          <input type="number" min={0} max={100} step={0.01} className="input" value={firstPct} onChange={(e) => setFirstPct(e.target.value)} />
        </div>
        <div>
          <label className="label">Recurring Commission (%)</label>
          <input type="number" min={0} max={100} step={0.01} className="input" value={recurringPct} onChange={(e) => setRecurringPct(e.target.value)} />
        </div>
        <div>
          <label className="label">Recurring Duration</label>
          <select className="input" value={durationType} onChange={(e) => setDurationType(e.target.value as 'lifetime' | 'capped')}>
            <option value="lifetime">Lifetime</option>
            <option value="capped">Capped (# of renewals)</option>
          </select>
          {durationType === 'capped' && (
            <input type="number" min={1} className="input mt-2" value={durationCount} onChange={(e) => setDurationCount(e.target.value)} placeholder="e.g. 12" />
          )}
        </div>
        <div>
          <label className="label">Minimum Withdrawal (৳, optional)</label>
          <input type="number" min={0} step={0.01} className="input" value={minWithdrawal} onChange={(e) => setMinWithdrawal(e.target.value)} placeholder="e.g. 1000" />
        </div>
      </div>

      <div className="mt-4">
        <label className="label">Affiliate Program Terms</label>
        <textarea className="input min-h-[90px] resize-y" value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="e.g. Earn 20% on your referral's first payment, and 10% recurring for as long as they stay subscribed." />
      </div>

      <div className="mt-6 border-t border-base-700/60 pt-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-base-400">Marketing Materials Templates</p>
        <p className="mb-3 text-xs text-base-500">{TEMPLATE_HELP}</p>
        <div className="space-y-4">
          <div>
            <label className="label">Facebook Post Template</label>
            <textarea className="input min-h-[80px] resize-y" value={fbTemplate} onChange={(e) => setFbTemplate(e.target.value)} placeholder="e.g. I've been using {{platform_name}} to manage my sales pipeline — starting at {{price}}. Try it: {{referral_link}}" />
          </div>
          <div>
            <label className="label">Email Subject Template</label>
            <input className="input" value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} placeholder="e.g. A tool that helped me close more deals" />
          </div>
          <div>
            <label className="label">Email Body Template</label>
            <textarea className="input min-h-[100px] resize-y" value={emailBody} onChange={(e) => setEmailBody(e.target.value)} placeholder={`Hi,\n\nI wanted to share {{platform_name}} with you — {{referral_link}}\n\n- {{affiliate_name}}`} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">AI Image Prompt Headline</label>
              <input className="input" value={promoHeadline} onChange={(e) => setPromoHeadline(e.target.value)} placeholder="e.g. Join thousands growing their sales pipeline" />
              <p className="mt-1 text-xs text-base-500">Used to build the AI image-generation prompt shown to affiliates — not rendered as an image directly.</p>
            </div>
            <div>
              <label className="label">AI Image Prompt Subheadline</label>
              <input className="input" value={promoSubheadline} onChange={(e) => setPromoSubheadline(e.target.value)} placeholder="e.g. Start your free trial today" />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-base-700/60 pt-4">
        <button className="btn-primary" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
          {saveMutation.isPending ? 'Saving…' : 'Save'}
        </button>
        {saved && (
          <span className="flex items-center gap-1 text-sm text-success">
            <CheckCircle2 size={16} /> Saved
          </span>
        )}
      </div>
    </div>
  )
}
