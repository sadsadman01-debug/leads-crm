import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { LifeBuoy, X, Send, CheckCircle2 } from 'lucide-react'
import { platformBrandingApi, supportContactsApi } from '@/lib/api'

/** Same floating Help button as the authenticated `HelpWidget`, for the
 * pre-login screens (Login, Request Access, Forgot Password) — no session,
 * so there's no account email to prefill, and the submission goes through
 * the public, IP-throttled endpoint instead. Submits directly in-app (no
 * mailto:). */
export function PreAuthHelpWidget({
  defaultEmail = '',
  organizationName = '',
}: {
  /** Pre-fills the email field — e.g. Request Access's already-typed Email. */
  defaultEmail?: string
  /** Prepended to the message for context — e.g. Request Access's already-typed Organization Name. */
  organizationName?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState(defaultEmail)
  const [message, setMessage] = useState('')
  const [justSent, setJustSent] = useState(false)

  const { data } = useQuery({ queryKey: ['platform-branding'], queryFn: platformBrandingApi.get })

  useEffect(() => {
    if (defaultEmail) setEmail(defaultEmail)
  }, [defaultEmail])

  const sendMutation = useMutation({
    mutationFn: (payload: { email: string; message: string }) => supportContactsApi.createPublic(payload),
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

  if (!data || !data.support_email) return null

  const canSend = email.trim().length > 0 && message.trim().length > 0 && !sendMutation.isPending

  function handleSubmit() {
    if (!canSend) return
    const finalMessage = organizationName.trim()
      ? `${message.trim()}\n\nOrganization: ${organizationName.trim()}`
      : message.trim()
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
                  placeholder="Briefly describe your issue…"
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
