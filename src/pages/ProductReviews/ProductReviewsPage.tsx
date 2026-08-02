import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MessageSquareText } from 'lucide-react'
import { productReviewsApi, organizationsApi } from '@/lib/api'
import { Badge } from '@/components/ui/Badge'
import { StarRating } from '@/components/ui/StarRating'
import { ProductReviewStatsRow } from './ProductReviewStatsRow'
import { ProductReviewDetailModal } from './ProductReviewDetailModal'

export function ProductReviewsPage() {
  const [rating, setRating] = useState('')
  const [organizationId, setOrganizationId] = useState('')
  const [role, setRole] = useState('')
  const [replyStatus, setReplyStatus] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [viewingId, setViewingId] = useState<string | null>(null)

  const { data: orgsData } = useQuery({ queryKey: ['organizations'], queryFn: organizationsApi.list })
  const organizations = orgsData?.organizations ?? []

  const filters = {
    rating: rating ? Number(rating) : undefined,
    organization_id: organizationId || undefined,
    role: (role || undefined) as 'admin' | 'user' | undefined,
    reply_status: (replyStatus || undefined) as 'replied' | 'not_replied' | undefined,
    date_from: dateFrom ? new Date(dateFrom).toISOString() : undefined,
    date_to: dateTo ? new Date(`${dateTo}T23:59:59.999`).toISOString() : undefined,
  }

  const { data, isLoading } = useQuery({
    queryKey: ['product-reviews', filters],
    queryFn: () => productReviewsApi.listAll(filters),
  })
  const reviews = data?.reviews ?? []
  const viewing = reviews.find((r) => r.id === viewingId) ?? null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-base-100">Product Reviews</h1>
        <p className="mt-1 text-sm text-base-400">All feedback submitted by Admin and User accounts, platform-wide.</p>
      </div>

      <ProductReviewStatsRow />

      <div className="card flex flex-wrap items-center gap-2 p-4">
        <select className="input w-auto py-1.5 text-xs" value={rating} onChange={(e) => setRating(e.target.value)}>
          <option value="">All Ratings</option>
          {[5, 4, 3, 2, 1].map((r) => (
            <option key={r} value={r}>
              {r} star{r > 1 ? 's' : ''}
            </option>
          ))}
        </select>
        <select className="input w-auto py-1.5 text-xs" value={organizationId} onChange={(e) => setOrganizationId(e.target.value)}>
          <option value="">All Organizations</option>
          {organizations.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </select>
        <select className="input w-auto py-1.5 text-xs" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">All Roles</option>
          <option value="admin">Admin</option>
          <option value="user">User</option>
        </select>
        <select className="input w-auto py-1.5 text-xs" value={replyStatus} onChange={(e) => setReplyStatus(e.target.value)}>
          <option value="">Any Reply Status</option>
          <option value="replied">Replied</option>
          <option value="not_replied">Not Replied</option>
        </select>
        <input type="date" className="input w-auto py-1.5 text-xs" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <span className="text-xs text-base-500">to</span>
        <input type="date" className="input w-auto py-1.5 text-xs" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
      </div>

      {isLoading ? (
        <div className="card p-12 text-center text-base-400">Loading…</div>
      ) : reviews.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 p-16 text-center">
          <MessageSquareText size={32} className="text-base-500" />
          <p className="text-base-300">No reviews match these filters.</p>
        </div>
      ) : (
        <div className="card overflow-x-auto p-6">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead>
              <tr className="border-b border-base-700/60 text-xs uppercase tracking-wide text-base-400">
                <th className="py-2 pr-3 font-medium">Reviewer</th>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 font-medium">Organization</th>
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">Rating</th>
                <th className="px-3 py-2 font-medium">Comment</th>
                <th className="px-3 py-2 font-medium">Submitted</th>
                <th className="px-3 py-2 font-medium">Reply</th>
              </tr>
            </thead>
            <tbody>
              {reviews.map((review) => (
                <tr key={review.id} className="cursor-pointer border-b border-base-800 hover:bg-base-850" onClick={() => setViewingId(review.id)}>
                  <td className="py-3 pr-3 font-medium text-base-100">{review.reviewer_name}</td>
                  <td className="px-3 py-3 capitalize text-base-300">{review.reviewer_role ?? '—'}</td>
                  <td className="px-3 py-3 text-base-400">{review.organization_name ?? '—'}</td>
                  <td className="px-3 py-3 tabular-nums text-base-300">{review.review_number}</td>
                  <td className="px-3 py-3">
                    <StarRating rating={review.rating} />
                  </td>
                  <td className="max-w-[220px] truncate px-3 py-3 text-base-400">{review.comment ?? '—'}</td>
                  <td className="px-3 py-3 text-base-400">{new Date(review.submitted_at).toLocaleDateString()}</td>
                  <td className="px-3 py-3">
                    <Badge tone={review.super_admin_reply ? 'success' : 'neutral'}>
                      {review.super_admin_reply ? 'Replied' : 'Not Replied'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ProductReviewDetailModal review={viewing} onClose={() => setViewingId(null)} />
    </div>
  )
}
