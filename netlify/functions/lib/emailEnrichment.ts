import { getSupabaseAdmin } from './supabaseAdmin.js'
import { normalizeDomain } from './normalize.js'

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days
const MAX_PAGES_PER_CANDIDATE = 5
const PAGE_TIMEOUT_MS = 7_000
const DELAY_BETWEEN_PAGES_MS = 300

const USER_AGENT = 'LeadifyLeadGeneration/1.0 (+https://leadify-six.vercel.app; contact-email-discovery)'

const CONTACT_PATH_CANDIDATES = ['/contact', '/contact-us', '/contactus', '/about', '/about-us', '/aboutus', '/team']

const CONTACT_LINK_KEYWORDS = /contact|about|reach us|get in touch/i

const BUSINESS_PREFIXES = ['info', 'contact', 'hello', 'sales', 'admin', 'support', 'office', 'enquiries', 'inquiries']

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
// "info at example dot com" / "info [at] example [dot] com" / "info(at)example(dot)com" — requires
// the surrounding tokens to already look like email fragments, so ordinary sentences containing the
// word "at" are never mistaken for an obfuscated address.
const OBFUSCATED_RE = /([a-zA-Z0-9._%+-]+)\s*[\[(]?\s*at\s*[\])]?\s*([a-zA-Z0-9-]+(?:\s*[\[(]?\s*dot\s*[\])]?\s*[a-zA-Z0-9-]+)*)\s*[\[(]?\s*dot\s*[\])]?\s*([a-zA-Z]{2,})/gi
const MAILTO_RE = /href\s*=\s*["']mailto:([^"'?]+)/gi

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function toAbsoluteUrl(website: string): string {
  return /^https?:\/\//i.test(website) ? website : `https://${website}`
}

/** Strips <script>/<style> blocks and HTML comments (a common bot-deterrence
 * trick, e.g. `info<!-- -->@<!-- -->example.com`) before any pattern matching
 * runs, on both the raw-HTML pass (for hrefs) and the tag-stripped pass. */
function cleanHtml(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<!--[\s\S]*?-->/g, '')
}

function toPlainText(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
}

function extractCandidateEmails(html: string): string[] {
  const cleaned = cleanHtml(html)
  const plainText = toPlainText(cleaned)

  const found = new Set<string>()
  for (const m of cleaned.matchAll(MAILTO_RE)) found.add(m[1].trim().toLowerCase())
  for (const m of plainText.matchAll(EMAIL_RE)) found.add(m[0].trim().toLowerCase())
  for (const m of plainText.matchAll(OBFUSCATED_RE)) {
    const domain = m[2].replace(/\s*[\[(]?\s*dot\s*[\])]?\s*/gi, '.').replace(/\s+/g, '')
    found.add(`${m[1]}@${domain}.${m[3]}`.toLowerCase())
  }

  return [...found].filter((e) => EMAIL_RE.test(e) && /\.[a-z]{2,}$/i.test(e))
}

function extractLinks(html: string): Array<{ href: string; text: string }> {
  const cleaned = cleanHtml(html)
  const links: Array<{ href: string; text: string }> = []
  const anchorRe = /<a\s+[^>]*href\s*=\s*["']([^"']+)["'][^>]*>(.*?)<\/a>/gis
  for (const m of cleaned.matchAll(anchorRe)) {
    links.push({ href: m[1], text: toPlainText(m[2]).trim() })
  }
  return links
}

/** Picks the single best email out of everything found across all pages
 * fetched for one candidate: a general business inbox on the site's own
 * domain wins, then any same-domain address, then business-prefix on any
 * domain, then whatever's left — never a placeholder, never a guess. */
