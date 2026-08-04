import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from './supabaseAdmin.js'
import { HttpError } from './http.js'
import type { AuthedUser } from './auth.js'
import type { UserPermissions } from './userPermissions.js'

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
  // Staff only ever operates in the shared personal/private workspace (same
  // organization_id IS NULL space as the Super Admin's own sandbox) — never
  // an arbitrary tenant Organization, regardless of any ?organizationId=
  // a request happens to include.
  if (user.role === 'staff') return null
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

/** Platform Staff — a restricted, org-less role alongside Super Admin. Only
 * ever relevant for the specific operational screens Staff has full access
 * to (see requireSuperAdminOrStaff); every other existing check in this file
 * is untouched, so Staff is blocked by default everywhere else. */
export function isStaff(user: AuthedUser): boolean {
  return user.role === 'staff'
}

export function requireSuperAdminOrStaff(user: AuthedUser) {
  if (!isSuperAdmin(user) && !isStaff(user)) throw new HttpError(403, 'Super Admin or Staff access required')
}

export function requireAdminOrAbove(user: AuthedUser) {
  if (!isAdminOrAbove(user)) throw new HttpError(403, 'Admin access required')
}

export function requireSuperAdmin(user: AuthedUser) {
  if (!isSuperAdmin(user)) throw new HttpError(403, 'Super Admin access required')
}

/** Opt-in step-up auth check for the most sensitive actions (Team Management
 * mutations, Branding, Signup/Password-Reset/MFA-Reset resolution): if this
 * account has ever verified a TOTP factor, its CURRENT session must have
 * actually completed an MFA challenge (aal2) — an old aal1 session token
 * can't be used to bypass 2FA just because it's still technically valid.
 * Accounts that never enrolled MFA are entirely unaffected (still aal1-only). */
export async function requireAal2IfEnrolled(user: AuthedUser) {
  if (user.aal === 'aal2') return
  const supabase = getSupabaseAdmin()
  const { data } = await supabase.auth.admin.mfa.listFactors({ userId: user.id })
  const hasVerifiedFactor = (data?.factors ?? []).some((f) => f.status === 'verified')
  if (hasVerifiedFactor) {
    throw new HttpError(401, 'Please complete two-factor verification to continue. Sign out and back in to refresh your session.')
  }
}

export type OwnedRecord = { assigned_to?: string | null; created_by?: string | null; owner_id?: string | null }
export type VisibilityScope = 'lead' | 'deal'

function isOwnerOf(user: AuthedUser, record: OwnedRecord): boolean {
  return record.assigned_to === user.id || record.created_by === user.id || record.owner_id === user.id
}

function visibilityOf(user: AuthedUser, scope: VisibilityScope): 'all' | 'own' {
  return scope === 'lead' ? user.permissions.leadVisibility : user.permissions.dealVisibility
}

/** Whether this user can see this specific record at all (used for single-record
 * fetches — list endpoints instead apply applyLeadVisibility/applyDealVisibility
 * directly to the query). Admins always see everything; a User sees it if their
 * visibility scope is 'all', or if they're the assigned owner/creator. */
export function isRecordVisible(user: AuthedUser, record: OwnedRecord, scope: VisibilityScope): boolean {
  if (isAdminOrAbove(user)) return true
  if (visibilityOf(user, scope) === 'all') return true
  return isOwnerOf(user, record)
}

/** Admins/super admins can modify any record. A User can always modify their own
 * (assigned/created); with canEditAny ON *and* visibility scope 'all', they can
 * modify any record they can see — canEditAny has no extra effect under 'own'
 * visibility, since that scope is already limited to their own records. */
export function canModifyRecord(user: AuthedUser, record: OwnedRecord, scope: VisibilityScope): boolean {
  if (isAdminOrAbove(user)) return true
  if (isOwnerOf(user, record)) return true
  return visibilityOf(user, scope) === 'all' && user.permissions.canEditAny
}

export function requireCanModifyRecord(user: AuthedUser, record: OwnedRecord, scope: VisibilityScope) {
  if (!canModifyRecord(user, record, scope)) {
    throw new HttpError(403, 'You do not have permission to modify this record')
  }
}

/** Deletion is always bounded by whatever edit scope the user already has —
 * canDelete alone never grants deleting a record they couldn't otherwise edit. */
export function canDeleteRecord(user: AuthedUser, record: OwnedRecord, scope: VisibilityScope): boolean {
  if (isAdminOrAbove(user)) return true
  return user.permissions.canDelete && canModifyRecord(user, record, scope)
}

export function requireCanDeleteRecord(user: AuthedUser, record: OwnedRecord, scope: VisibilityScope) {
  if (!canDeleteRecord(user, record, scope)) {
    throw new HttpError(403, 'You do not have permission to delete this record')
  }
}

/** Restricts a leads query to the caller's visible scope — a no-op for
 * admins/super admins or when leadVisibility is 'all' (the default). */
export function applyLeadVisibility<T extends { or: (s: string) => T }>(query: T, user: AuthedUser): T {
  if (isAdminOrAbove(user) || user.permissions.leadVisibility === 'all') return query
  return query.or(`assigned_to.eq.${user.id},created_by.eq.${user.id}`)
}

/** Same as applyLeadVisibility, for deals (owner_id is the only ownership column). */
export function applyDealVisibility<T extends { or: (s: string) => T }>(query: T, user: AuthedUser): T {
  if (isAdminOrAbove(user) || user.permissions.dealVisibility === 'all') return query
  return query.or(`owner_id.eq.${user.id}`)
}

/** Feature-access flags (manage templates/custom fields/stages/industries, import,
 * export, team performance, report builder) — admins/super admins always pass. */
export function hasFeaturePermission(user: AuthedUser, key: keyof UserPermissions): boolean {
  if (isAdminOrAbove(user)) return true
  return Boolean(user.permissions[key])
}

export function requireFeaturePermission(user: AuthedUser, key: keyof UserPermissions) {
  if (!hasFeaturePermission(user, key)) {
    throw new HttpError(403, 'You do not have permission to perform this action')
  }
}
