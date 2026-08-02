import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import { requireSuperAdmin, requireAal2IfEnrolled } from '../lib/permissions.js'
import { generateTempPassword } from '../lib/passwordGen.js'
import { generateUniqueReferralCode } from '../lib/referralCode.js'
import { notifySuperAdmins } from '../lib/notifications.js'
import { logAuditEvent, insertAuditLog, getClientIp } from '../lib/auditLog.js'
import { ALLOWED_SIGNUP_COUNTRIES } from '../lib/allowedSignupCountries.js'
import type { AuthedUser } from '../lib/auth.js'

const COLUMNS = 'id, full_name, email, how_they_plan_to_promote, city, country, zip_code, status, applied_at, reviewed_at, reviewed_by, rejection_reason'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** POST /affiliate-applications — public, unauthenticated. Basic-info-only —
 * no payout/payment details collected at this stage. */
export async function createAffiliateApplication(event: HandlerEvent) {
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')

  const full_name = (body.full_name ?? '').trim()
  const email = (body.email ?? '').trim()
  const how_they_plan_to_promote = (body.how_they_plan_to_promote ?? '').trim() || null
  const city = (body.city ?? '').trim()
  const country = (body.country ?? '').trim()
  const zip_code = (body.zip_code ?? '').trim()

  if (!full_name) throw new HttpError(400, 'Full name is required')
  if (!email) throw new HttpError(400, 'Email is required')
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Enter a valid email address')
  if (!city) throw new HttpError(400, 'City is required')
  if (!country) throw new HttpError(400, 'Country is required')
  if (!zip_code) throw new HttpError(400, 'ZIP/Postal Code is required')
  if (!ALLOWED_SIGNUP_COUNTRIES.includes(country)) {
    throw new HttpError(
      400,
      `Leadify is currently only available in ${ALLOWED_SIGNUP_COUNTRIES.join(', ')}. We'll be expanding to more countries soon — thank you for your interest!`
    )
  }

  const { data, error } = await supabase
    .from('affiliate_applications')
    .insert({ full_name, email, how_they_plan_to_promote, city, country, zip_code, status: 'pending' })
    .select(COLUMNS)
    .single()
  if (error) throw new HttpError(500, error.message)

  await notifySuperAdmins({
    type: 'affiliate_application',
    title: 'New affiliate application',
    message: `${full_name} (${email}) applied to become an affiliate.`,
    link_route: '/affiliate-applications',
    related_entity_id: data.id,
    related_entity_type: 'affiliate_application',
  })

  await insertAuditLog({
    eventType: 'affiliate_application_submitted',
    metadata: { full_name, email },
    ipAddress: getClientIp(event),
  })

  return json(201, data)
}

export async function listAffiliateApplications(user: AuthedUser) {
  requireSuperAdmin(user)
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('affiliate_applications').select(COLUMNS).order('applied_at', { ascending: false })
  if (error) throw new HttpError(500, error.message)
  return json(200, { applications: data ?? [] })
}

async function getApplicationOrThrow(id: string) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('affiliate_applications').select(COLUMNS).eq('id', id).maybeSingle()
  if (error) throw new HttpError(500, error.message)
  if (!data) throw new HttpError(404, 'Affiliate application not found')
  return data
}

/** Mirrors approveSignupRequest's exact pattern: auto-confirmed Auth account
 * with a securely generated temporary password, force_password_change set,
 * a unique referral_code minted, then the affiliates row created. */
export async function approveAffiliateApplication(id: string, event: HandlerEvent, user: AuthedUser) {
  requireSuperAdmin(user)
  await requireAal2IfEnrolled(user)
  const supabase = getSupabaseAdmin()
  const application = await getApplicationOrThrow(id)
  if (application.status !== 'pending') throw new HttpError(400, 'This application has already been reviewed')

  const temporaryPassword = generateTempPassword()
  const referralCode = await generateUniqueReferralCode()

  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email: application.email,
    password: temporaryPassword,
    email_confirm: true,
  })
  if (createErr) throw new HttpError(400, createErr.message)

  const { error: profileErr } = await supabase
    .from('profiles')
    .update({ nickname: application.full_name, role: 'affiliate', organization_id: null, force_password_change: true })
    .eq('id', created.user.id)
  if (profileErr) {
    await supabase.auth.admin.deleteUser(created.user.id)
    throw new HttpError(500, profileErr.message)
  }

  const { data: affiliate, error: affErr } = await supabase
    .from('affiliates')
    .insert({
      profile_id: created.user.id,
      full_name: application.full_name,
      email: application.email,
      referral_code: referralCode,
      city: application.city,
      country: application.country,
      zip_code: application.zip_code,
    })
    .select('id, full_name, email, referral_code, city, country, zip_code, status, created_at')
    .single()
  if (affErr) {
    await supabase.auth.admin.deleteUser(created.user.id)
    throw new HttpError(500, affErr.message)
  }

  const { data: updatedApplication, error: reqErr } = await supabase
    .from('affiliate_applications')
    .update({ status: 'approved', reviewed_at: new Date().toISOString(), reviewed_by: user.id })
    .eq('id', id)
    .select(COLUMNS)
    .single()
  if (reqErr) throw new HttpError(500, reqErr.message)

  await logAuditEvent('affiliate_approved', user, event, {
    targetProfileId: created.user.id,
    metadata: { full_name: application.full_name, email: application.email, referral_code: referralCode },
  })

  return json(200, {
    application: updatedApplication,
    affiliate,
    admin: { email: application.email, nickname: application.full_name, temporary_password: temporaryPassword },
  })
}

/** Body: { rejection_reason?: string } — an internal-only note. */
export async function rejectAffiliateApplication(id: string, event: HandlerEvent, user: AuthedUser) {
  requireSuperAdmin(user)
  await requireAal2IfEnrolled(user)
  const application = await getApplicationOrThrow(id)
  if (application.status !== 'pending') throw new HttpError(400, 'This application has already been reviewed')

  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')
  const rejection_reason = (body.rejection_reason ?? '').trim() || null

  const { data, error } = await supabase
    .from('affiliate_applications')
    .update({ status: 'rejected', reviewed_at: new Date().toISOString(), reviewed_by: user.id, rejection_reason })
    .eq('id', id)
    .select(COLUMNS)
    .single()
  if (error) throw new HttpError(500, error.message)

  await logAuditEvent('affiliate_rejected', user, event, {
    metadata: { full_name: application.full_name, email: application.email, rejection_reason },
  })

  return json(200, data)
}
