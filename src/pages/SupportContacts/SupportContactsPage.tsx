import { useQuery } from '@tanstack/react-query'
import { LifeBuoy } from 'lucide-react'
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
          Every message submitted through the Help widget's in-app form, from Admins/Users and from visitors on the
          pre-login screens.
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
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-base-700/60 text-xs uppercase tracking-wide text-base-400">
                <th className="py-2 pr-3 font-medium">Organization</th>
                <th className="px-3 py-2 font-medium">Requester</th>
                <th className="px-3 py-2 font-medium">Message</th>
                <th className="px-3 py-2 font-medium">Requested</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.id} className="border-b border-base-800 align-top">
                  <td className="py-3 pr-3 text-base-300">{c.organization_name || '—'}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1.5">
                      {c.source === 'pre_auth' && <Badge tone="warn">Pre-login</Badge>}
                      <span className="font-medium text-base-100">{c.requester_nickname || c.contact_email || '—'}</span>
                    </div>
                    {c.contact_email && <div className="text-xs text-base-400">{c.contact_email}</div>}
                  </td>
                  <td className="max-w-[360px] px-3 py-3 text-base-300">
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
