import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import { requireAdminOrAbove, resolveOrganizationId } from '../lib/permissions.js'
import type { AuthedUser } from '../lib/auth.js'

const BUCKET = 'org-logos'

// Curated so a picked color always reads well against the dark theme — kept
// in sync with the frontend's src/lib/brandColors.ts (each id there maps to
// the same 500-shade hex stored here).
const CURATED_PALETTE = [
  { id: 'indigo', label: 'Indigo', hex: '#5b6cf0' },
  { id: 'emerald', label: 'Emerald', hex: '#10b981' },
  { id: 'amber', label: 'Amber', hex: '#f59e0b' },
  { id: 'rose', label: 'Rose', hex: '#f43f5e' },
  { id: 'cyan', label: 'Cyan', hex: '#06b6d4' },
  { id: 'violet', label: 'Violet', hex: '#8b5cf6' },
  { id: 'fuchsia', label: 'Fuchsia', hex: '#d946ef' },
  { id: 'sky', label: 'Sky', hex: '#0ea5e9' },
  { id: 'lime', label: 'Lime', hex: '#84cc16' },
  { id: 'orange', label: 'Orange', hex: '#f97316' },
] as const

const ALLOWED_HEX = new Set(CURATED_PALETTE.map((c) => c.hex.toLowerCase()))

function publicLogoUrl(storagePath: string | null): string | null {
  if (!storagePath) return null
  const supabase = getSupabaseAdmin()
  return supabase.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl
}

async function getOrgBrandingRow(organizationId: string) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('organizations')
    .select('id, name, logo_storage_path, accent_color, display_name')
    .eq('id', organizationId)
    .maybeSingle()
  if (error) throw new HttpError(500, error.message)
  if (!data) throw new HttpError(404, 'Organization not found')
  return data
}

function brandingResponse(row: { logo_storage_path: string | null; accent_color: string | null; display_name: string | null }) {
  return {
    logo_url: publicLogoUrl(row.logo_storage_path),
    accent_color: row.accent_color,
    display_name: row.display_name,
    palette: CURATED_PALETTE,
  }
}

/** Super Admin platform-level views (organization_id resolves to null — no
 * org entered) have no branding row to read; they always get the app default. */
export async function getBranding(event: HandlerEvent, user: AuthedUser) {
  const orgId = resolveOrganizationId(user, event)
  if (orgId === null) {
    return json(200, brandingResponse({ logo_storage_path: null, accent_color: null, display_name: null }))
  }
  const row = await getOrgBrandingRow(orgId)
  return json(200, brandingResponse(row))
}

/** Mints a short-lived signed upload URL so the browser can PUT the logo straight to Storage. */
export async function createLogoSignedUpload(event: HandlerEvent, user: AuthedUser) {
  requireAdminOrAbove(user)
  const orgId = resolveOrganizationId(user, event)
  if (orgId === null) throw new HttpError(400, 'Branding is only available within an organization')

  const body = JSON.parse(event.body || '{}')
  const fileName = body.file_name
  if (!fileName) throw new HttpError(400, 'file_name is required')

  const safeName = String(fileName).replace(/[^a-zA-Z0-9_.\-]/g, '_')
  const storagePath = `${orgId}/logo-${crypto.randomUUID()}-${safeName}`

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(storagePath)
  if (error) throw new HttpError(500, error.message)

  return json(200, { signedUrl: data.signedUrl, token: data.token, storage_path: storagePath })
}

export async function updateBranding(event: HandlerEvent, user: AuthedUser) {
  requireAdminOrAbove(user)
  const orgId = resolveOrganizationId(user, event)
  if (orgId === null) throw new HttpError(400, 'Branding is only available within an organization')

  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')
  const update: Record<string, string | null> = {}

  if ('logo_storage_path' in body) {
    if (body.logo_storage_path !== null && typeof body.logo_storage_path !== 'string') {
      throw new HttpError(400, 'logo_storage_path must be a string or null')
    }
    update.logo_storage_path = body.logo_storage_path
  }

  if ('accent_color' in body) {
    if (body.accent_color !== null && !ALLOWED_HEX.has(String(body.accent_color).toLowerCase())) {
      throw new HttpError(400, 'accent_color must be one of the curated palette values, or null')
    }
    update.accent_color = body.accent_color
  }

  if ('display_name' in body) {
    if (body.display_name !== null && typeof body.display_name !== 'string') {
      throw new HttpError(400, 'display_name must be a string or null')
    }
    update.display_name = body.display_name === null ? null : body.display_name.trim() || null
  }

  if (Object.keys(update).length === 0) throw new HttpError(400, 'Nothing to update')

  // Replacing/clearing the logo — delete the previous file so storage doesn't accumulate orphans.
  if ('logo_storage_path' in update) {
    const existing = await getOrgBrandingRow(orgId)
    if (existing.logo_storage_path && existing.logo_storage_path !== update.logo_storage_path) {
      await supabase.storage.from(BUCKET).remove([existing.logo_storage_path])
    }
  }

  const { data, error } = await supabase
    .from('organizations')
    .update(update)
    .eq('id', orgId)
    .select('logo_storage_path, accent_color, display_name')
    .single()
  if (error) throw new HttpError(500, error.message)

  return json(200, brandingResponse(data))
}

export async function resetBranding(event: HandlerEvent, user: AuthedUser) {
  requireAdminOrAbove(user)
  const orgId = resolveOrganizationId(user, event)
  if (orgId === null) throw new HttpError(400, 'Branding is only available within an organization')

  const supabase = getSupabaseAdmin()
  const existing = await getOrgBrandingRow(orgId)
  if (existing.logo_storage_path) {
    await supabase.storage.from(BUCKET).remove([existing.logo_storage_path])
  }

  const { error } = await supabase
    .from('organizations')
    .update({ logo_storage_path: null, accent_color: null, display_name: null })
    .eq('id', orgId)
  if (error) throw new HttpError(500, error.message)

  return json(200, brandingResponse({ logo_storage_path: null, accent_color: null, display_name: null }))
}
