import { Star } from 'lucide-react'

/** Read-only 1-5 star display, used anywhere a submitted rating is shown
 * (My Feedback, the Super Admin reviews table and detail modal). */
export function StarRating({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star key={star} size={size} className={rating >= star ? 'fill-warn text-warn' : 'text-base-700'} />
      ))}
    </div>
  )
}
