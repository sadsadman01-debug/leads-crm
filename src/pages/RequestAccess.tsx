import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Building2, ArrowLeft, AlertCircle, Loader2, CheckCircle2, Sparkles, PartyPopper, X, Tag, Wallet } from 'lucide-react'
import { signupRequestsApi, billingApi, promoCodesApi, referralClicksApi, pageViewsApi, orgReferralsApi } from '@/lib/api'
import { usePlatformBranding } from '@/hooks/usePlatformBranding'
import { PreAuthHelpWidget } from '@/components/PreAuthHelpWidget'
import { CopyButton } from '@/components/TempPasswordResult'
import { PRICING_TIER_LABELS, type BillingCycle } from '@/types/billing'
import { COUNTRIES } from '@/lib/countries'
import { ALLOWED_SIGNUP_COUNTRIES } from '@/lib/allowedSignupCountries'

export function RequestAccess() {
  usePlatformBranding()
  const [searchParams] = useSearchParams()
  const referralCode = searchParams.get('ref')?.trim() || null
  // Business Referral Program — a separate, distinguishable link parameter
  // from the Affiliate Program's ?ref= above; mutually exclusive in practice.
  const orgReferralCode = searchParams.get('org_ref')?.trim() || null
  const [organizationName, setOrganizationName] = useState('')
  const [contactName, setContactName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')
  const [city, setCity] = useState('')
  const [country, setCountry] = useState('')
  const [zipCode, setZipCode] = useState('')
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly')
  const [bannerDismissed, setBannerDismissed] = useState(() => sessionStorage.getItem('early-bird-banner-dismissed') === '1')
  const [promoCode, setPromoCode] = useState('')
  const [promoError, setPromoError] = useState<string | null>(null)
  const [appliedPromo, setAppliedPromo] = useState<{ code: string; discount_type: 'flat' | 'percent'; discount_value: number } | null>(null)

  // Logged once per page load, before the visitor necessarily submits
  // anything — this is what makes the affiliate conversion funnel's "Link
  // Clicks" stage accurate rather than just inferred from eventual signups.
  // Fire-and-forget: never awaited, never blocks rendering.
  const loggedClickRef = useRef(false)
  useEffect(() => {
    if (referralCode && !loggedClickRef.current) {
      loggedClickRef.current = true
      referralClicksApi.log(referralCode).catch(() => {})
    }
  }, [referralCode])

  const loggedOrgClickRef = useRef(false)
  useEffect(() => {
    if (orgReferralCode && !loggedOrgClickRef.current) {
      loggedOrgClickRef.current = true
      orgReferralsApi.logClick(orgReferralCode).catch(() => {})
    }
  }, [orgReferralCode])

  // Platform-wide aggregate view of every visit (referred or not) — logged
  // once per page load, complementary to the per-affiliate referral click
  // logged above. Fire-and-forget: never awaited, never blocks rendering.
  const loggedPageViewRef = useRef(false)
  useEffect(() => {
    if (!loggedPageViewRef.current) {
      loggedPageViewRef.current = true
      pageViewsApi.log('request_access', referralCode).catch(() => {})
    }
  }, [referralCode])

  const { data: pricing } = useQuery({ queryKey: ['public-pricing'], queryFn: billingApi.getPublicPricing })

  const countryNotAllowed = country !== '' && !ALLOWED_SIGNUP_COUNTRIES.includes(country)

  const applyPromoMutation = useMutation({
    mutationFn: () => promoCodesApi.validate(promoCode.trim()),
    onSuccess: (data) => {
      setAppliedPromo(data)
      setPromoError(null)
    },
    onError: (err) => {
      setAppliedPromo(null)
      setPromoError((err as Error).message)
    },
  })

  const discountAmount =
    appliedPromo && pricing
      ? appliedPromo.discount_type === 'percent'
        ? Math.round(pricing.monthly_price_usd * (appliedPromo.discount_value / 100))
        : Math.min(Math.round(appliedPromo.discount_value), pricing.monthly_price_usd)
      : 0
  const finalMonthlyPrice = pricing ? Math.max(pricing.monthly_price_usd - discountAmount, 0) : null

  const mutation = useMutation({
    mutationFn: () =>
      signupRequestsApi.create({
        organization_name: organizationName.trim(),
        contact_name: contactName.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        message: message.trim() || undefined,
        city: city.trim(),
        country,
        zip_code: zipCode.trim(),
        billing_cycle: billingCycle,
        ...(referralCode ? { ref: referralCode } : {}),
        ...(orgReferralCode ? { org_ref: orgReferralCode } : {}),
        ...(appliedPromo ? { promo_code: appliedPromo.code } : {}),
      }),
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    mutation.mutate()
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-base-950 px-4 py-8 animate-fadeIn">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.4]"
          style={{
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
            maskImage: 'radial-gradient(ellipse 60% 50% at 50% 40%, black 20%, transparent 75%)',
            WebkitMaskImage: 'radial-gradient(ellipse 60% 50% at 50% 40%, black 20%, transparent 75%)',
          }}
        />
        <div className="absolute left-1/2 top-1/3 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-500/10 blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 h-[300px] w-[300px] rounded-full bg-accent-500/5 blur-[100px]" />
      </div>

      <div className="card relative w-full max-w-md p-8 animate-slideUp">
        {mutation.isSuccess ? (
          <div className="flex flex-col items-center text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-success/15">
              <CheckCircle2 size={26} className="text-success" />
            </div>
            <h1 className="text-xl font-semibold text-base-100">Request submitted</h1>
            <p className="mt-2 text-sm text-base-400">
              Thanks! Your request has been submitted. Our team will review it and reach out to you by email soon.
            </p>
            {mutation.data && (
              <div className="mt-4 w-full rounded-lg border border-accent-500/40 bg-base-850 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-base-400">Your Payment Reference Code</p>
                <p className="mt-1 select-all font-mono text-2xl font-bold tracking-widest text-accent-400">{mutation.data.payment_reference_code}</p>
                <div className="mt-2 flex justify-center">
                  <CopyButton text={mutation.data.payment_reference_code} label="Copy Reference Code" />
                </div>
                <p className="mt-3 text-xs text-warn">
                  ⚠️ IMPORTANT: You MUST include this exact reference code when sending your payment (e.g., in the "Reference," "Note," or "Remarks" field
                  of your bKash, Nagad, Rocket, or bank transfer). Payments received without this reference code cannot be matched to your account and may
                  cause delays or rejection of your application.
                </p>
              </div>
            )}
            {pricing && (
              <div className="mt-4 w-full rounded-lg bg-base-850 p-3 text-left text-sm">
                <p className="text-base-200">
                  Your locked-in rate:{' '}
                  <strong className="text-base-100">
                    {billingCycle === 'annual' ? `৳${Math.round(pricing.annual_total_usd)}/year` : `৳${pricing.monthly_price_usd}/month`}
                  </strong>{' '}
                  <span className="text-base-500">
                    ({PRICING_TIER_LABELS[pricing.pricing_tier]}, {billingCycle === 'annual' ? 'billed annually' : 'billed monthly'})
                  </span>
                </p>
                {pricing.payment_instructions && (
                  <p className="mt-2 whitespace-pre-wrap text-xs text-base-400">{pricing.payment_instructions}</p>
                )}
                <p className="mt-2 text-xs text-base-500">Our team will review your request and confirm payment details with you.</p>
              </div>
            )}
            {mutation.data && (
              <Link to={`/pay?token=${mutation.data.payment_token}`} className="btn-primary mt-4 w-full">
                <Wallet size={16} />
                Continue to Payment Instructions
              </Link>
            )}
            <Link to="/login" className="btn-secondary mt-3 w-full">
              <ArrowLeft size={16} />
              Back to Sign In
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-8 flex flex-col items-center text-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent-500 shadow-glow">
                <Building2 size={24} className="text-white" />
              </div>
              <h1 className="text-xl font-semibold text-base-100">Request Access</h1>
              <p className="mt-1 text-sm text-base-400">
                Tell us a bit about your business and we'll set up your account.
              </p>
            </div>

            {pricing?.pricing_tier === 'early_bird' && !bannerDismissed && (
              <div className="relative mb-4 rounded-xl border border-accent-500/40 bg-gradient-to-br from-accent-500/15 to-accent-500/5 p-4">
                <button
                  type="button"
                  aria-label="Dismiss"
                  className="absolute right-2 top-2 text-base-400 hover:text-base-100"
                  onClick={() => {
                    sessionStorage.setItem('early-bird-banner-dismissed', '1')
                    setBannerDismissed(true)
                  }}
                >
                  <X size={15} />
                </button>
                <p className="flex items-center justify-center gap-1.5 text-center text-sm font-semibold text-accent-400">
                  <PartyPopper size={15} />
                  🎉 Early Bird pricing: ৳{pricing.monthly_price_usd}/month
                </p>
                <p className="mt-1 text-center text-xs text-base-400">
                  <span className="line-through">৳{pricing.standard_price_usd}/month</span>{' '}
                  <span className="font-medium text-success">save ৳{pricing.standard_price_usd - pricing.monthly_price_usd}/month</span>
                </p>
                <p className="mt-1 text-center text-xs font-medium text-warn">Only {pricing.spots_remaining} Early Bird spots left!</p>
                {pricing.promotional_benefits.length > 0 && (
                  <ul className="mt-3 space-y-1.5 text-xs text-base-300">
                    {pricing.promotional_benefits.map((benefit, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-accent-400" />
                        {benefit}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {pricing && (
              <div className="mb-6 rounded-xl border border-base-700/60 bg-base-850 p-4">
                {pricing.pricing_tier === 'standard' && (
                  <p className="mb-3 flex items-center justify-center gap-1.5 text-sm font-semibold text-base-200">
                    <Sparkles size={15} className="text-accent-400" />
                    Pricing: ৳{pricing.monthly_price_usd}/month
                  </p>
                )}
                <div className="flex gap-2">
                  {(['monthly', 'annual'] as BillingCycle[]).map((cycle) => {
                    const price = cycle === 'monthly' ? pricing.monthly_price_usd : pricing.annual_total_usd
                    const standardPrice = cycle === 'monthly' ? pricing.standard_price_usd : pricing.standard_annual_total_usd
                    const showStandard = pricing.pricing_tier === 'early_bird' && standardPrice > price
                    return (
                      <button
                        key={cycle}
                        type="button"
                        onClick={() => setBillingCycle(cycle)}
                        className={`flex-1 rounded-lg border px-3 py-2.5 text-center text-sm transition-colors ${
                          billingCycle === cycle
                            ? 'border-accent-500 bg-accent-500/15 text-accent-400'
                            : 'border-base-700/60 text-base-300 hover:bg-base-800'
                        }`}
                      >
                        <span className="block font-semibold">
                          {showStandard && <span className="mr-1.5 font-normal text-base-500 line-through">৳{Math.round(standardPrice)}</span>}
                          ৳{Math.round(price)}
                          {cycle === 'monthly' ? '/mo' : '/yr'}
                        </span>
                        <span className="block text-xs text-base-400">{cycle === 'monthly' ? 'Monthly' : 'Annual (save 20%)'}</span>
                      </button>
                    )
                  })}
                </div>
                <div className="mt-3 border-t border-base-700/60 pt-3">
                  <label className="label" htmlFor="promo-code">Promo Code (optional)</label>
                  <div className="flex gap-2">
                    <input
                      id="promo-code"
                      className="input min-w-0 flex-1"
                      value={promoCode}
                      disabled={Boolean(appliedPromo)}
                      onChange={(e) => {
                        setPromoCode(e.target.value)
                        setPromoError(null)
                      }}
                      placeholder="e.g. WELCOME15"
                    />
                    {appliedPromo ? (
                      <button
                        type="button"
                        className="btn-secondary shrink-0"
                        onClick={() => {
                          setAppliedPromo(null)
                          setPromoCode('')
                          setPromoError(null)
                        }}
                      >
                        Remove
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn-secondary shrink-0"
                        disabled={!promoCode.trim() || applyPromoMutation.isPending}
                        onClick={() => applyPromoMutation.mutate()}
                      >
                        {applyPromoMutation.isPending ? 'Checking…' : 'Apply'}
                      </button>
                    )}
                  </div>
                  {promoError && (
                    <p className="mt-1.5 flex items-center gap-1.5 text-xs text-danger">
                      <AlertCircle size={13} className="shrink-0" />
                      {promoError}
                    </p>
                  )}
                  {appliedPromo && billingCycle === 'monthly' && (
                    <div className="mt-1.5 flex items-center gap-1.5 text-xs text-success">
                      <CheckCircle2 size={13} className="shrink-0" />
                      <span>
                        <span className="line-through text-base-500">৳{pricing.monthly_price_usd}</span>{' '}
                        −৳{discountAmount} ({appliedPromo.code}) ={' '}
                        <strong>৳{finalMonthlyPrice}/mo</strong>
                      </span>
                    </div>
                  )}
                  {appliedPromo && billingCycle === 'annual' && (
                    <p className="mt-1.5 flex items-center gap-1.5 text-xs text-success">
                      <CheckCircle2 size={13} className="shrink-0" />
                      <Tag size={13} className="shrink-0" />
                      {appliedPromo.code} applied — discount applies to the monthly rate only.
                    </p>
                  )}
                </div>
                {pricing.payment_instructions && (
                  <p className="mt-3 whitespace-pre-wrap text-xs text-base-500">{pricing.payment_instructions}</p>
                )}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label" htmlFor="organization-name">Organization / Company Name</label>
                <input
                  id="organization-name"
                  required
                  autoFocus
                  className="input"
                  value={organizationName}
                  onChange={(e) => setOrganizationName(e.target.value)}
                  placeholder="Acme Inc."
                />
              </div>

              <div>
                <label className="label" htmlFor="contact-name">Contact Name</label>
                <input
                  id="contact-name"
                  required
                  className="input"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Jane Smith"
                />
              </div>

              <div>
                <label className="label" htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  className="input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jane@acme.com"
                />
              </div>

              <div>
                <label className="label" htmlFor="phone">Phone (optional)</label>
                <input
                  id="phone"
                  type="tel"
                  className="input"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 555 123 4567"
                />
              </div>

              <div>
                <label className="label" htmlFor="message">Tell us about your business (optional)</label>
                <textarea
                  id="message"
                  className="input min-h-[90px] resize-y"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="What are you hoping to use this for?"
                />
              </div>

              <div className="space-y-3 border-t border-base-700/60 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-base-400">Address</p>
                <div>
                  <label className="label" htmlFor="country">Country</label>
                  <select id="country" required className="input" value={country} onChange={(e) => setCountry(e.target.value)}>
                    <option value="" disabled>
                      Select a country…
                    </option>
                    {COUNTRIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="city">City</label>
                    <input
                      id="city"
                      required
                      className="input"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Dhaka"
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="zip-code">ZIP/Postal Code</label>
                    <input
                      id="zip-code"
                      required
                      className="input"
                      value={zipCode}
                      onChange={(e) => setZipCode(e.target.value)}
                      placeholder="1207"
                    />
                  </div>
                </div>
              </div>

              {countryNotAllowed && (
                <div className="flex items-center gap-2.5 rounded-lg bg-warn-bg px-3 py-2.5 text-sm text-warn animate-fadeIn">
                  <AlertCircle size={16} className="shrink-0" />
                  Leadify is currently only available in Bangladesh. We'll be expanding to more countries soon — thank you for your interest!
                </div>
              )}

              {mutation.isError && (
                <div className="flex items-center gap-2 rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger animate-fadeIn">
                  <AlertCircle size={16} className="shrink-0" />
                  {(mutation.error as Error).message}
                </div>
              )}

              <button
                type="submit"
                disabled={mutation.isPending || countryNotAllowed}
                className="btn-primary w-full hover:scale-[1.01] active:scale-[0.98]"
              >
                {mutation.isPending ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Submitting…
                  </>
                ) : (
                  'Submit Request'
                )}
              </button>

              <Link to="/login" className="btn-ghost w-full justify-center">
                <ArrowLeft size={16} />
                Back to Sign In
              </Link>
            </form>
          </>
        )}
      </div>
      <PreAuthHelpWidget defaultEmail={email} organizationName={organizationName} />
    </div>
  )
}
