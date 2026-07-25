import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { setActiveOrganizationId } from '@/lib/orgScope'
import { useAuth } from '@/contexts/AuthContext'

interface OrgContextValue {
  /** undefined = not yet chosen (Super Admin should be shown the Organizations Overview),
   * null = Super Admin's personal/sandbox scope, string = a specific Organization's id. */
  viewingOrgId: string | null | undefined
  viewingOrgName: string | undefined
  enterOrganization: (id: string, name: string) => void
  enterPersonalWorkspace: () => void
  exitToOrganizations: () => void
}

const OrgContext = createContext<OrgContextValue | undefined>(undefined)

export function OrgProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth()
  const [viewingOrgId, setViewingOrgId] = useState<string | null | undefined>(undefined)
  const [viewingOrgName, setViewingOrgName] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (profile?.role === 'super_admin') {
      setActiveOrganizationId(viewingOrgId)
    } else {
      setActiveOrganizationId(undefined)
    }
  }, [profile?.role, viewingOrgId])

  // Reset the selection whenever a different Super Admin session starts.
  useEffect(() => {
    if (profile?.role !== 'super_admin') {
      setViewingOrgId(undefined)
      setViewingOrgName(undefined)
    }
  }, [profile?.role])

  function enterOrganization(id: string, name: string) {
    setViewingOrgId(id)
    setViewingOrgName(name)
  }

  function enterPersonalWorkspace() {
    setViewingOrgId(null)
    setViewingOrgName('My Personal Workspace')
  }

  function exitToOrganizations() {
    setViewingOrgId(undefined)
    setViewingOrgName(undefined)
  }

  return (
    <OrgContext.Provider value={{ viewingOrgId, viewingOrgName, enterOrganization, enterPersonalWorkspace, exitToOrganizations }}>
      {children}
    </OrgContext.Provider>
  )
}

export function useOrg() {
  const ctx = useContext(OrgContext)
  if (!ctx) throw new Error('useOrg must be used within OrgProvider')
  return ctx
}
