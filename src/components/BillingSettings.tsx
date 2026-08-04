import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2 } from 'lucide-react'
import { billingApi } from '@/lib/api'

const PLACEHOLDER_INSTRUCTIONS =
  'e.g. Pay via Payoneer to payments@yourcompany.com, or use our request link: https://payoneer.com/your-request-link. Please include your Organization name as the payment reference.'

const PLACEHOLDER_BENEFITS = `e.g. one bullet per line:
Priority support response within 24 hours
Free onboarding call with our team
Price locked in for life — never increases
Unlimited leads and deals`

export function BillingSettings() {
  const queryClient = useQueryClient()
  const { data } = useQuery({ queryKey: ['billing-settings'], queryFn: billingApi.getSettings })

  const [paymentInstructions, setPaymentInstructions] = useState('')
  const [promotionalBannerText, setPromotionalBannerText] = useState('')
  const [earlyBirdThreshold, setEarlyBirdThreshold] = useState('50')
  const [earlyBirdPrice, setEarlyBirdPrice] = useState('499')
  const [standardPrice, setStandardPrice] = useState('999')
  const [gracePeriodDays, setGracePeriodDays] = useState('0')
  const [subscriptionWarningDays, setSubscriptionWarningDays] = useState('5')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!data) return
    setPaymentInstructions(data.payment_instructions ?? '')
    setPromotionalBannerText(data.promotional_banner_text ?? '')
    setEarlyBirdThreshold(String(data.early_bird_threshold))
    setEarlyBirdPrice(String(data.early_bird_price_usd))
    setStandardPrice(String(data.standard_price_usd))
    setGracePeriodDays(String(data.grace_period_days))
    setSubscriptionWarningDays(String(data.subscription_warning_days))
  }, [data])

  const dirty =
    Boolean(data) &&
    (paymentInstructions.trim() !== (data!.payment_instructions ?? '') ||
      promotionalBannerText.trim() !== (data!.promotional_banner_text ?? '') ||
      Number(earlyBirdThreshold) !== data!.early_bird_threshold ||
      Number(earlyBirdPrice) !== data!.early_bird_price_usd ||
      Number(standardPrice) !== data!.standard_price_usd ||
      Number(gracePeriodDays) !== data!.grace_period_days ||
      Number(subscriptionWarningDays) !== data!.subscription_warning_days)

  const saveMutation = useMutation({
    mutationFn: () =>
      billingApi.updateSettings({
        payment_instructions: paymentInstructions.trim() || null,
        promotional_banner_text: promotionalBannerText.trim() || null,
        early_bird_threshold: Number(earlyBirdThreshold),
        early_bird_price_usd: Number(earlyBirdPrice),
        standard_price_usd: Number(standardPrice),
        grace_period_days: Number(gracePeriodDays),
        subscription_warning_days: Number(subscriptionWarningDays),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing-settings'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  return (
    <div className="card p-6">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-base-300">Billing Settings</h2>
      <p className="mb-5 text-xs text-base-400">
        Configures the pricing shown on the public Request Access form and the "How to Pay" instructions requesters
        see before and after submitting. No payment gateway is involved — all actual payment happens manually,
        outside the app. Annual billing gets a 20% discount at every tier automatically — no separate setting needed.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className="label">Early Bird Threshold</label>
          <input
            type="number"
            min={0}
            step={1}
            className="input"
            value={earlyBirdThreshold}
            onChange={(e) => setEarlyBirdThreshold(e.target.value)}
          />
          <p className="mt-1 text-xs text-base-500">First N organizations ever created</p>
        </div>
        <div>
          <label className="label">Early Bird Price (৳/month)</label>
          <input
            type="number"
            min={0}
            step={0.01}
            className="input"
            value={earlyBirdPrice}
            onChange={(e) => setEarlyBirdPrice(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Standard Price (৳/month)</label>
          <input
            type="number"
            min={0}
            step={0.01}
            className="input"
            value={standardPrice}
            onChange={(e) => setStandardPrice(e.target.value)}
          />
        </div>
      </div>

      <div className="mt-4">
        <label className="label">Payment Instructions</label>
        <textarea
          className="input min-h-[90px] resize-y"
          value={paymentInstructions}
          onChange={(e) => setPaymentInstructions(e.target.value)}
          placeholder={PLACEHOLDER_INSTRUCTIONS}
        />
        <p className="mt-1 text-xs text-base-500">Shown on the Request Access form and its confirmation screen.</p>
      </div>

      <div className="mt-4">
        <label className="label">Promotional Banner Text (Benefits)</label>
        <textarea
          className="input min-h-[110px] resize-y"
          value={promotionalBannerText}
          onChange={(e) => setPromotionalBannerText(e.target.value)}
          placeholder={PLACEHOLDER_BENEFITS}
        />
        <p className="mt-1 text-xs text-base-500">
          One benefit per line — shown as a bullet list in the Early Bird promotional banner on Request Access, only
          while Early Bird spots remain.
        </p>
      </div>

      <div className="mt-4">
        <label className="label">Grace Period (days)</label>
        <input
          type="number"
          min={0}
          step={1}
          className="input w-32"
          value={gracePeriodDays}
          onChange={(e) => setGracePeriodDays(e.target.value)}
        />
        <p className="mt-1 text-xs text-base-500">
          Extra days after a subscription's end date before access is blocked. Defaults to 0 (immediate cutoff).
        </p>
      </div>

      <div className="mt-4">
        <label className="label">Subscription Warning Threshold (days)</label>
        <input
          type="number"
          min={0}
          step={1}
          className="input w-32"
          value={subscriptionWarningDays}
          onChange={(e) => setSubscriptionWarningDays(e.target.value)}
        />
        <p className="mt-1 text-xs text-base-500">
          How many days before a subscription's end date the Organization's Dashboard warning banner appears, and
          the Billing dashboard marks it "Due Soon." Defaults to 5.
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-base-700/60 pt-4">
        <button className="btn-primary" disabled={!dirty || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
          {saveMutation.isPending ? 'Saving…' : 'Save'}
        </button>
        {saved && (
          <span className="flex items-center gap-1 text-sm text-success">
            <CheckCircle2 size={16} />
            Saved
          </span>
        )}
      </div>
    </div>
  )
}
