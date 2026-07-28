/** Detects iOS Safari specifically — Chrome/Firefox/Edge on iOS all use
 * WebKit too and carry "Safari" in their UA string, but also carry their own
 * browser token (CriOS/FxiOS/EdgiOS/OPiOS), so excluding those correctly
 * narrows to actual Safari, the only iOS browser with no `beforeinstallprompt`. */
export function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !('MSStream' in window)
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)
  return isIOS && isSafari
}

/** True if the app is already running installed/standalone (home-screen icon
 * or desktop PWA window) rather than in a normal browser tab. */
export function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true
}
