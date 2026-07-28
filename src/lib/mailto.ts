/** Triggers a `mailto:` link via a temporary anchor click rather than a bare
 * `window.location.href` assignment — more reliably handed off to the OS's
 * registered mail client across browsers than a programmatic location change
 * in some contexts. Removal is deferred to the next tick: removing the anchor
 * synchronously right after `.click()` can race Chrome's own handling of the
 * external-protocol navigation and silently cancel it before the "Open Mail
 * app?" prompt ever appears. */
export function openMailto(email: string, subject: string, body: string) {
  const url = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  const link = document.createElement('a')
  link.href = url
  link.rel = 'noopener noreferrer'
  document.body.appendChild(link)
  link.click()
  setTimeout(() => document.body.removeChild(link), 100)
}
