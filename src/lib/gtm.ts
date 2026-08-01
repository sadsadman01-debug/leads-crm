declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[]
  }
}

const GTM_ID = import.meta.env.VITE_GTM_CONTAINER_ID as string | undefined

let initialized = false

/** Injects the standard Google Tag Manager container script + noscript
 * iframe fallback — entirely inert (never touches the DOM) until
 * VITE_GTM_CONTAINER_ID is set at build time. GA4 and Search Console
 * verification are configured later entirely inside the GTM container
 * itself, so no separate gtag.js or meta tag lives in this codebase. */
export function initGtm() {
  if (!GTM_ID || initialized) return
  initialized = true

  window.dataLayer = window.dataLayer || []
  window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' })

  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtm.js?id=${GTM_ID}`
  document.head.appendChild(script)

  const noscript = document.createElement('noscript')
  const iframe = document.createElement('iframe')
  iframe.src = `https://www.googletagmanager.com/ns.html?id=${GTM_ID}`
  iframe.height = '0'
  iframe.width = '0'
  iframe.style.display = 'none'
  iframe.style.visibility = 'hidden'
  noscript.appendChild(iframe)
  document.body.insertBefore(noscript, document.body.firstChild)
}

/** Fully a no-op until GTM is actually configured, so every call site below
 * can push events unconditionally without its own guard. */
export function pushDataLayerEvent(event: string, data: Record<string, unknown> = {}) {
  if (!GTM_ID) return
  window.dataLayer = window.dataLayer || []
  window.dataLayer.push({ event, ...data })
}
