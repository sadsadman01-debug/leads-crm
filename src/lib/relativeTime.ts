/** Compact relative-time labels ("5m ago", "2h ago", "Yesterday", "3d ago") —
 * intentionally terser than date-fns's formatDistanceToNow ("5 minutes ago")
 * to fit tightly in a notification list row. */
export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diffSeconds = Math.max(0, Math.round((now - then) / 1000))

  if (diffSeconds < 60) return 'Just now'
  const diffMinutes = Math.round(diffSeconds / 60)
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  const diffHours = Math.round(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.round(diffHours / 24)
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  const diffWeeks = Math.round(diffDays / 7)
  if (diffDays < 30) return `${diffWeeks}w ago`
  return new Date(iso).toLocaleDateString()
}
