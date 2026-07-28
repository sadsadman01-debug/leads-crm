/** Triggers a `mailto:` link via a temporary anchor click rather than a bare
 * `window.location.href` assignment — more reliably handed off to the OS's
 * registered mail client across browsers (Chrome in particular can silently
 * drop a programmatic `location.href` assignment to an external protocol in
 * some contexts, whereas a real anchor click is treated as a normal
 * user-initiated navigation to an external handler). */
export function openMailto(email: string, subject: string, body: string) {
  const url = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  const link = document.createElement('a')
  link.href = url
  link.rel = 'noopener noreferrer'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
