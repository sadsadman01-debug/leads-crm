import { type ReactNode, useEffect } from 'react'
import { X } from 'lucide-react'

// Laptop+ (lg:) width per `size`; Tablet gets its own distinct ~85-90vw
// capped width below, so it's neither the small phone card nor the fixed
// Laptop width.
const MAX_WIDTH: Record<'md' | 'lg', string> = {
  md: 'lg:max-w-md',
  lg: 'lg:max-w-2xl',
}

export function Modal({
  open,
  onClose,
  title,
  children,
  size = 'md',
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  size?: 'md' | 'lg'
}) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    if (open) document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/60 backdrop-blur-sm animate-fadeIn sm:items-center sm:p-4">
      <div
        className={`card w-full max-w-md animate-slideUp overflow-y-auto rounded-none p-5 sm:max-h-[85vh] sm:rounded-xl2 sm:p-6 md:max-w-[min(90vw,40rem)] ${MAX_WIDTH[size]}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-base-100">{title}</h2>
          <button onClick={onClose} className="btn-ghost -mr-2 px-2 text-base-400 hover:text-base-100">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
