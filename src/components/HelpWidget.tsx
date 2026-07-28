import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { LifeBuoy, X, MessageCircle, Mail } from 'lucide-react'
import { platformBrandingApi, supportContactsApi } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

/** Floating Help button — Admin/User only (the Super Admin IS the support
 * contact, so it'd make no sense to show it to them). Hidden entirely until
 * the Super Admin has configured at least one contact channel. */
export function HelpWidget() {
  const { profile } = useAuth()
  const containerRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')

  const { data } = useQuery({ queryKey: ['platform-branding'], queryFn: platformBrandingApi.get })

  const logMutation = useMutation({
    mutationFn: (payload: { channel: 'whatsapp' | 'email'; message_preview?: string | null }) =>
      supportContactsApi.create(payload),
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
  if (!data || (!data.support_whatsapp && !data.support_email)) return null

  const orgLabel = profile.organization_name || 'their organization'
  const roleLabel = profile.role === 'admin' ? 'Admin' : 'User'
  const contextLine = `${profile.nickname || 'A team member'} (${roleLabel}) — ${orgLabel}`

  function buildMessage() {
    const base = message.trim() || 'Hi, I need help with Leads CRM.'
    return `${base}\n\n${contextLine}`
  }

  function handleWhatsApp() {
    const digits = data!.support_whatsapp!.replace(/[^\d]/g, '')
    const text = encodeURIComponent(buildMessage())
    window.open(`https://wa.me/${digits}?text=${text}`, '_blank', 'noopener,noreferrer')
    logMutation.mutate({ channel: 'whatsapp', message_preview: message.trim() || null })
    setOpen(false)
    setMessage('')
  }

  function handleEmail() {
    const subject = encodeURIComponent(`Support Request from ${orgLabel}`)
    const body = encodeURIComponent(buildMessage())
    window.location.href = `mailto:${data!.support_email}?subject=${subject}&body=${body}`
    logMutation.mutate({ channel: 'email', message_preview: message.trim() || null })
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

          <div className="space-y-2">
            {data.support_whatsapp && (
              <button className="btn-secondary w-full justify-center" onClick={handleWhatsApp}>
                <MessageCircle size={15} />
                Chat on WhatsApp
              </button>
            )}
            {data.support_email && (
              <button className="btn-secondary w-full justify-center" onClick={handleEmail}>
                <Mail size={15} />
                Send an Email
              </button>
            )}
          </div>
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
