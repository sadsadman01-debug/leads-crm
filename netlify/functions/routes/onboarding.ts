import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import { requireAdminOrAbove, resolveOrganizationId } from '../lib/permissions.js'
import type { AuthedUser } from '../lib/auth.js'

interface StepDef {
  id: string
  label: string
  link: string
}

// Order here is the order shown in the widget.
const STEPS: StepDef[] = [
  { id: 'pipeline_stages', label: 'Customize your Pipeline Stages', link: '/settings' },
  { id: 'first_lead', label: 'Add your first Lead', link: '/leads/new' },
  { id: 'invite_team', label: 'Invite a Team Member', link: '/team' },
  { id: 'template', label: 'Create an Email/Message Template', link: '/settings' },
  { id: 'industries', label: 'Set up your Industries', link: '/settings' },
  { id: 'branding', label: 'Customize your Branding', link: '/settings' },
  { id: 'first_deal', label: 'Create your first Deal', link: '/deals' },
]

async function countInOrg(table: string, orgId: string, extra?: (q: any) => any): Promise<number> {
  const supabase = getSupabaseAdmin()
  let query = supabase.from(table).select('id', { count: 'exact', head: true }).eq('organization_id', orgId)
  if (extra) query = extra(query)
  const { count, error } = await query
  if (error) throw new HttpError(500, error.message)
  return count ?? 0
}

function emptyResponse(applicable: boolean, dismissed: boolean, completed: boolean) {
  return {
    applicable,
    dismissed,
    completed,
    justCompleted: false,
    steps: [] as Array<StepDef & { done: boolean }>,
    completedCount: completed ? STEPS.length : 0,
    totalCount: STEPS.length,
  }
}

/** Admin-only. Not applicable outside a real organization (e.g. the Super
 * Admin's personal/platform-level scope) — onboarding is an org-setup concern. */
export async function getOnboardingStatus(event: HandlerEvent, user: AuthedUser) {
  requireAdminOrAbove(user)
  const orgId = resolveOrganizationId(user, event)
  if (orgId === null) return json(200, emptyResponse(false, true, true))

  const supabase = getSupabaseAdmin()
  const { data: org, error } = await supabase
    .from('organizations')
    .select('id, logo_storage_path, accent_color, display_name, onboarding_dismissed, onboarding_completed_at')
    .eq('id', orgId)
    .maybeSingle()
  if (error) throw new HttpError(500, error.message)
  if (!org) throw new HttpError(404, 'Organization not found')

  // Already dismissed or completed — no need to recompute step details, since
  // the widget won't render either way.
  if (org.onboarding_dismissed || org.onboarding_completed_at) {
    return json(200, emptyResponse(true, org.onboarding_dismissed, Boolean(org.onboarding_completed_at)))
  }

  const [leadCount, dealCount, templateCount, industryCount, stageCount, userCount] = await Promise.all([
    countInOrg('leads', orgId),
    countInOrg('deals', orgId),
    countInOrg('templates', orgId),
    countInOrg('industries', orgId),
    countInOrg('pipeline_stages', orgId),
    countInOrg('profiles', orgId, (q) => q.eq('role', 'user')),
  ])

  const doneMap: Record<string, boolean> = {
    pipeline_stages: stageCount > 0,
    first_lead: leadCount > 0,
    invite_team: userCount > 0,
    template: templateCount > 0,
    industries: industryCount > 0,
    branding: Boolean(org.logo_storage_path || org.accent_color || org.display_name),
    first_deal: dealCount > 0,
  }

  const steps = STEPS.map((s) => ({ ...s, done: doneMap[s.id] }))
  const completedCount = steps.filter((s) => s.done).length
  const allDone = completedCount === STEPS.length

  let justCompleted = false
  if (allDone) {
    justCompleted = true
    const { error: updateErr } = await supabase
      .from('organizations')
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq('id', orgId)
    if (updateErr) throw new HttpError(500, updateErr.message)
  }

  return json(200, {
    applicable: true,
    dismissed: false,
    completed: allDone,
    justCompleted,
    steps,
    completedCount,
    totalCount: STEPS.length,
  })
}

export async function dismissOnboarding(event: HandlerEvent, user: AuthedUser) {
  requireAdminOrAbove(user)
  const orgId = resolveOrganizationId(user, event)
  if (orgId === null) throw new HttpError(400, 'Onboarding is only available within an organization')

  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('organizations').update({ onboarding_dismissed: true }).eq('id', orgId)
  if (error) throw new HttpError(500, error.message)

  return json(200, { success: true })
}
