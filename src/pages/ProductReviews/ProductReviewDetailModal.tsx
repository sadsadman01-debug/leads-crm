import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { productReviewsApi } from '@/lib/api'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { StarRating } from '@/components/ui/StarRating'
import type { ProductReviewWithReviewer } from '@/types/productReview'

export function ProductReviewDetailModal({ review, onClose }: { review: ProductReviewWithReviewer | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [replyText, setReplyText] = useState('')

  useEffect(() => {
    setReplyText(review?.super_admin_reply ?? '')
  }, [review?.id, review?.super_admin_reply])

  const mutation = useMutation({
    mutationFn: () => productReviewsApi.reply(review!.id, replyText.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-reviews'] })
    },
  })

  if (!review) return null

  return (
    <Modal open onClose={onClose} title={`Review #${review.review_number} — ${review.reviewer_name}`} size="lg">
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div className="rounded-lg bg-base-850 p-3">
            <p className="text-xs text-base-500">Reviewer</p>
            <p className="truncate text-base-200">{review.reviewer_name}</p>
          </div>
          <div className="rounded-lg bg-base-850 p-3">
            <p className="mb-1 text-xs text-base-500">Role</p>
            <Badge tone="neutral">{review.reviewer_role ?? '—'}</Badge>
          </div>
          <div className="rounded-lg bg-base-850 p-3">
            <p className="text-xs text-base-500">Organization</p>
            <p className="truncate text-base-200">{review.organization_name ?? '—'}</p>
          </div>
          <div className="rounded-lg bg-base-850 p-3">
            <p className="mb-1 text-xs text-base-500">Rating</p>
            <StarRating rating={review.rating} />
          </div>
        </div>

        {review.comment && (
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-base-400">Comment</p>
            <p className="text-sm text-base-200">{review.comment}</p>
          </div>
        )}
        {review.suggestions && (
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-base-400">Suggestions</p>
            <p className="text-sm text-base-200">{review.suggestions}</p>
          </div>
        )}
        {!review.comment && !review.suggestions && <p className="text-sm text-base-400">No comment or suggestions provided.</p>}

        <div className="border-t border-base-700/60 pt-4">
          <label className="label">{review.super_admin_reply ? 'Edit Reply' : 'Reply'}</label>
          <textarea
            className="input min-h-[90px] resize-y"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Write a reply the reviewer will see under this feedback…"
          />
          <div className="mt-3 flex items-center justify-between">
            {review.replied_at ? (
              <p className="text-xs text-base-500">Last replied {new Date(review.replied_at).toLocaleString()}</p>
            ) : (
              <span />
            )}
            <button className="btn-primary" disabled={!replyText.trim() || mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? 'Sending…' : review.super_admin_reply ? 'Update Reply' : 'Send Reply'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
