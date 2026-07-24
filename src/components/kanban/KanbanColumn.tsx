import { useDroppable } from '@dnd-kit/core'
import clsx from 'clsx'
import type { ReactNode } from 'react'

export function KanbanColumn({
  id,
  title,
  count,
  children,
}: {
  id: string
  title: string
  count: number
  children: ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id })

  return (
    <div className="flex w-[85vw] shrink-0 snap-center flex-col sm:w-[70vw] md:w-72 md:snap-align-none">
      <div className="mb-3 flex items-center justify-between px-1">
        <h3 className="truncate text-sm font-semibold text-base-100">{title}</h3>
        <span className="pill bg-base-800 text-base-300">{count}</span>
      </div>
      <div
        ref={setNodeRef}
        className={clsx(
          'flex-1 space-y-2.5 rounded-xl2 border border-dashed p-2 transition-colors',
          isOver ? 'border-accent-500 bg-accent-500/5' : 'border-base-700/60 bg-base-900/40'
        )}
        style={{ minHeight: 120 }}
      >
        {children}
      </div>
    </div>
  )
}
