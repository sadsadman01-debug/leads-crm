import { HttpError } from './http.js'
import type { AuthedUser } from './auth.js'

export function isAdminOrAbove(user: AuthedUser): boolean {
  return user.role === 'admin' || user.role === 'super_admin'
}

export function isSuperAdmin(user: AuthedUser): boolean {
  return user.role === 'super_admin'
}

export function requireAdminOrAbove(user: AuthedUser) {
  if (!isAdminOrAbove(user)) throw new HttpError(403, 'Admin access required')
}

export function requireSuperAdmin(user: AuthedUser) {
  if (!isSuperAdmin(user)) throw new HttpError(403, 'Super Admin access required')
}

/** Admins/super admins can modify any record; otherwise only the assigned owner or original creator can. */
export function canModifyRecord(
  user: AuthedUser,
  record: { assigned_to?: string | null; created_by?: string | null; owner_id?: string | null }
): boolean {
  if (isAdminOrAbove(user)) return true
  return record.assigned_to === user.id || record.created_by === user.id || record.owner_id === user.id
}

export function requireCanModifyRecord(
  user: AuthedUser,
  record: { assigned_to?: string | null; created_by?: string | null; owner_id?: string | null }
) {
  if (!canModifyRecord(user, record)) {
    throw new HttpError(403, 'You do not have permission to modify this record')
  }
}
