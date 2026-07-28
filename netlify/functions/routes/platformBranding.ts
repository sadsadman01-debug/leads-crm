import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import { requireSuperAdmin, requireAal2IfEnrolled } from '../lib/permissions.js'
import { CURATED_PALETTE, ALLOWED_HEX } from '../lib/brandPalette.js'
import type { AuthedUser } from '../lib/auth.js'

const BUCKET = 'org-logos'

type PlatformSettingsRow = {
  id: string
  platform_logo_storage_path: string | null
  platform_accent_color: string | null
  platform_name: string | null
  support_whatsapp: string | null
  support_email: string | null
}

const SETTINGS_COLUMNS =
  'id, platform_logo_storage_path, platform_accent_color, platform_name, support_whatsapp, support_email'

function publicLogoUrl(storagePath: string | null): string | null {
  if (!storagePath) return null
  const supabase = getSupabaseAdmin()
  return supabase.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl
}

/** Single platform-wide row, created lazily on first access — mirrors
 * settings.ts's getOrCreateSettingsRow pattern, just with no organization scope. */
async function getOrCreatePlatformSettingsRow(): Promise<PlatformSettingsRow> {
  const supabase = getSupabaseAdmin()
  const { data: existing, error } = await supabase
    .from('platform_settings')
    .select(SETTINGS_COLUMNS)
    .limit(1)
    .maybeSingle()
  if (error) throw new HttpError(500, error.message)
  if (existing) return existing

  const { data: created, error: createErr } = await supabase
    .from('platform_settings')
    .insert({})
    .select(SETTINGS_COLUMNS)
    .single()
  if (createErr) throw new HttpError(500, createErr.message)
  return created
}

function brandingResponse(row: PlatformSettingsRow) {
  return {
    logo_url: publicLogoUrl(row.platform_logo_storage_path),
    accent_color: row.platform_accent_color,
    platform_name: row.platform_name,
    support_whatsapp: row.support_whatsapp,
    support_email: row.support_email,
    palette: CURATED_PALETTE,
  }
}

/** Public — reachable from the Login/Request Access/Forgot Password pages
 * before any session exists, so this takes no `user` param and never gates. */
export async function getPlatformBranding() {
  const row = await getOrCreatePlatformSettingsRow()
  return json(200, brandingResponse(row))
}

export async function createPlatformLogoSignedUpload(event: HandlerEvent, user: AuthedUser) {
  requireSuperAdmin(user)
  const body = JSON.parse(event.body || '{}')
  const fileName = body.file_name
  if (!fileName) throw new HttpError(400, 'file_name is required')

  const safeName = String(fileName).replace(/[^a-zA-Z0-9_.\-]/g, '_')
  const storagePath = `platform/logo-${crypto.randomUUID()}-${safeName}`

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(storagePath)
  if (error) throw new HttpError(500, error.message)

  return json(200, { signedUrl: data.signedUrl, token: data.token, storage_path: storagePath })
}

export async function updatePlatformBranding(event: HandlerEvent, user: AuthedUser) {
  requireSuperAdmin(user)
  await requireAal2IfEnrolled(user)
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')
  const update: Record<string, string | null> = {}

  if ('logo_storage_path' in body) {
    if (body.logo_storage_path !== null && typeof body.logo_storage_path !== 'string') {
      throw new HttpError(400, 'logo_storage_path must be a string or null')
    }
    update.platform_logo_storage_path = body.logo_storage_path
  }

  if ('accent_color' in body) {
    if (body.accent_color !== null && !ALLOWED_HEX.has(String(body.accent_color).toLowerCase())) {
      throw new HttpError(400, 'accent_color must be one of the curated palette values, or null')
    }
    update.platform_accent_color = body.accent_color
  }

  if ('platform_name' in body) {
    if (body.platform_name !== null && typeof body.platform_name !== 'string') {
      throw new HttpError(400, 'platform_name must be a string or null')
    }
    update.platform_name = body.platform_name === null ? null : body.platform_name.trim() || null
  }

  if ('support_whatsapp' in body) {
    if (body.support_whatsapp !== null && typeof body.support_whatsapp !== 'string') {
      throw new HttpError(400, 'support_whatsapp must be a string or null')
    }
    update.support_whatsapp = body.support_whatsapp === null ? null : body.support_whatsapp.trim() || null
  }

  if ('support_email' in body) {
    if (body.support_email !== null && typeof body.support_email !== 'string') {
      throw new HttpError(400, 'support_email must be a string or null')
    }
    update.support_email = body.support_email === null ? null : body.support_email.trim() || null
  }

  if (Object.keys(update).length === 0) throw new HttpError(400, 'Nothing to update')

  const row = await getOrCreatePlatformSettingsRow()

  // Replacing/clearing the logo — delete the previous file so storage doesn't accumulate orphans.
  if ('platform_logo_storage_path' in update) {
    if (row.platform_logo_storage_path && row.platform_logo_storage_path !== update.platform_logo_storage_path) {
      await supabase.storage.from(BUCKET).remove([row.platform_logo_storage_path])
    }
  }

  const { data, error } = await supabase
    .from('platform_settings')
    .update(update)
    .eq('id', row.id)
    .select(SETTINGS_COLUMNS)
    .single()
  if (error) throw new HttpError(500, error.message)

  return json(200, brandingResponse(data))
}

/** "Reset to Original App Defaults" — clears the row back to nulls; the
 * hardcoded fallback (Target icon / "Leads CRM" / default indigo) then takes
 * over entirely on the frontend, which is what guarantees the app always has
 * SOME valid branding even if this row is empty. */
export async function resetPlatformBranding(event: HandlerEvent, user: AuthedUser) {
  requireSuperAdmin(user)
  await requireAal2IfEnrolled(user)
  const supabase = getSupabaseAdmin()
  const row = await getOrCreatePlatformSettingsRow()

  if (row.platform_logo_storage_path) {
    await supabase.storage.from(BUCKET).remove([row.platform_logo_storage_path])
  }

  const { error } = await supabase
    .from('platform_settings')
    .update({ platform_logo_storage_path: null, platform_accent_color: null, platform_name: null })
    .eq('id', row.id)
  if (error) throw new HttpError(500, error.message)

  // Support Contact fields are a separate concern — untouched by this reset.
  return json(
    200,
    brandingResponse({
      ...row,
      platform_logo_storage_path: null,
      platform_accent_color: null,
      platform_name: null,
    })
  )
}
