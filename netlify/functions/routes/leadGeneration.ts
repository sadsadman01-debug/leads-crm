import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import { resolveOrganizationId, requireFeaturePermission, scopeToOrg, isAdminOrAbove } from '../lib/permissions.js'
import type { AuthedUser } from '../lib/auth.js'
import { geocodeLocation, queryOverpassCategory, LEAD_GEN_CATEGORIES, type CompleteLeadGenCandidate, type OsmCandidate } from '../lib/osm.js'
import { getOrDiscoverEmail } from '../lib/emailEnrichment.js'
import { dedupeCandidatesBatch, flagDuplicatesAgainstExisting } from '../lib/leadGenDedupe.js'
import { ensureTagIds } from '../lib/tags.js'
import { logActivities } from '../lib/activities.js'

const PRIORITIES = ['High', 'Medium', 'Low']

// Capped for two reasons: keeps a single search within the serverless
// function's execution time budget (each candidate needing enrichment costs
// several sequential website fetches), and Overpass's own fair-use policy
// discourages very large single queries.
const MAX_RAW_RESULTS = 25
const ENRICH_CONCURRENCY = 4
const MAX_EXISTING_LEADS_SCANNED = 1000

async function enrichMissingEmails(candidates: OsmCandidate[]): Promise<OsmCandidate[]> {
  const results: OsmCandidate[] = []
  for (let i = 0; i < candidates.length; i += ENRICH_CONCURRENCY) {
    const chunk = candidates.slice(i, i + ENRICH_CONCURRENCY)
    const enrichedChunk = await Promise.all(
      chunk.map(async (c) => {
        if (c.email || !c.website) return c
        const email = await getOrDiscoverEmail(c.website)
        return { ...c, email }
      })
    )
    results.push(...enrichedChunk)
  }
  return results
}

/** POST /lead-generation/search — body: { location: string, category: string }.
 * Geocodes the location, queries Overpass for that category within the
 * resulting bounding box, attempts website email-enrichment for any
 * candidate that has a website but no email, strictly filters to candidates
 * with Name+Phone+Website+Email, deduplicates within the batch, then flags
 * (but does not remove) likely duplicates against the organization's
 * existing leads. */
export async function searchLeadGeneration(event: HandlerEvent, user: AuthedUser) {
  requireFeaturePermission(user, 'canGenerateLeads')
  const orgId = resolveOrganizationId(user, event)

  const body = JSON.parse(event.body || '{}')
  const location = String(body.location ?? '').trim()
  const category = String(body.category ?? '').trim()
  if (!location) throw new HttpError(400, 'Enter a location to search')
  if (!LEAD_GEN_CATEGORIES[category]) throw new HttpError(400, 'Choose a valid business category')

  const bbox = await geocodeLocation(location)
  const rawCandidates = await queryOverpassCategory(category, bbox, MAX_RAW_RESULTS)
  const totalFound = rawCandidates.length

  // Anything missing a website can never pass — there's no enrichment path
  // that could discover a phone/name it doesn't have, and no email is ever
  // guessed without a website to check.
  const withEmailAlready = rawCandidates.filter((c) => c.phone && c.website && c.email)
  const needsEnrichment = rawCandidates.filter((c) => c.phone && c.website && !c.email)

  const enriched = await enrichMissingEmails(needsEnrichment)

  const complete: CompleteLeadGenCandidate[] = [...withEmailAlready, ...enriched]
    .filter((c): c is OsmCandidate & { phone: string; website: string; email: string } => Boolean(c.phone && c.website && c.email))
    .map((c) => ({ id: c.id, company_name: c.company_name, address: c.address, city: c.city, phone: c.phone, website: c.website, email: c.email }))

  const excludedForMissingInfo = totalFound - complete.length

  const { survivors, mergedCount } = dedupeCandidatesBatch(complete)

  const supabase = getSupabaseAdmin()
  let existingQuery = supabase.from('leads').select('id, company_name, phone, email')
  existingQuery = scopeToOrg(existingQuery as any, orgId) as any
  const { data: existingLeads } = await existingQuery.limit(MAX_EXISTING_LEADS_SCANNED)

  const flagged = flagDuplicatesAgainstExisting(survivors, existingLeads ?? [])

  return json(200, {
    totalFound,
    excludedForMissingInfo,
    duplicatesMergedInBatch: mergedCount,
    candidates: flagged,
  })
}

