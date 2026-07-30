import type { CompleteLeadGenCandidate } from './osm.js'
import { normalizeDomain, normalizePhoneDigits } from './normalize.js'
import { normalizeCompanyName, stringSimilarity, SIMILARITY_THRESHOLD, groupPairsIntoClusters, type CandidatePair } from './duplicateMatch.js'

export interface DedupedCandidate extends CompleteLeadGenCandidate {
  isDuplicate: boolean
  duplicateReason: 'phone' | 'email' | 'company_name' | null
  duplicateStrong: boolean
  duplicateOf: string | null
}

/** Picks which candidate in a same-business cluster survives: the one with
 * the most complete address wins (a longer, more specific address beats a
 * shorter/missing one), since every survivor already has all four required
 * fields by the time this runs. */
function pickMostComplete(group: CompleteLeadGenCandidate[]): CompleteLeadGenCandidate {
  return [...group].sort((a, b) => (b.address?.length ?? 0) - (a.address?.length ?? 0))[0]
}

/** Collapses candidates that are really the same business appearing multiple
 * times in one search — exact website domain, then exact phone, then a
 * fuzzy name match within the same city — per the three rules in order. */
export function dedupeCandidatesBatch(candidates: CompleteLeadGenCandidate[]): { survivors: CompleteLeadGenCandidate[]; mergedCount: number } {
  const pairs: CandidatePair[] = []
  const domainById = new Map(candidates.map((c) => [c.id, normalizeDomain(c.website)]))
  const phoneById = new Map(candidates.map((c) => [c.id, normalizePhoneDigits(c.phone)]))
  const nameById = new Map(candidates.map((c) => [c.id, normalizeCompanyName(c.company_name)]))

  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i]
      const b = candidates[j]

      const domainA = domainById.get(a.id)
      const domainB = domainById.get(b.id)
      if (domainA && domainB && domainA === domainB) {
        pairs.push({ a: a.id, b: b.id, reason: 'company_name' })
        continue
      }

      const phoneA = phoneById.get(a.id)
      const phoneB = phoneById.get(b.id)
      if (phoneA && phoneB && phoneA === phoneB) {
        pairs.push({ a: a.id, b: b.id, reason: 'phone' })
        continue
      }

      const sameCity = Boolean(a.city) && Boolean(b.city) && a.city!.trim().toLowerCase() === b.city!.trim().toLowerCase()
      const nameA = nameById.get(a.id) ?? ''
      const nameB = nameById.get(b.id) ?? ''
      if (sameCity && nameA && nameB && (nameA === nameB || stringSimilarity(nameA, nameB) >= SIMILARITY_THRESHOLD)) {
        pairs.push({ a: a.id, b: b.id, reason: 'company_name' })
      }
    }
  }

  const clusters = groupPairsIntoClusters(candidates, pairs)
  const clusteredIds = new Set(clusters.flat().map((c) => c.id))
  const survivors = [...clusters.map(pickMostComplete), ...candidates.filter((c) => !clusteredIds.has(c.id))]

  return { survivors, mergedCount: candidates.length - survivors.length }
}

interface ExistingLeadForMatch {
  id: string
  company_name: string | null
  phone: string | null
  email: string | null
}

/** Runs every surviving candidate through the same phone/email/fuzzy-name
 * matching rules used for CSV import and the Duplicate Merge Tool, but
 * against the organization's EXISTING leads rather than within this batch —
 * flags likely duplicates for the admin to deselect rather than silently
 * dropping them, since a false positive here would otherwise be unrecoverable. */
export function flagDuplicatesAgainstExisting(
  candidates: CompleteLeadGenCandidate[],
  existingLeads: ExistingLeadForMatch[]
): DedupedCandidate[] {
  const existingNormalized = existingLeads.map((l) => ({
    ...l,
    normalizedName: normalizeCompanyName(l.company_name),
    normalizedPhone: l.phone ? normalizePhoneDigits(l.phone) : '',
    normalizedEmail: l.email?.trim().toLowerCase() ?? '',
  }))

  return candidates.map((candidate) => {
    const candidatePhone = normalizePhoneDigits(candidate.phone)
    const candidateEmail = candidate.email.trim().toLowerCase()
    const candidateName = normalizeCompanyName(candidate.company_name)

    // Email match is checked first and flagged as the strongest possible
    // signal — two different businesses essentially never share one inbox.
    const emailMatch = candidateEmail && existingNormalized.find((l) => l.normalizedEmail && l.normalizedEmail === candidateEmail)
    if (emailMatch) {
      return { ...candidate, isDuplicate: true, duplicateReason: 'email', duplicateStrong: true, duplicateOf: emailMatch.company_name }
    }

    const phoneMatch = candidatePhone && existingNormalized.find((l) => l.normalizedPhone && l.normalizedPhone === candidatePhone)
    if (phoneMatch) {
      return { ...candidate, isDuplicate: true, duplicateReason: 'phone', duplicateStrong: false, duplicateOf: phoneMatch.company_name }
    }

    const nameMatch =
      candidateName &&
      existingNormalized.find((l) => l.normalizedName && (l.normalizedName === candidateName || stringSimilarity(l.normalizedName, candidateName) >= SIMILARITY_THRESHOLD))
    if (nameMatch) {
      return { ...candidate, isDuplicate: true, duplicateReason: 'company_name', duplicateStrong: false, duplicateOf: nameMatch.company_name }
    }

    return { ...candidate, isDuplicate: false, duplicateReason: null, duplicateStrong: false, duplicateOf: null }
  })
}
