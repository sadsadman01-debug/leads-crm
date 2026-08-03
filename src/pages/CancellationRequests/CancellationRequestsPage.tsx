import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarOff } from 'lucide-react'
import { cancellationRequestsApi } from '@/lib/api'
import { Badge } from '@/components/ui/Badge'
import type { CancellationRequest, CancellationRequestStatus } from '@/types/cancellationRequest'

type Tab = CancellationRequestStatus | 'all'

const TABS: Tab[] = ['pending', 'acknowledged', 'all']
const TAB_LABELS: Record<Tab, string> = { pending: 'Pending', acknowledged: 'Acknowledged', all: 'All' }
const STATUS_TONE: Record<CancellationRequestStatus, 'warn' | 'neutral'> = { pending: 'warn', acknowledged: 'neutral' }

export function CancellationRequestsPage() {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('pending')

  const { data, isLoading } = useQuery({ queryKey: ['cancellation-requests'], queryFn: cancellationRequestsApi.list })
  const requests = data?.requests ?? []

  const acknowledgeMutation = useMutation({
    mutationFn: (id: string) => cancellationRequestsApi.acknowledge(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cancellation-requests'] }),
  })

  const pendingCount = useMemo(() => requests.filter((r) => r.status === 'pending').length, [requests])

  const filtered = useMemo(() => {
    if (tab === 'all') return requests
    return requests.filter((r) => r.status === tab)
  }, [requests, tab])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-base-100">Cancellation Requests</h1>
        <p className="mt-1 text-sm text-base-400">
          Submitted by an Organization's Admin from their own Billing settings. Acknowledging a request never changes
          their subscription by itself — mark them Cancelled from the Billing dashboard once you've processed it.
        </p>
      </div>

      <div className="flex gap-1 rounded-lg bg-base-850 p-1 w-fit">
        {TABS.map((t) => (
          <button
            key={t}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === t ? 'bg-accent-500 text-white' : 'text-base-300 hover:text-base-100'
            }`}
            onClick={() => setTab(t)}
          >
            {TAB_LABELS[t]}
            {t === 'pending' && pendingCount > 0 && (
              <span className={`rounded-full px-1.5 text-xs ${tab === t ? 'bg-white/20' : 'bg-warn-bg text-warn'}`}>{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="card p-12 text-center text-base-400">Loading requests…</div>
      ) : filtered.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 p-16 text-center">
          <CalendarOff size={32} className="text-base-500" />
          <p className="text-base-300">No {tab === 'all' ? '' : TAB_LABELS[tab].toLowerCase()} cancellation requests.</p>
        </div>
      ) : (
        <div className="card overflow-x-auto p-6">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-base-700/60 text-xs uppercase tracking-wide text-base-400">
                <th className="py-2 pr-3 font-medium">Organization</th>
                <th className="px-3 py-2 font-medium">Requested By</th>
                <th className="px-3 py-2 font-medium">Reason</th>
                <th className="px-3 py-2 font-medium">Comments</th>
                <th className="px-3 py-2 font-medium">Requested</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r: CancellationRequest) => (
                <tr key={r.id} className="border-b border-base-800 align-top">
                  <td className="py-3 pr-3 font-medium text-base-100">{r.organization_name}</td>
                  <td className="px-3 py-3 text-base-300">{r.requested_by_name ?? '—'}</td>
                  <td className="px-3 py-3 text-base-300">{r.reason}</td>
                  <td className="max-w-[260px] px-3 py-3 text-xs text-base-400">{r.additional_comments || <span className="text-base-500">—</span>}</td>
                  <td className="px-3 py-3 text-base-400">{new Date(r.requested_at).toLocaleDateString()}</td>
                  <td className="px-3 py-3">
                    <Badge tone={STATUS_TONE[r.status]}>{r.status === 'pending' ? 'Pending' : 'Acknowledged'}</Badge>
                  </td>
                  <td className="px-3 py-3">
                    {r.status === 'pending' && (
                      <button
                        className="btn-ghost px-2 text-xs text-accent-400"
                        disabled={acknowledgeMutation.isPending}
                        onClick={() => acknowledgeMutation.mutate(r.id)}
                      >
                        Mark Acknowledged
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