function pickBestEmail(candidates: string[], siteDomain: string): string | null {
  if (candidates.length === 0) return null

  function score(email: string): number {
    const domain = email.split('@')[1]?.toLowerCase() ?? ''
    const localPart = email.split('@')[0]?.toLowerCase() ?? ''
    const sameDomain = domain === siteDomain || domain.endsWith(`.${siteDomain}`)
    const isBusinessPrefix = BUSINESS_PREFIXES.some((p) => localPart === p || localPart.startsWith(`${p}.`) || localPart.startsWith(`${p}@`))
    return (sameDomain ? 10 : 0) + (isBusinessPrefix ? 5 : 0)
  }

  return [...candidates].sort((a, b) => score(b) - score(a))[0]
}

async function fetchPage(url: string): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PAGE_TIMEOUT_MS)
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: controller.signal })
    if (!res.ok) return null
    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.includes('text/html') && !contentType.includes('text')) return null
    return await res.text()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** Visits a business's own publicly published pages — homepage, then common
 * contact/about URL patterns, then any homepage link that looks like it
 * leads to a contact/about page — stopping the moment a usable email turns
 * up, capped at MAX_PAGES_PER_CANDIDATE fetches total. This is the same
 * thing a person would do manually visiting the site to copy an email; it
 * never queries any search engine or map provider. */
async function discoverEmail(website: string): Promise<string | null> {
  const base = toAbsoluteUrl(website)
  const domain = normalizeDomain(website)
  const tried = new Set<string>()
  let pagesFetched = 0

  // 1. Homepage
  const homepageHtml = await fetchPage(base)
  pagesFetched++
  tried.add(base)
  if (homepageHtml) {
    const found = pickBestEmail(extractCandidateEmails(homepageHtml), domain)
    if (found) return found
  }

  // 2. Common contact-page URL patterns, tried directly
  for (const path of CONTACT_PATH_CANDIDATES) {
    if (pagesFetched >= MAX_PAGES_PER_CANDIDATE) break
    const url = new URL(path, base).toString()
    if (tried.has(url)) continue
    tried.add(url)
    await sleep(DELAY_BETWEEN_PAGES_MS)
    pagesFetched++
    const html = await fetchPage(url)
    if (!html) continue
    const found = pickBestEmail(extractCandidateEmails(html), domain)
    if (found) return found
  }

  // 3. Any homepage link whose text/href suggests a contact/about page, not already tried
  if (homepageHtml && pagesFetched < MAX_PAGES_PER_CANDIDATE) {
    const links = extractLinks(homepageHtml).filter((l) => CONTACT_LINK_KEYWORDS.test(l.href) || CONTACT_LINK_KEYWORDS.test(l.text))
    for (const link of links) {
      if (pagesFetched >= MAX_PAGES_PER_CANDIDATE) break
      let url: string
      try {
        url = new URL(link.href, base).toString()
      } catch {
        continue
      }
      if (tried.has(url) || !url.startsWith(new URL(base).origin)) continue
      tried.add(url)
      await sleep(DELAY_BETWEEN_PAGES_MS)
      pagesFetched++
      const html = await fetchPage(url)
      if (!html) continue
      const found = pickBestEmail(extractCandidateEmails(html), domain)
      if (found) return found
    }
  }

  return null
}

/** Cached, 30-day-TTL wrapper around `discoverEmail` — keyed by domain so the
 * same website is never re-fetched across different searches/organizations
 * within the cache window, whether or not an email was actually found. */
export async function getOrDiscoverEmail(website: string): Promise<string | null> {
  const domain = normalizeDomain(website)
  const supabase = getSupabaseAdmin()

  const { data: cached } = await supabase.from('lead_gen_email_cache').select('email, checked_at').eq('domain', domain).maybeSingle()
  if (cached && Date.now() - new Date(cached.checked_at).getTime() < CACHE_TTL_MS) {
    return cached.email ?? null
  }

  const email = await discoverEmail(website)
  await supabase.from('lead_gen_email_cache').upsert({ domain, email, checked_at: new Date().toISOString() }, { onConflict: 'domain' })
  return email
}
