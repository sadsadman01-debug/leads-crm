import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import { requireSuperAdmin } from '../lib/permissions.js'
import { logAuditEvent } from '../lib/auditLog.js'
import type { AuthedUser } from '../lib/auth.js'

const BAN_DURATION = '876000h'

/** Super Admin only. One row per tenant, with roll-up metrics for the Organizations Overview screen. */
export async function listOrganizations(user: AuthedUser) {
  requireSuperAdmin(user)
  const supabase = getSupabaseAdmin()

  const { data: orgs, error } = await supabase
    .from('organizations')
    .select('id, name, city, country, zip_code, status, created_at, pricing_tier, monthly_price_usd, payment_status, subscription_end_date, referred_by_affiliate_id')
    .order('created_at', { ascending: true })
  if (error) throw new HttpError(500, error.message)

  const affiliateIds = [...new Set((orgs ?? []).map((o) => o.referred_by_affiliate_id).filter(Boolean))] as string[]

  const [{ data: admins }, { data: leadCounts }, { data: dealRows }, { data: userCounts }, { data: affiliates }] = await Promise.all([
    supabase.from('profiles').select('id, email, nickname, organization_id').eq('role', 'admin'),
    supabase.from('leads').select('organization_id'),
    supabase.from('deals').select('organization_id, value, stage_id, deal_stages(is_closed)'),
    supabase.from('profiles').select('organization_id').eq('role', 'user'),
    affiliateIds.length > 0
      ? supabase.from('affiliates').select('id, full_name').in('id', affiliateIds)
      : Promise.resolve({ data: [] as any[] }),
  ])

  const adminByOrg = new Map((admins ?? []).map((a) => [a.organization_id, a]))
  const affiliateNameById = new Map((affiliates ?? []).map((a: any) => [a.id, a.full_name]))

  const leadCountByOrg = new Map<string, number>()
  for (const l of leadCounts ?? []) {
    if (!l.organization_id) continue
    leadCountByOrg.set(l.organization_id, (leadCountByOrg.get(l.organization_id) ?? 0) + 1)
  }

  const userCountByOrg = new Map<string, number>()
  for (const u of userCounts ?? []) {
    if (!u.organization_id) continue
    userCountByOrg.set(u.organization_id, (userCountByOrg.get(u.organization_id) ?? 0) + 1)
  }

  const dealCountByOrg = new Map<string, number>()
  const pipelineValueByOrg = new Map<string, number>()
  for (const d of (dealRows ?? []) as any[]) {
    if (!d.organization_id) continue
    dealCountByOrg.set(d.organization_id, (dealCountByOrg.get(d.organization_id) ?? 0) + 1)
    if (!d.deal_stages?.is_closed) {
      pipelineValueByOrg.set(d.organization_id, (pipelineValueByOrg.get(d.organization_id) ?? 0) + Number(d.value))
    }
  }

  return json(200, {
    organizations: (orgs ?? []).map((org) => ({
      id: org.id,
      name: org.name,
      city: org.city,
      country: org.country,
      zip_code: org.zip_code,
      status: org.status,
      created_at: org.created_at,
      pricing_tier: org.pricing_tier,
      monthly_price_usd: org.monthly_price_usd,
      payment_status: org.payment_status,
      subscription_end_date: org.subscription_end_date,
      referred_by_affiliate_id: org.referred_by_affiliate_id,
      referred_by_affiliate_name: org.referred_by_affiliate_id ? affiliateNameById.get(org.referred_by_affiliate_id) ?? null : null,
      admin: adminByOrg.get(org.id) ?? null,
      userCount: userCountByOrg.get(org.id) ?? 0,
      leadCount: leadCountByOrg.get(org.id) ?? 0,
      dealCount: dealCountByOrg.get(org.id) ?? 0,
      openPipelineValue: pipelineValueByOrg.get(org.id) ?? 0,
    })),
  })
}

export async function getOrganization(id: string, user: AuthedUser) {
  requireSuperAdmin(user)
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('organizations')
    .select('id, name, city, country, zip_code, status, created_at, pricing_tier, monthly_price_usd, payment_status, subscription_end_date, referred_by_affiliate_id')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new HttpError(500, error.message)
  if (!data) throw new HttpError(404, 'Organization not found')
  return json(200, data)
}

/** Body: { organizationName, email, password, nickname }. Creates the organization,
 * the Admin's Supabase Auth account, and links the profile — best-effort atomic:
 * rolls back whatever was already created if a later step fails. */
