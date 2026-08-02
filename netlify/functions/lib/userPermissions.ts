export type VisibilityScope = 'all' | 'own'

export interface UserPermissions {
  leadVisibility: VisibilityScope
  dealVisibility: VisibilityScope
  canEditAny: boolean
  canDelete: boolean
  canViewDealValues: boolean
  canImport: boolean
  canExport: boolean
  canManageTemplates: boolean
  canManageCustomFields: boolean
  canManageStages: boolean
  canManageOutreachSequences: boolean
  canManageIndustries: boolean
  canViewTeamPerformance: boolean
  canAccessReportBuilder: boolean
}

/** Matches the original, fixed Part 7 User behavior exactly — every existing
 * User (and any newly created one) starts here until an admin customizes it. */
export const DEFAULT_USER_PERMISSIONS: UserPermissions = {
  leadVisibility: 'all',
  dealVisibility: 'all',
  canEditAny: false,
  canDelete: true,
  canViewDealValues: true,
  canImport: true,
  canExport: true,
  canManageTemplates: false,
  canManageCustomFields: false,
  canManageStages: false,
  canManageOutreachSequences: false,
  canManageIndustries: false,
  canViewTeamPerformance: false,
  canAccessReportBuilder: false,
}

export const PERMISSION_PRESETS: Record<string, UserPermissions> = {
  standard: { ...DEFAULT_USER_PERMISSIONS },
  readOnly: {
    leadVisibility: 'all',
    dealVisibility: 'all',
    canEditAny: false,
    canDelete: false,
    canViewDealValues: true,
    canImport: false,
    canExport: false,
    canManageTemplates: false,
    canManageCustomFields: false,
    canManageStages: false,
    canManageOutreachSequences: false,
    canManageIndustries: false,
    canViewTeamPerformance: false,
    canAccessReportBuilder: false,
  },
  seniorRep: {
    leadVisibility: 'all',
    dealVisibility: 'all',
    canEditAny: true,
    canDelete: true,
    canViewDealValues: true,
    canImport: true,
    canExport: true,
    canManageTemplates: false,
    canManageCustomFields: false,
    canManageStages: false,
    canManageOutreachSequences: false,
    canManageIndustries: false,
    canViewTeamPerformance: false,
    canAccessReportBuilder: false,
  },
}

/** A raw `permissions` jsonb value from `profiles` may be `{}` (brand new
 * column, or a User never customized) or a partial object from an older
 * version of this feature — always fill in missing keys with the default so
 * callers never have to null-check individual flags. */
export function normalizePermissions(raw: unknown): UserPermissions {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const merged = { ...DEFAULT_USER_PERMISSIONS, ...source } as UserPermissions
  merged.leadVisibility = merged.leadVisibility === 'own' ? 'own' : 'all'
  merged.dealVisibility = merged.dealVisibility === 'own' ? 'own' : 'all'
  return merged
}
