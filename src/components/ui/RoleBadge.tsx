import { Badge } from '@/components/ui/Badge'
import { ROLE_LABELS, type Role } from '@/types/team'

const ROLE_TONE: Record<Role, 'accent' | 'warn' | 'neutral' | 'success'> = {
  super_admin: 'accent',
  admin: 'warn',
  user: 'neutral',
  affiliate: 'success',
}

export function RoleBadge({ role }: { role: Role }) {
  return <Badge tone={ROLE_TONE[role]}>{ROLE_LABELS[role]}</Badge>
}

export function Avatar({ name, size = 8 }: { name: string | null | undefined; size?: number }) {
  const initial = (name || '?').trim()[0]?.toUpperCase() ?? '?'
  return (
    <div
      style={{ height: `${size * 0.25}rem`, width: `${size * 0.25}rem` }}
      className="flex shrink-0 items-center justify-center rounded-full bg-base-700 text-xs font-semibold text-base-200"
    >
      {initial}
    </div>
  )
}
