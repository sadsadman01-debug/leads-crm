import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'

export async function listTemplates() {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('templates')
    .select('id, name, subject, body, created_at, updated_at')
    .order('name', { ascending: true })
  if (error) throw new HttpError(500, error.message)
  return json(200, { templates: data ?? [] })
}

export async function createTemplate(event: HandlerEvent) {
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')
  const name = (body.name ?? '').trim()
  if (!name) throw new HttpError(400, 'name is required')

  const { data, error } = await supabase
    .from('templates')
    .insert({ name, subject: body.subject ?? '', body: body.body ?? '' })
    .select('id, name, subject, body, created_at, updated_at')
    .single()

  if (error) throw new HttpError(500, error.message)
  return json(201, data)
}

export async function updateTemplate(id: string, event: HandlerEvent) {
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')

  const update: Record<string, any> = {}
  if ('name' in body) {
    const name = (body.name ?? '').trim()
    if (!name) throw new HttpError(400, 'name cannot be empty')
    update.name = name
  }
  if ('subject' in body) update.subject = body.subject ?? ''
  if ('body' in body) update.body = body.body ?? ''

  if (Object.keys(update).length === 0) throw new HttpError(400, 'Nothing to update')

  const { data, error } = await supabase
    .from('templates')
    .update(update)
    .eq('id', id)
    .select('id, name, subject, body, created_at, updated_at')
    .single()

  if (error) throw new HttpError(500, error.message)
  return json(200, data)
}

export async function deleteTemplate(id: string) {
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('templates').delete().eq('id', id)
  if (error) throw new HttpError(500, error.message)
  return json(200, { success: true })
}
