import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import { resolveOrganizationId } from '../lib/permissions.js'
import type { AuthedUser } from '../lib/auth.js'

const BUCKET = 'lead-attachments'

async function requireLeadInScope(leadId: string, user: AuthedUser, event: HandlerEvent) {
  const supabase = getSupabaseAdmin()
  const orgId = resolveOrganizationId(user, event)
  const { data: lead, error } = await supabase.from('leads').select('id, organization_id').eq('id', leadId).maybeSingle()
  if (error) throw new HttpError(500, error.message)
  if (!lead) throw new HttpError(404, 'Lead not found')
  if (user.role !== 'super_admin' && lead.organization_id !== orgId) throw new HttpError(404, 'Lead not found')
}

/** Mints a short-lived signed upload URL so the browser can PUT the file straight to Storage. */
export async function createSignedUpload(event: HandlerEvent, user: AuthedUser) {
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')
  const { lead_id, file_name } = body

  if (!lead_id || !file_name) {
    throw new HttpError(400, 'lead_id and file_name are required')
  }
  await requireLeadInScope(lead_id, user, event)

  const safeName = String(file_name).replace(/[^a-zA-Z0-9_.\-]/g, '_')
  const storagePath = `${lead_id}/${crypto.randomUUID()}-${safeName}`

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(storagePath)
  if (error) throw new HttpError(500, error.message)

  return json(200, { signedUrl: data.signedUrl, token: data.token, storage_path: storagePath })
}

export async function saveAttachmentMetadata(event: HandlerEvent, user: AuthedUser) {
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')
  const { lead_id, file_name, storage_path, content_type, size_bytes } = body

  if (!lead_id || !file_name || !storage_path) {
    throw new HttpError(400, 'lead_id, file_name and storage_path are required')
  }
  await requireLeadInScope(lead_id, user, event)

  const { data, error } = await supabase
    .from('lead_attachments')
    .insert({
      lead_id,
      file_name,
      storage_path,
      content_type: content_type ?? null,
      size_bytes: size_bytes ?? null,
      uploaded_by: user.id,
    })
    .select('*')
    .single()

  if (error) throw new HttpError(500, error.message)
  return json(201, data)
}

async function requireAttachmentInScope(attachmentId: string, user: AuthedUser, event: HandlerEvent) {
  const supabase = getSupabaseAdmin()
  const { data: attachment, error: fetchErr } = await supabase
    .from('lead_attachments')
    .select('storage_path, lead_id')
    .eq('id', attachmentId)
    .single()
  if (fetchErr || !attachment) throw new HttpError(404, 'Attachment not found')
  await requireLeadInScope(attachment.lead_id, user, event)
  return attachment
}

export async function getSignedDownloadUrl(attachmentId: string, event: HandlerEvent, user: AuthedUser) {
  const supabase = getSupabaseAdmin()
  const attachment = await requireAttachmentInScope(attachmentId, user, event)

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(attachment.storage_path, 60 * 5)
  if (error) throw new HttpError(500, error.message)

  return json(200, { url: data.signedUrl })
}

export async function deleteAttachment(attachmentId: string, event: HandlerEvent, user: AuthedUser) {
  const supabase = getSupabaseAdmin()
  const attachment = await requireAttachmentInScope(attachmentId, user, event)

  await supabase.storage.from(BUCKET).remove([attachment.storage_path])

  const { error } = await supabase.from('lead_attachments').delete().eq('id', attachmentId)
  if (error) throw new HttpError(500, error.message)

  return json(200, { success: true })
}
