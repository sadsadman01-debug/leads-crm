import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from './supabaseAdmin.js'
import { HttpError } from './http.js'
import type { AuthedUser } from './auth.js'

/** Sentinel query-param value meaning "the Super Admin's own personal/sandbox scope" (organization_id IS NULL). */
export const PERSONAL_SCOPE = '__personal__'

/**
 * Resolves which organization a request is scoped to. Admin/User accounts are
 * always forced to their own organization_id, regardless of any client-supplied
 * value — only the Super Admin may specify a different organization (or the
 * personal-scope sentinel) via ?organizationId=, since they're the only role
 * that can legitimately act across tenants.
 */
export function resolveOrganizationId(user: AuthedUser, event: HandlerEvent): string | null {
  if (user.role !== 'super_admin') {
    if (!user.organization_id) throw new HttpError(403, 'This account is not linked to an organization')
    return user.organization_id
  }
  const raw = event.queryStringParameters?.organizationId
  if (!raw || raw === PERSONAL_SCOPE) return null
  return raw
}

/** Applies an organization_id equality/is-null filter to a Supabase query builder. */
export function scopeToOrg<T extends { eq: (col: string, val: any) => T; is: (col: string, val: any) => T }>(
  query: T,
  organizationId: string | null
): T {
  return organizationId === null ? query.is('organization_id', null) : query.eq('organization_id', organizationId)
}

/** Verifies a settings-type row (stage/industry/template/reason/etc.) belongs to
 * the resolved organization scope before allowing a rename/delete — always a
 * strict match, even for the Super Admin, since they must explicitly pick which
 * organization (or personal scope) they're editing via ?organizationId=. */
export async function requireRowInOrgScope(table: string, id: string, organizationId: string | null) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from(table).select('organization_id').eq('id', id).maybeSingle()
  if (error) throw new HttpError(500, error.message)
  if (!data) throw new HttpError(404, 'Not found')
  const rowOrg = (data as any).organization_id ?? null
  if (rowOrg !== organizationId) throw new HttpError(404, 'Not found')
}

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
