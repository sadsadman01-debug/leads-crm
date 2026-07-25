/**
 * Tracks which organization scope the current view is acting within. Admin/User
 * accounts never touch this (the server always forces their own org regardless).
 * Only the Super Admin's UI ever calls setActiveOrganizationId — undefined means
 * "not yet chosen" (server defaults to personal scope), null means the Super
 * Admin's own personal/sandbox scope, and a uuid means a specific Organization
 * they've drilled into.
 */
export const PERSONAL_SCOPE_PARAM = '__personal__'

let activeOrganizationId: string | null | undefined = undefined

export function setActiveOrganizationId(id: string | null | undefined) {
  activeOrganizationId = id
}

export function getActiveOrganizationId(): string | null | undefined {
  return activeOrganizationId
}

/** Appends ?organizationId=... (or &organizationId=...) to a path if a scope is set. */
export function withOrgScope(path: string): string {
  if (activeOrganizationId === undefined) return path
  const encoded = activeOrganizationId === null ? PERSONAL_SCOPE_PARAM : activeOrganizationId
  const sep = path.includes('?') ? '&' : '?'
  return `${path}${sep}organizationId=${encodeURIComponent(encoded)}`
}
