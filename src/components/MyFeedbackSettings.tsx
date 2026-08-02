import { useQuery } from '@tanstack/react-query'
import { MessageSquareText } from 'lucide-react'
import { productReviewsApi } from '@/lib/api'
import { StarRating } from '@/components/ui/StarRating'

export function MyFeedbackSettings() {
  const { data, isLoading } = useQuery({ queryKey: ['my-reviews'], queryFn: productReviewsApi.listMine })
  const reviews = data?.reviews ?? []

  return (
    <div className="card p-6">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-base-300">My Feedback</h2>
      <p className="mb-5 text-xs text-base-400">Your past product review submissions, and any replies from the Leadify team.</p>

      {isLoading ? (
        <p className="text-sm text-base-400">Loading…</p>
      ) : reviews.length === 0 ? (
        <p className="text-sm text-base-400">No feedback submitted yet.</p>
      ) : (
        <div className="space-y-4">
          {reviews.map((review) => (
            <div key={review.id} className="rounded-lg border border-base-700/60 bg-base-850 p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-base-400">Review #{review.review_number}</span>
                <div className="flex items-center gap-3">
                  <StarRating rating={review.rating} />
                  <span className="text-xs text-base-500">{new Date(review.submitted_at).toLocaleDateString()}</span>
                </div>
              </div>
              {review.comment && <p className="mb-1 text-sm text-base-200">{review.comment}</p>}
              {review.suggestions && (
                <p className="text-sm text-base-400">
                  <span className="text-base-500">Suggestions:</span> {review.suggestions}
                </p>
              )}

              {review.super_admin_reply && (
                <div className="mt-3 border-l-2 border-accent-500 pl-3">
                  <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-accent-400">
                    <MessageSquareText size={13} /> Leadify team
                    {review.replied_at && <span className="font-normal text-base-500">— {new Date(review.replied_at).toLocaleDateString()}</span>}
                  </p>
                  <p className="text-sm text-base-200">{review.super_admin_reply}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