interface ImportCandidateInput {
  company_name: string
  address: string | null
  phone: string
  website: string
  email: string
  contact_name?: string
  social_profiles?: Array<{ platform: string; url: string }>
}

/** POST /lead-generation/import — body: { candidates: ImportCandidateInput[],
 * bulk?: { tags?: string[]; priority?: string; assigned_to?: string } }. Every
 * required field is re-validated server-side rather than trusted from the
 * client, exactly as strictly as the search step enforced it. */
export async function importLeadGenerationCandidates(event: HandlerEvent, user: AuthedUser) {
  requireFeaturePermission(user, 'canGenerateLeads')
  const orgId = resolveOrganizationId(user, event)
  const body = JSON.parse(event.body || '{}')

  const rawCandidates = body.candidates
  if (!Array.isArray(rawCandidates) || rawCandidates.length === 0) {
    throw new HttpError(400, 'candidates must be a non-empty array')
  }

  const candidates: ImportCandidateInput[] = rawCandidates.map((c: any) => ({
    company_name: String(c.company_name ?? '').trim(),
    address: c.address ? String(c.address).trim() : null,
    phone: String(c.phone ?? '').trim(),
    website: String(c.website ?? '').trim(),
    email: String(c.email ?? '').trim(),
    contact_name: c.contact_name ? String(c.contact_name).trim() : undefined,
    social_profiles: Array.isArray(c.social_profiles)
      ? c.social_profiles
          .map((s: any) => ({ platform: String(s.platform ?? '').trim(), url: String(s.url ?? '').trim() }))
          .filter((s: any) => s.platform && s.url)
      : [],
  }))

  const invalid = candidates.find((c) => !c.company_name || !c.phone || !c.website || !c.email)
  if (invalid) throw new HttpError(400, 'Every candidate must have Company Name, Phone, Website, and Email')

  const bulk = body.bulk ?? {}
  const bulkTags: string[] = Array.isArray(bulk.tags) ? bulk.tags.map((t: any) => String(t).trim()).filter(Boolean) : []
  const bulkPriority = PRIORITIES.includes(bulk.priority) ? bulk.priority : 'Medium'
  // Only Admin/Super Admin may assign to someone else, mirroring the manual Add Lead form's own gate.
  const assignedTo = isAdminOrAbove(user) && bulk.assigned_to ? String(bulk.assigned_to) : user.id

  const supabase = getSupabaseAdmin()
  const { data: insertedLeads, error } = await supabase
    .from('leads')
    .insert(
      candidates.map((c) => ({
        company_name: c.company_name,
        contact_name: c.contact_name || null,
        address: c.address,
        phone: c.phone,
        email: c.email,
        website: c.website,
        lead_source: 'Lead Generation',
        priority: bulkPriority,
        assigned_to: assignedTo,
        created_by: user.id,
        organization_id: orgId,
        custom_fields: {},
      }))
    )
    .select('id')

  if (error) throw new HttpError(500, error.message)
  const leads = insertedLeads ?? []

  if (bulkTags.length > 0 && leads.length > 0) {
    const tagRecords = await ensureTagIds(bulkTags, orgId)
    const tagIds = tagRecords.map((t) => t.id)
    const lead_tags = leads.flatMap((lead) => tagIds.map((tag_id) => ({ lead_id: lead.id, tag_id })))
    if (lead_tags.length > 0) {
      const { error: tagErr } = await supabase.from('lead_tags').insert(lead_tags)
      if (tagErr) throw new HttpError(500, tagErr.message)
    }
  }

  const socialRows = leads.flatMap((lead, i) =>
    (candidates[i].social_profiles ?? []).map((s) => ({ lead_id: lead.id, platform: s.platform, url: s.url }))
  )
  if (socialRows.length > 0) {
    const { error: socialErr } = await supabase.from('lead_social_profiles').insert(socialRows)
    if (socialErr) throw new HttpError(500, socialErr.message)
  }

  if (leads.length > 0) {
    await logActivities(leads.map((lead) => ({ leadId: lead.id, type: 'created', message: 'Lead created via Lead Generation', userId: user.id })))
  }

  return json(200, { imported: leads.length })
}
