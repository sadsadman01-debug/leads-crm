import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import { requireSuperAdmin } from '../lib/permissions.js'
import { generateTempPassword } from '../lib/passwordGen.js'
import type { AuthedUser } from '../lib/auth.js'

const COLUMNS =
  'id, organization_name, contact_name, email, phone, message, status, requested_at, reviewed_at, reviewed_by, rejection_reason'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** POST /signup-requests — public, unauthenticated. Only ever inserts a
 * pending row; never creates an Auth account or an Organization. */
export async function createSignupRequest(event: HandlerEvent) {
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')

  const organization_name = (body.organization_name ?? '').trim()
  const contact_name = (body.contact_name ?? '').trim()
  const email = (body.email ?? '').trim()
  const phone = (body.phone ?? '').trim() || null
  const message = (body.message ?? '').trim() || null

  if (!organization_name) throw new HttpError(400, 'Organization name is required')
  if (!contact_name) throw new HttpError(400, 'Contact name is required')
  if (!email) throw new HttpError(400, 'Email is required')
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Enter a valid email address')

  const { data, error } = await supabase
    .from('signup_requests')
    .insert({ organization_name, contact_name, email, phone, message, status: 'pending' })
    .select(COLUMNS)
    .single()

  if (error) throw new HttpError(500, error.message)
  return json(201, data)
}

export async function listSignupRequests(user: AuthedUser) {
  requireSuperAdmin(user)
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('signup_requests').select(COLUMNS).order('requested_at', { ascending: false })
  if (error) throw new HttpError(500, error.message)
  return json(200, { requests: data ?? [] })
}

async function getRequestOrThrow(id: string) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('signup_requests').select(COLUMNS).eq('id', id).maybeSingle()
  if (error) throw new HttpError(500, error.message)
  if (!data) throw new HttpError(404, 'Signup request not found')
  return data
}

/** Atomically (best-effort, with rollback on failure) creates the Organization,
 * an auto-confirmed Auth account with a securely generated temporary password,
 * and the Admin profile flagged force_password_change — then marks the request
 * approved. The temporary password is returned once, in this response only;
 * it is never stored anywhere and never sent by this app via email. */
export async function approveSignupRequest(id: string, event: HandlerEvent, user: AuthedUser) {
  requireSuperAdmin(user)
  const supabase = getSupabaseAdmin()
  const request = await getRequestOrThrow(id)
  if (request.status !== 'pending') throw new HttpError(400, 'This request has already been reviewed')

  const temporaryPassword = generateTempPassword()

  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .insert({ name: request.organization_name, created_by: user.id, status: 'active' })
    .select('id, name')
    .single()
  if (orgErr) throw new HttpError(500, orgErr.message)

  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email: request.email,
    password: temporaryPassword,
    email_confirm: true,
  })
  if (createErr) {
    await supabase.from('organizations').delete().eq('id', org.id)
    throw new HttpError(400, createErr.message)
  }

  const { error: profileErr } = await supabase
    .from('profiles')
    .update({
      nickname: request.contact_name,
      role: 'admin',
      organization_id: org.id,
      force_password_change: true,
    })
    .eq('id', created.user.id)

  if (profileErr) {
    await supabase.auth.admin.deleteUser(created.user.id)
    await supabase.from('organizations').delete().eq('id', org.id)
    throw new HttpError(500, profileErr.message)
  }

  const { data: updatedRequest, error: reqErr } = await supabase
    .from('signup_requests')
    .update({ status: 'approved', reviewed_at: new Date().toISOString(), reviewed_by: user.id })
    .eq('id', id)
    .select(COLUMNS)
    .single()
  if (reqErr) throw new HttpError(500, reqErr.message)

  return json(200, {
    request: updatedRequest,
    organization: org,
    admin: { email: request.email, nickname: request.contact_name, temporary_password: temporaryPassword },
  })
}

/** Body: { rejection_reason?: string } — an internal-only note, never sent anywhere. */
export async function rejectSignupRequest(id: string, event: HandlerEvent, user: AuthedUser) {
  requireSuperAdmin(user)
  const request = await getRequestOrThrow(id)
  if (request.status !== 'pending') throw new HttpError(400, 'This request has already been reviewed')

  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')
  const rejection_reason = (body.rejection_reason ?? '').trim() || null

  const { data, error } = await supabase
    .from('signup_requests')
    .update({ status: 'rejected', reviewed_at: new Date().toISOString(), reviewed_by: user.id, rejection_reason })
    .eq('id', id)
    .select(COLUMNS)
    .single()
  if (error) throw new HttpError(500, error.message)
  return json(200, data)
}
