const COMPANY_SUFFIXES = [
  'incorporated', 'corporation', 'company', 'limited', 'inc', 'llc', 'ltd', 'co', 'corp', 'plc', 'llp', 'lp', 'pty',
]

/** Lowercases, strips punctuation, collapses whitespace, and drops a trailing
 * common company suffix (Inc/LLC/Ltd/Co/Corp/...) so "Promen Tech, Inc." and
 * "promen tech" normalize to the same string. */
export function normalizeCompanyName(name: string | null | undefined): string {
  let s = (name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const words = s.split(' ')
  while (words.length > 1 && COMPANY_SUFFIXES.includes(words[words.length - 1])) {
    words.pop()
  }
  return words.join(' ')
}

function bigrams(s: string): Map<string, number> {
  const map = new Map<string, number>()
  for (let i = 0; i < s.length - 1; i++) {
    const gram = s.slice(i, i + 2)
    map.set(gram, (map.get(gram) ?? 0) + 1)
  }
  return map
}

/** Dice-coefficient similarity over character bigrams — a simple,
 * dependency-free stand-in for Postgres pg_trgm similarity(), scored 0..1. */
export function stringSimilarity(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 1
  const gramsA = bigrams(a)
  const gramsB = bigrams(b)
  let intersection = 0
  for (const [gram, countA] of gramsA) {
    const countB = gramsB.get(gram)
    if (countB) intersection += Math.min(countA, countB)
  }
  const totalA = [...gramsA.values()].reduce((sum, n) => sum + n, 0)
  const totalB = [...gramsB.values()].reduce((sum, n) => sum + n, 0)
  if (totalA + totalB === 0) return 0
  return (2 * intersection) / (totalA + totalB)
}

export const SIMILARITY_THRESHOLD = 0.6

export interface CandidatePair {
  a: string
  b: string
  reason: 'phone' | 'email' | 'company_name'
}

interface LeadForMatch {
  id: string
  company_name: string | null
  phone: string | null
  email: string | null
}

/** O(n^2) pairwise scan — acceptable for this app's small-scale per-organization
 * lead counts; callers cap the input size before calling this. */
export function findLeadDuplicatePairs(leads: LeadForMatch[]): CandidatePair[] {
  const pairs: CandidatePair[] = []
  const normalizedNames = new Map(leads.map((l) => [l.id, normalizeCompanyName(l.company_name)]))

  for (let i = 0; i < leads.length; i++) {
    for (let j = i + 1; j < leads.length; j++) {
      const l1 = leads[i]
      const l2 = leads[j]

      const phone1 = l1.phone?.trim()
      const phone2 = l2.phone?.trim()
      if (phone1 && phone2 && phone1 === phone2) {
        pairs.push({ a: l1.id, b: l2.id, reason: 'phone' })
        continue
      }

      const email1 = l1.email?.trim().toLowerCase()
      const email2 = l2.email?.trim().toLowerCase()
      if (email1 && email2 && email1 === email2) {
        pairs.push({ a: l1.id, b: l2.id, reason: 'email' })
        continue
      }

      const name1 = normalizedNames.get(l1.id) ?? ''
      const name2 = normalizedNames.get(l2.id) ?? ''
      if (name1 && name2 && (name1 === name2 || stringSimilarity(name1, name2) >= SIMILARITY_THRESHOLD)) {
        pairs.push({ a: l1.id, b: l2.id, reason: 'company_name' })
      }
    }
  }
  return pairs
}

interface DealForMatch {
  id: string
  lead_id: string
  name: string | null
  value: number | null
  stage_id: string | null
}

/** Deal duplicates are scoped to deals sharing the same linked Lead — two
 * deals for different leads are never considered duplicates of each other. */
export function findDealDuplicatePairs(deals: DealForMatch[]): CandidatePair[] {
  const pairs: CandidatePair[] = []
  const byLead = new Map<string, DealForMatch[]>()
  for (const d of deals) {
    if (!byLead.has(d.lead_id)) byLead.set(d.lead_id, [])
    byLead.get(d.lead_id)!.push(d)
  }

  for (const group of byLead.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const d1 = group[i]
        const d2 = group[j]
        const name1 = (d1.name ?? '').trim().toLowerCase()
        const name2 = (d2.name ?? '').trim().toLowerCase()
        const nameMatch = Boolean(name1) && Boolean(name2) && stringSimilarity(name1, name2) >= SIMILARITY_THRESHOLD
        const sameStage = Boolean(d1.stage_id) && d1.stage_id === d2.stage_id
        const valuesClose =
          d1.value != null && d2.value != null && Math.abs(d1.value - d2.value) <= Math.max(d1.value, d2.value) * 0.01
        if (nameMatch || (sameStage && valuesClose)) {
          pairs.push({ a: d1.id, b: d2.id, reason: 'company_name' })
        }
      }
    }
  }
  return pairs
}

/** Union-find over the candidate pairs — connected components of size >= 2
 * become the "duplicate groups" shown to the admin. */
export function groupPairsIntoClusters<T extends { id: string }>(rows: T[], pairs: CandidatePair[]): T[][] {
  const parent = new Map(rows.map((r) => [r.id, r.id]))
  function find(x: string): string {
    let root = x
    while (parent.get(root) !== root) root = parent.get(root)!
    return root
  }
  function union(x: string, y: string) {
    const rx = find(x)
    const ry = find(y)
    if (rx !== ry) parent.set(rx, ry)
  }
  for (const { a, b } of pairs) {
    if (parent.has(a) && parent.has(b)) union(a, b)
  }

  const groups = new Map<string, T[]>()
  for (const r of rows) {
    const root = find(r.id)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root)!.push(r)
  }
  return [...groups.values()].filter((g) => g.length >= 2)
}

export function dismissalKey(idA: string, idB: string): string {
  return [idA, idB].sort().join('|')
}
