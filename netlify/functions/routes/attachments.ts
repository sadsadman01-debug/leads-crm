import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import type { AuthedUser } from '../lib/auth.js'

const BUCKET = 'lead-attachments'

/** Mints a short-lived signed upload URL so the browser can PUT the file straight to Storage. */
export async function createSignedUpload(event: HandlerEvent) {
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')
  const { lead_id, file_name } = body

  if (!lead_id || !file_name) {
    throw new HttpError(400, 'lead_id and file_name are required')
  }

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

export async function getSignedDownloadUrl(attachmentId: string) {
  const supabase = getSupabaseAdmin()
  const { data: attachment, error: fetchErr } = await supabase
    .from('lead_attachments')
    .select('storage_path')
    .eq('id', attachmentId)
    .single()
  if (fetchErr) throw new HttpError(404, 'Attachment not found')

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(attachment.storage_path, 60 * 5)
  if (error) throw new HttpError(500, error.message)

  return json(200, { url: data.signedUrl })
}

export async function deleteAttachment(attachmentId: string) {
  const supabase = getSupabaseAdmin()
  const { data: attachment, error: fetchErr } = await supabase
    .from('lead_attachments')
    .select('storage_path')
    .eq('id', attachmentId)
    .single()
  if (fetchErr) throw new HttpError(404, 'Attachment not found')

  await supabase.storage.from(BUCKET).remove([attachment.storage_path])

  const { error } = await supabase.from('lead_attachments').delete().eq('id', attachmentId)
  if (error) throw new HttpError(500, error.message)

  return json(200, { success: true })
}
