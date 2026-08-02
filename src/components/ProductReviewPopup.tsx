import { useState } from 'react'
import { Star, CheckCircle2 } from 'lucide-react'
import { productReviewsApi } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

/** A deliberately non-dismissable popup — no Escape listener, no × button, no
 * click-outside handler — since submitting is the only way to resume using
 * the app once a review is due. Intentionally not built on `Modal.tsx`, which
 * bakes in Escape-to-close. */
export function ProductReviewPopup({ pendingReviewNumber }: { pendingReviewNumber: number }) {
  const { refreshProfile } = useAuth()
  const [rating, setRating] = useState<number | null>(null)
  const [hoverRating, setHoverRating] = useState<number | null>(null)
  const [comment, setComment] = useState('')
  const [suggestions, setSuggestions] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  async function handleSubmit() {
    if (!rating) return
    setSubmitting(true)
    try {
      await productReviewsApi.submit({
        rating,
        comment: comment.trim() || undefined,
        suggestions: suggestions.trim() || undefined,
      })
      setSubmitted(true)
      setTimeout(() => {
        refreshProfile()
      }, 1200)
    } finally {
      setSubmitting(false)
    }
  }

  const heading = pendingReviewNumber === 1 ? "How's Leadify working for you?" : 'Quick check-in — how\'s it going?'
  const displayRating = hoverRating ?? rating ?? 0

  return (
    <div className="fixed inset-0 z-[60] flex items-stretch justify-center bg-black/60 backdrop-blur-sm animate-fadeIn sm:items-center sm:p-4">
      <div className="card w-full max-w-md animate-slideUp overflow-y-auto rounded-none p-5 sm:max-h-[85vh] sm:rounded-xl2 sm:p-6">
        {submitted ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <CheckCircle2 size={32} className="text-success" />
            <p className="text-base font-semibold text-base-100">Thanks for your feedback!</p>
          </div>
        ) : (
          <>
            <h2 className="mb-1 text-lg font-semibold text-base-100">{heading}</h2>
            <p className="mb-5 text-sm text-base-400">
              A quick, optional check-in — rate your experience and move on in under a minute.
            </p>

            <div className="mb-5 flex justify-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(null)}
                  className="p-1"
                  aria-label={`${star} star${star > 1 ? 's' : ''}`}
                >
                  <Star size={32} className={displayRating >= star ? 'fill-warn text-warn' : 'text-base-600'} />
                </button>
              ))}
            </div>

            <div className="mb-3">
              <label className="label">Comments (optional)</label>
              <textarea
                className="input min-h-[70px] resize-y"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="What's working well, or what's frustrating?"
              />
            </div>
            <div className="mb-5">
              <label className="label">Suggestions (optional)</label>
              <textarea
                className="input min-h-[70px] resize-y"
                value={suggestions}
                onChange={(e) => setSuggestions(e.target.value)}
                placeholder="Anything you'd like us to add or change?"
              />
            </div>

            <button type="button" className="btn-primary w-full" disabled={!rating || submitting} onClick={handleSubmit}>
              {submitting ? 'Submitting…' : 'Submit'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
