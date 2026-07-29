import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Building2, ArrowLeft, AlertCircle, Loader2, CheckCircle2, Sparkles } from 'lucide-react'
import { signupRequestsApi, billingApi } from '@/lib/api'
import { usePlatformBranding } from '@/hooks/usePlatformBranding'
import { PreAuthHelpWidget } from '@/components/PreAuthHelpWidget'
import { PRICING_TIER_LABELS } from '@/types/billing'

export function RequestAccess() {
  usePlatformBranding()
  const [organizationName, setOrganizationName] = useState('')
  const [contactName, setContactName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')

  const { data: pricing } = useQuery({ queryKey: ['public-pricing'], queryFn: billingApi.getPublicPricing })

  const mutation = useMutation({
    mutationFn: () =>
      signupRequestsApi.create({
        organization_name: organizationName.trim(),
        contact_name: contactName.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        message: message.trim() || undefined,
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
            {pricing && (
              <div className="mt-4 w-full rounded-lg bg-base-850 p-3 text-left text-sm">
                <p className="text-base-200">
                  Your locked-in rate: <strong className="text-base-100">${pricing.monthly_price_usd}/month</strong>{' '}
                  <span className="text-base-500">({PRICING_TIER_LABELS[pricing.pricing_tier]})</span>
                </p>
                {pricing.payment_instructions && (
                  <p className="mt-2 whitespace-pre-wrap text-xs text-base-400">{pricing.payment_instructions}</p>
                )}
                <p className="mt-2 text-xs text-base-500">Our team will review your request and confirm payment details with you.</p>
              </div>
            )}
            <Link to="/login" className="btn-secondary mt-6">
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

            {pricing && (
              <div className="mb-6 rounded-xl border border-accent-500/30 bg-accent-500/10 p-4 text-center">
                <p className="flex items-center justify-center gap-1.5 text-sm font-semibold text-accent-400">
                  <Sparkles size={15} />
                  {pricing.pricing_tier === 'early_bird' ? '🎉 Early Bird pricing' : 'Pricing'}: ${pricing.monthly_price_usd}/month
                </p>
                {pricing.pricing_tier === 'early_bird' && (
                  <p className="mt-1 text-xs text-base-400">Only {pricing.spots_remaining} Early Bird spots left!</p>
                )}
                {pricing.payment_instructions && (
                  <p className="mt-2 whitespace-pre-wrap text-xs text-base-500">{pricing.payment_instructions}</p>
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

              {mutation.isError && (
                <div className="flex items-center gap-2 rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger animate-fadeIn">
                  <AlertCircle size={16} className="shrink-0" />
                  {(mutation.error as Error).message}
                </div>
              )}

              <button type="submit" disabled={mutation.isPending} className="btn-primary w-full hover:scale-[1.01] active:scale-[0.98]">
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
