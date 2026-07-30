import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { LifeBuoy, X, Send, CheckCircle2 } from 'lucide-react'
import { platformBrandingApi, supportContactsApi } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

export interface AffiliateHelpContext {
  fullName: string
  email: string
  referralCode: string
}

/** Floating Help button — Admin/User/Affiliate (the Super Admin IS the
 * support contact, so it'd make no sense to show it to them). Hidden
 * entirely if the Super Admin has cleared their support email. Submits
 * directly in-app (no mailto: — that turned out to be unreliable across
 * browsers/OS mail-handler setups); the Super Admin reviews these in Support
 * Contacts. When rendered on the Affiliate Dashboard, the caller passes
 * `affiliateContext` — the message field becomes optional (defaults to a
 * generic line) and the affiliate's identifying info is folded into what
 * gets submitted, so the Super Admin can tell who's asking without the
 * affiliate having to type it themselves. */
export function HelpWidget({ affiliateContext }: { affiliateContext?: AffiliateHelpContext } = {}) {
  const { profile } = useAuth()
  const containerRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [justSent, setJustSent] = useState(false)

  const { data } = useQuery({ queryKey: ['platform-branding'], queryFn: platformBrandingApi.get })

  useEffect(() => {
    if (profile?.email) setEmail(profile.email)
  }, [profile?.email])

  const sendMutation = useMutation({
    mutationFn: (payload: { email: string; message: string }) => supportContactsApi.create(payload),
    onSuccess: () => {
      setJustSent(true)
      setMessage('')
      setTimeout(() => {
        setJustSent(false)
        setOpen(false)
      }, 1800)
    },
  })

  useEffect(() => {
    if (!open) return
    function handlePointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  if (!profile || profile.role === 'super_admin') return null
  if (!data || !data.support_email) return null

  const canSend = email.trim().length > 0 && (Boolean(affiliateContext) || message.trim().length > 0) && !sendMutation.isPending

  function handleSubmit() {
    if (!canSend) return
    let finalMessage = message.trim()
    if (affiliateContext) {
      const body = finalMessage || 'I need help with my Affiliate account.'
      finalMessage = `Support Request from Affiliate: ${affiliateContext.fullName}\n\n${body}\n\nReferral Code: ${affiliateContext.referralCode}`
    }
    sendMutation.mutate({ email: email.trim(), message: finalMessage })
  }

  return (
    <div ref={containerRef} className="fixed bottom-5 right-5 z-40 sm:bottom-6 sm:right-6">
      {open && (
        <div className="absolute bottom-full right-0 mb-3 w-72 rounded-xl border border-base-700/60 bg-base-900 p-4 shadow-lg animate-fadeIn sm:w-80">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-base-100">Need help?</h3>
            <button onClick={() => setOpen(false)} className="btn-ghost h-8 w-8 px-0" aria-label="Close">
              <X size={15} />
            </button>
          </div>

          {justSent ? (
            <div className="flex flex-col items-center gap-2 py-4 text-center">
              <CheckCircle2 size={28} className="text-success" />
              <p className="text-sm text-base-200">Thanks! We've received your message.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="label">Your Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="input text-sm"
                />
              </div>
              <div>
                <label className="label">What do you need help with?</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={affiliateContext ? 'Briefly describe your issue… (optional)' : 'Briefly describe your issue…'}
                  rows={3}
                  className="input resize-none text-sm"
                />
              </div>
              {sendMutation.isError && <p className="text-xs text-danger">{(sendMutation.error as Error).message}</p>}
              <button className="btn-secondary w-full justify-center" disabled={!canSend} onClick={handleSubmit}>
                <Send size={15} />
                {sendMutation.isPending ? 'Sending…' : 'Send'}
              </button>
            </div>
          )}
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-500 text-white shadow-glow transition-transform hover:scale-105"
        aria-label="Need help?"
      >
        <LifeBuoy size={22} />
      </button>
    </div>
  )
}