export async function createOrganizationWithAdmin(event: HandlerEvent, user: AuthedUser) {
  requireSuperAdmin(user)
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')

  const organizationName = (body.organizationName ?? '').trim()
  const email = (body.email ?? '').trim()
  const password = body.password ?? ''
  const nickname = (body.nickname ?? '').trim()

  if (!organizationName) throw new HttpError(400, 'organizationName is required')
  if (!email) throw new HttpError(400, 'email is required')
  if (!password || password.length < 8) throw new HttpError(400, 'password must be at least 8 characters')
  if (!nickname) throw new HttpError(400, 'nickname is required')

  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .insert({ name: organizationName, created_by: user.id, status: 'active' })
    .select('id, name, city, country, zip_code, status, created_at')
    .single()
  if (orgErr) throw new HttpError(500, orgErr.message)

  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (createErr) {
    await supabase.from('organizations').delete().eq('id', org.id)
    throw new HttpError(400, createErr.message)
  }

  const { error: profileErr } = await supabase
    .from('profiles')
    .update({ nickname, role: 'admin', organization_id: org.id })
    .eq('id', created.user.id)

  if (profileErr) {
    await supabase.auth.admin.deleteUser(created.user.id)
    await supabase.from('organizations').delete().eq('id', org.id)
    throw new HttpError(500, profileErr.message)
  }

  await logAuditEvent('organization_created', user, event, {
    organizationId: org.id,
    targetProfileId: created.user.id,
    metadata: { name: organizationName, admin_email: email, admin_nickname: nickname },
  })
  await logAuditEvent('admin_account_created', user, event, {
    organizationId: org.id,
    targetProfileId: created.user.id,
    metadata: { email, nickname },
  })

  return json(201, { organization: org, admin: { id: created.user.id, email, nickname } })
}

/** Body: { status: 'active' | 'suspended' }. Suspending also deactivates/bans
 * every member of that organization; reactivating reverses it. */
export async function updateOrganizationStatus(id: string, event: HandlerEvent, user: AuthedUser) {
  requireSuperAdmin(user)
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')
  const status = body.status

  if (!['active', 'suspended'].includes(status)) throw new HttpError(400, 'status must be "active" or "suspended"')

  const { data: org, error: fetchErr } = await supabase.from('organizations').select('id').eq('id', id).maybeSingle()
  if (fetchErr) throw new HttpError(500, fetchErr.message)
  if (!org) throw new HttpError(404, 'Organization not found')

  const { data, error } = await supabase
    .from('organizations')
    .update({ status })
    .eq('id', id)
    .select('id, name, city, country, zip_code, status, created_at')
    .single()
  if (error) throw new HttpError(500, error.message)

  const { data: members, error: membersErr } = await supabase
    .from('profiles')
    .select('id')
    .eq('organization_id', id)
  if (membersErr) throw new HttpError(500, membersErr.message)

  const isActive = status === 'active'
  await Promise.all(
    (members ?? []).map(async (m) => {
      await supabase.from('profiles').update({ is_active: isActive }).eq('id', m.id)
      await supabase.auth.admin.updateUserById(m.id, { ban_duration: isActive ? 'none' : BAN_DURATION })
    })
  )

  await logAuditEvent(isActive ? 'organization_reactivated' : 'organization_suspended', user, event, {
    organizationId: id,
    metadata: { name: data.name },
  })

  return json(200, data)
}

/** Body: { confirm: string } — must match the organization's name exactly.
 * Permanently deletes every member's auth account (which cascades to their
 * profile row), then the organization itself (which cascades to its leads,
 * deals, and every other org-scoped table via ON DELETE CASCADE). */
export async function deleteOrganization(id: string, event: HandlerEvent, user: AuthedUser) {
  requireSuperAdmin(user)
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')

  const { data: org, error: fetchErr } = await supabase.from('organizations').select('id, name').eq('id', id).maybeSingle()
  if (fetchErr) throw new HttpError(500, fetchErr.message)
  if (!org) throw new HttpError(404, 'Organization not found')

  if ((body.confirm ?? '').trim().toLowerCase() !== org.name.toLowerCase()) {
    throw new HttpError(400, "Confirmation text does not match this organization's name")
  }

  const { data: members, error: membersErr } = await supabase.from('profiles').select('id').eq('organization_id', id)
  if (membersErr) throw new HttpError(500, membersErr.message)

  await logAuditEvent('organization_deleted', user, event, {
    organizationId: id,
    metadata: { name: org.name },
  })

  for (const m of members ?? []) {
    await supabase.auth.admin.deleteUser(m.id)
  }

  const { error } = await supabase.from('organizations').delete().eq('id', id)
  if (error) throw new HttpError(500, error.message)

  return json(200, { success: true })
}
