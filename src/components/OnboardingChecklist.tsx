import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Circle, PartyPopper, Sparkles, X } from 'lucide-react'
import { onboardingApi } from '@/lib/api'

export function OnboardingChecklist() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data } = useQuery({ queryKey: ['onboarding'], queryFn: onboardingApi.get })
  const [showToast, setShowToast] = useState(false)

  useEffect(() => {
    if (!data?.justCompleted) return
    setShowToast(true)
    const timer = setTimeout(() => setShowToast(false), 5000)
    return () => clearTimeout(timer)
  }, [data?.justCompleted])

  const dismissMutation = useMutation({
    mutationFn: () => onboardingApi.dismiss(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['onboarding'] }),
  })

  if (!data || !data.applicable || data.dismissed) return null
  const showCard = !data.completed || data.justCompleted
  if (!showCard && !showToast) return null

  const pct = data.totalCount > 0 ? Math.round((data.completedCount / data.totalCount) * 100) : 0

  return (
    <>
      {showCard && (
        <div className="card relative overflow-hidden p-6 animate-fadeIn">
          <button
            onClick={() => dismissMutation.mutate()}
            disabled={dismissMutation.isPending}
            className="btn-ghost absolute right-3 top-3 h-9 w-9 px-0"
            aria-label="Hide this"
            title="Hide this"
          >
            <X size={16} />
          </button>

          <div className="mb-1 flex items-center gap-2 pr-10">
            <Sparkles size={18} className="text-accent-400" />
            <h2 className="text-base font-semibold text-base-100">Getting Started</h2>
          </div>
          <p className="mb-4 text-sm text-base-400">
            A few quick steps to get your workspace up and running.
          </p>

          <div className="mb-5">
            <div className="mb-1.5 flex items-center justify-between text-xs text-base-400">
              <span>{data.completedCount} of {data.totalCount} steps complete</span>
              <span>{pct}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-base-800">
              <div
                className="h-full rounded-full bg-accent-500 transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {data.steps.map((step) => (
              <li
                key={step.id}
                className={`flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2.5 transition-colors ${
                  step.done ? 'bg-success-bg' : 'bg-base-850'
                }`}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  {step.done ? (
                    <CheckCircle2 size={17} className="shrink-0 text-success" />
                  ) : (
                    <Circle size={17} className="shrink-0 text-base-500" />
                  )}
                  <span className={`truncate text-sm ${step.done ? 'text-base-200 line-through' : 'text-base-100'}`}>
                    {step.label}
                  </span>
                </div>
                {!step.done && (
                  <button className="btn-secondary shrink-0 px-3 py-1 text-xs" onClick={() => navigate(step.link)}>
                    Go
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {showToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-xl border border-success/30 bg-base-900 px-4 py-3 shadow-soft animate-slideUp">
          <PartyPopper size={18} className="shrink-0 text-success" />
          <span className="text-sm font-medium text-base-100">You're all set up!</span>
        </div>
      )}
    </>
  )
}
