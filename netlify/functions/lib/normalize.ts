/** Strips protocol/"www."/path/query down to the bare hostname — used to
 * collapse "https://www.example.com/", "example.com", "http://example.com?x=1"
 * all down to the same identity for caching and dedup purposes. */
export function normalizeDomain(rawUrl: string): string {
  try {
    const withProtocol = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`
    const host = new URL(withProtocol).hostname.toLowerCase()
    return host.replace(/^www\./, '')
  } catch {
    return rawUrl.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].split('?')[0]
  }
}

/** Strips everything but digits, then drops a leading country-code "1" for
 * 11-digit numbers so "+1 (555) 123-4567" and "555-123-4567" compare equal. */
export function normalizePhoneDigits(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
}
