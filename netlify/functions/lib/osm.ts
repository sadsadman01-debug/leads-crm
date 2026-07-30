import { HttpError } from './http.js'

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'

// Nominatim/Overpass's usage policy expects a descriptive identifier on every
// request — a generic browser-looking User-Agent risks getting blocked.
const USER_AGENT = 'LeadifyLeadGeneration/1.0 (+https://leadify-six.vercel.app)'

/** Every category this feature can search for, mapped to a single OSM tag
 * filter. Kept as one tag per category (rather than OR'd alternatives) to
 * keep the Overpass query simple — this is the full list the frontend's
 * category dropdown is built from. */
export const LEAD_GEN_CATEGORIES: Record<string, { key: string; value: string }> = {
  Restaurant: { key: 'amenity', value: 'restaurant' },
  Cafe: { key: 'amenity', value: 'cafe' },
  'Bar / Pub': { key: 'amenity', value: 'bar' },
  Bakery: { key: 'shop', value: 'bakery' },
  Hotel: { key: 'tourism', value: 'hotel' },
  Dentist: { key: 'amenity', value: 'dentist' },
  'Doctor / Medical Clinic': { key: 'amenity', value: 'clinic' },
  Pharmacy: { key: 'amenity', value: 'pharmacy' },
  'Veterinary Clinic': { key: 'amenity', value: 'veterinary' },
  Lawyer: { key: 'office', value: 'lawyer' },
  Accountant: { key: 'office', value: 'accountant' },
  'Real Estate Agency': { key: 'office', value: 'estate_agent' },
  'Insurance Agency': { key: 'office', value: 'insurance' },
  'Gym / Fitness Center': { key: 'leisure', value: 'fitness_centre' },
  'Hair Salon / Barber': { key: 'shop', value: 'hairdresser' },
  'Auto Repair Shop': { key: 'shop', value: 'car_repair' },
  Plumber: { key: 'craft', value: 'plumber' },
  Electrician: { key: 'craft', value: 'electrician' },
  'Photography Studio': { key: 'craft', value: 'photographer' },
  Bank: { key: 'amenity', value: 'bank' },
}

/** A candidate after the mandatory-field filter (Section 1) has run — every
 * field is guaranteed present, unlike the raw `OsmCandidate` OSM itself returned. */
export interface CompleteLeadGenCandidate {
  id: string
  company_name: string
  address: string | null
  city: string | null
  phone: string
  website: string
  email: string
}

export interface OsmCandidate {
  /** `${elementType}/${elementId}` — stable across a single search's lifetime, used as the row key in the Review & Import checklist. */
  id: string
  company_name: string
  address: string | null
  city: string | null
  phone: string | null
  website: string | null
  email: string | null
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/** Geocodes a free-text location (city, neighborhood, address) to a bounding
 * box via Nominatim — the only geocoding step this feature performs; it
 * never queries Nominatim per-business, only once per search. */
export async function geocodeLocation(location: string): Promise<{ south: number; north: number; west: number; east: number }> {
  const url = `${NOMINATIM_URL}?q=${encodeURIComponent(location)}&format=json&limit=1`
  const res = await fetchWithTimeout(url, { headers: { 'User-Agent': USER_AGENT } }, 15_000)
  if (!res.ok) throw new HttpError(502, 'Could not reach the location search service — please try again.')
  const results = (await res.json()) as Array<{ boundingbox: [string, string, string, string] }>
  if (!results.length) throw new HttpError(400, `Could not find a location matching "${location}" — try a more specific city/area name.`)

  const [south, north, west, east] = results[0].boundingbox.map(Number)
  return { south, north, west, east }
}

function firstTag(tags: Record<string, string>, ...keys: string[]): string | null {
  for (const key of keys) {
    if (tags[key]?.trim()) return tags[key].trim()
  }
  return null
}

function buildAddress(tags: Record<string, string>): string | null {
  const parts = [
    [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ').trim() || null,
    tags['addr:city'] ?? null,
    tags['addr:postcode'] ?? null,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : null
}

/** Queries Overpass for every node/way tagged with the given category's OSM
 * key=value within the geocoded bounding box. This is the ONLY external
 * search call per request — no per-business queries against OSM at all;
 * everything else (email discovery) hits each business's OWN website. */
export async function queryOverpassCategory(
  categoryLabel: string,
  bbox: { south: number; north: number; west: number; east: number },
  maxResults: number
): Promise<OsmCandidate[]> {
  const category = LEAD_GEN_CATEGORIES[categoryLabel]
  if (!category) throw new HttpError(400, `Unknown category "${categoryLabel}"`)

  const bboxStr = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`
  const tagFilter = `["${category.key}"="${category.value}"]`
  const query = `[out:json][timeout:25];(node${tagFilter}(${bboxStr});way${tagFilter}(${bboxStr}););out center tags ${maxResults * 2};`

  const res = await fetchWithTimeout(
    OVERPASS_URL,
    { method: 'POST', headers: { 'Content-Type': 'text/plain', 'User-Agent': USER_AGENT }, body: query },
    25_000
  )
  if (!res.ok) throw new HttpError(502, 'Could not reach OpenStreetMap\'s search service — please try again in a moment.')

  const body = (await res.json()) as { elements: Array<any> }
  const elements = body.elements ?? []

  return elements
    .map((el): OsmCandidate | null => {
      const tags: Record<string, string> = el.tags ?? {}
      const name = tags.name?.trim()
      if (!name) return null

      return {
        id: `${el.type}/${el.id}`,
        company_name: name,
        address: buildAddress(tags),
        city: tags['addr:city']?.trim() || null,
        phone: firstTag(tags, 'contact:phone', 'phone'),
        website: firstTag(tags, 'contact:website', 'website'),
        email: firstTag(tags, 'contact:email', 'email'),
      }
    })
    .filter((c): c is OsmCandidate => c !== null)
    .slice(0, maxResults)
}
