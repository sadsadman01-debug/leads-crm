import { useQuery } from '@tanstack/react-query'
import { LifeBuoy, MessageCircle, Mail } from 'lucide-react'
import { supportContactsApi } from '@/lib/api'
import { Badge } from '@/components/ui/Badge'

export function SupportContactsPage() {
  const { data, isLoading } = useQuery({ queryKey: ['support-contacts'], queryFn: supportContactsApi.list })
  const contacts = data?.contacts ?? []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-base-100">Support Contacts</h1>
        <p className="mt-1 text-sm text-base-400">
          A log of every time an Admin or User has clicked "Chat on WhatsApp" or "Send an Email" from the Help
          widget — the actual conversation happens outside the app.
        </p>
      </div>

      {isLoading ? (
        <div className="card p-12 text-center text-base-400">Loading…</div>
      ) : contacts.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 p-16 text-center">
          <LifeBuoy size={32} className="text-base-500" />
          <p className="text-base-300">No one has reached out via the Help widget yet.</p>
        </div>
      ) : (
        <div className="card overflow-x-auto p-6">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-base-700/60 text-xs uppercase tracking-wide text-base-400">
                <th className="py-2 pr-3 font-medium">Organization</th>
                <th className="px-3 py-2 font-medium">Requester</th>
                <th className="px-3 py-2 font-medium">Channel</th>
                <th className="px-3 py-2 font-medium">Message</th>
                <th className="px-3 py-2 font-medium">Requested</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.id} className="border-b border-base-800 align-top">
                  <td className="py-3 pr-3 text-base-300">{c.organization_name || '—'}</td>
                  <td className="px-3 py-3">
                    <div className="font-medium text-base-100">{c.requester_nickname || c.requester_email || '—'}</div>
                    {c.requester_email && <div className="text-xs text-base-400">{c.requester_email}</div>}
                  </td>
                  <td className="px-3 py-3">
                    <Badge tone={c.channel === 'whatsapp' ? 'success' : 'accent'}>
                      {c.channel === 'whatsapp' ? <MessageCircle size={12} /> : <Mail size={12} />}
                      {c.channel === 'whatsapp' ? 'WhatsApp' : 'Email'}
                    </Badge>
                  </td>
                  <td className="max-w-[320px] px-3 py-3 text-base-300">
                    <span className="line-clamp-2">{c.message_preview || <span className="text-base-500">—</span>}</span>
                  </td>
                  <td className="px-3 py-3 text-base-400">{new Date(c.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
