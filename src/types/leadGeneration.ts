import type { SocialProfile } from './lead'

/** Kept in sync with LEAD_GEN_CATEGORIES in netlify/functions/lib/osm.ts — the
 * backend is the source of truth for which OSM tag each maps to; the
 * frontend only needs the label to send back in the search request. */
export const LEAD_GEN_CATEGORIES: string[] = [
  'Restaurant',
  'Cafe',
  'Bar / Pub',
  'Bakery',
  'Hotel',
  'Dentist',
  'Doctor / Medical Clinic',
  'Pharmacy',
  'Veterinary Clinic',
  'Lawyer',
  'Accountant',
  'Real Estate Agency',
  'Insurance Agency',
  'Gym / Fitness Center',
  'Hair Salon / Barber',
  'Auto Repair Shop',
  'Plumber',
  'Electrician',
  'Photography Studio',
  'Bank',
]

export interface LeadGenCandidate {
  id: string
  company_name: string
  address: string | null
  city: string | null
  phone: string
  website: string
  email: string
  isDuplicate: boolean
  duplicateReason: 'phone' | 'email' | 'company_name' | null
  duplicateStrong: boolean
  duplicateOf: string | null
}

export interface LeadGenSearchResult {
  totalFound: number
  excludedForMissingInfo: number
  duplicatesMergedInBatch: number
  candidates: LeadGenCandidate[]
}

/** Client-side-only editable state layered onto a candidate — never returned
 * by the search endpoint, since the scraper can't discover either of these;
 * the admin fills them in (or not) before import. */
export interface LeadGenEditableFields {
  contact_name: string
  social_profiles: SocialProfile[]
}

export interface LeadGenBulkSettings {
  tags: string[]
  priority: 'High' | 'Medium' | 'Low'
  assigned_to: string
}
