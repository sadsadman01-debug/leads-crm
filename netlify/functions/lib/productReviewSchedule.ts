/** Review #1 is due 7 days after account creation; every review after that is
 * due every 30 days on a fixed schedule (Day 7, 37, 67, 97, ...) that depends
 * only on how many reviews have been submitted so far — never on when the
 * previous one was actually submitted, so missed reviews are never backfilled
 * with extra prompts, and any number of overdue reviews collapses into a
 * single "current pending review". */
export function computeReviewStatus(
  createdAt: string,
  submittedCount: number
): { due: boolean; pendingReviewNumber: number; dueDate: string } {
  const pendingReviewNumber = submittedCount + 1
  const dueDate = new Date(createdAt)
  dueDate.setUTCDate(dueDate.getUTCDate() + 7 + 30 * (pendingReviewNumber - 1))

  return {
    due: new Date() >= dueDate,
    pendingReviewNumber,
    dueDate: dueDate.toISOString(),
  }
}
