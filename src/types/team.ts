export type Role = 'super_admin' | 'admin' | 'user'

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
  canManageIndustries: boolean
  canViewTeamPerformance: boolean
  canAccessReportBuilder: boolean
}

/** Matches the original, fixed Part 7 User behavior exactly. */
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
  canManageIndustries: false,
  canViewTeamPerformance: false,
  canAccessReportBuilder: false,
}

export const PERMISSION_PRESETS: Array<{ key: string; label: string; description: string; values: UserPermissions }> = [
  {
    key: 'standard',
    label: 'Standard User',
    description: 'The default access level for a new User account.',
    values: { ...DEFAULT_USER_PERMISSIONS },
  },
  {
    key: 'readOnly',
    label: 'Read-Only User',
    description: 'Can view everything, but cannot edit, delete, import, export, or manage anything.',
    values: {
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
      canManageIndustries: false,
      canViewTeamPerformance: false,
      canAccessReportBuilder: false,
    },
  },
  {
    key: 'seniorRep',
    label: 'Senior Rep',
    description: 'Full data access (view/edit/delete anything, see deal values) with feature access still off by default.',
    values: {
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
      canManageIndustries: false,
      canViewTeamPerformance: false,
      canAccessReportBuilder: false,
    },
  },
]

export function permissionsMatchDefault(perms: UserPermissions): boolean {
  return (Object.keys(DEFAULT_USER_PERMISSIONS) as Array<keyof UserPermissions>).every(
    (key) => perms[key] === DEFAULT_USER_PERMISSIONS[key]
  )
}

export interface Profile {
  id: string
  email: string
  nickname: string | null
  role: Role
  is_active: boolean
  organization_id?: string | null
  permissions?: UserPermissions
}

export interface TeamMember extends Profile {
  created_at: string
  last_login_at: string | null
}

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  user: 'User',
}
