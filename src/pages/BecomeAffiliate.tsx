import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Handshake, ArrowLeft, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react'
import { affiliateApplicationsApi, affiliateSettingsApi } from '@/lib/api'
import { usePlatformBranding } from '@/hooks/usePlatformBranding'
import { PreAuthHelpWidget } from '@/components/PreAuthHelpWidget'

export function BecomeAffiliate() {
  usePlatformBranding()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [howTheyPlanToPromote, setHowTheyPlanToPromote] = useState('')

  const { data: programInfo } = useQuery({ queryKey: ['public-affiliate-program-info'], queryFn: affiliateSettingsApi.getPublic })

  const mutation = useMutation({
    mutationFn: () =>
      affiliateApplicationsApi.create({
        full_name: fullName.trim(),
        email: email.trim(),
        how_they_plan_to_promote: howTheyPlanToPromote.trim() || undefined,
      }),
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    mutation.mutate()
  }

  if (programInfo && !programInfo.enabled) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-base-950 px-4">
        <div className="card w-full max-w-md p-8 text-center">
          <h1 className="text-xl font-semibold text-base-100">Affiliate Program Not Currently Open</h1>
          <p className="mt-2 text-sm text-base-400">Please check back later, or contact us for more information.</p>
          <Link to="/login" className="btn-secondary mt-6">
            <ArrowLeft size={16} />
            Back to Sign In
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-base-950 px-4 py-8 animate-fadeIn">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/3 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-500/10 blur-[120px]" />
      </div>

      <div className="card relative w-full max-w-md p-8 animate-slideUp">
        {mutation.isSuccess ? (
          <div className="flex flex-col items-center text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-success/15">
              <CheckCircle2 size={26} className="text-success" />
            </div>
            <h1 className="text-xl font-semibold text-base-100">Application submitted</h1>
            <p className="mt-2 text-sm text-base-400">
              Thanks! We'll review your application and reach out by email soon.
            </p>
            <Link to="/login" className="btn-secondary mt-6">
              <ArrowLeft size={16} />
              Back to Sign In
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-6 flex flex-col items-center text-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent-500 shadow-glow">
                <Handshake size={24} className="text-white" />
              </div>
              <h1 className="text-xl font-semibold text-base-100">Become an Affiliate</h1>
              <p className="mt-1 text-sm text-base-400">Earn commission by referring new customers to us.</p>
            </div>

            {programInfo?.terms && (
              <div className="mb-6 rounded-xl border border-base-700/60 bg-base-850 p-4">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-base-400">Program Terms</p>
                <p className="whitespace-pre-wrap text-xs text-base-300">{programInfo.terms}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label" htmlFor="full-name">Full Name</label>
                <input
                  id="full-name"
                  required
                  autoFocus
                  className="input"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
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
                  placeholder="jane@example.com"
                />
              </div>

              <div>
                <label className="label" htmlFor="promote">How do you plan to promote us? (optional)</label>
                <textarea
                  id="promote"
                  className="input min-h-[90px] resize-y"
                  value={howTheyPlanToPromote}
                  onChange={(e) => setHowTheyPlanToPromote(e.target.value)}
                  placeholder="e.g. Facebook group, YouTube channel, email newsletter…"
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
                  'Submit Application'
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
      <PreAuthHelpWidget defaultEmail={email} />
    </div>
  )
}
