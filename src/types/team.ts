export type Role = 'super_admin' | 'admin' | 'user'

export interface Profile {
  id: string
  email: string
  nickname: string | null
  role: Role
  is_active: boolean
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
