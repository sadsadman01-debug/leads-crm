import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { LifeBuoy, X, Mail } from 'lucide-react'
import { platformBrandingApi, supportContactsApi } from '@/lib/api'

/** Same floating Help button as the authenticated `HelpWidget`, for the
 * pre-login screens (Login, Request Access, Forgot Password) — no session,
 * so there's no organization/nickname/role to include in the email, and the
 * click is logged via the public, IP-throttled endpoint instead. */
export function PreAuthHelpWidget({
  contextLines = [],
}: {
  /** Optional extra "Label: value" lines for helpful context — e.g. Request
   * Access's already-typed Organization Name/Email. Blank values are skipped. */
  contextLines?: Array<{ label: string; value: string }>
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')

  const { data } = useQuery({ queryKey: ['platform-branding'], queryFn: platformBrandingApi.get })

  const logMutation = useMutation({
    mutationFn: (payload: { message_preview?: string | null }) => supportContactsApi.createPublic(payload),
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

  function handleSendEmail() {
    const base = message.trim() || 'I need help logging in / accessing Leads CRM.'
    const extra = contextLines
      .filter((l) => l.value.trim())
      .map((l) => `${l.label}: ${l.value.trim()}`)
      .join('\n')
    const body = extra ? `${base}\n\n${extra}` : base

    const subject = encodeURIComponent('Support Request from Login Page')
    window.location.href = `mailto:${data!.support_email}?subject=${subject}&body=${encodeURIComponent(body)}`
    logMutation.mutate({ message_preview: message.trim() || null })
    setOpen(false)
    setMessage('')
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

          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Briefly describe what you need help with (optional)…"
            rows={3}
            className="input mb-3 resize-none text-sm"
          />

          <button className="btn-secondary w-full justify-center" onClick={handleSendEmail}>
            <Mail size={15} />
            Send Email
          </button>
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
