/** Curated accent-color palette for Organization Branding. Each `id`/`500` hex
 * must stay in sync with the backend's ALLOWED_HEX list in
 * netlify/functions/routes/branding.ts — that's the value actually persisted
 * on `organizations.accent_color`. The 400/600 shades exist only so the app's
 * existing hover/active states (accent-400/accent-600) stay visually
 * consistent when a non-default color is chosen. */
export interface BrandColorShades {
  id: string
  label: string
  400: string
  500: string
  600: string
}

export const BRAND_PALETTE: BrandColorShades[] = [
  { id: 'indigo', label: 'Indigo', 400: '#7c8fff', 500: '#5b6cf0', 600: '#4652d6' },
  { id: 'emerald', label: 'Emerald', 400: '#34d399', 500: '#10b981', 600: '#059669' },
  { id: 'amber', label: 'Amber', 400: '#fbbf24', 500: '#f59e0b', 600: '#d97706' },
  { id: 'rose', label: 'Rose', 400: '#fb7185', 500: '#f43f5e', 600: '#e11d48' },
  { id: 'cyan', label: 'Cyan', 400: '#22d3ee', 500: '#06b6d4', 600: '#0891b2' },
  { id: 'violet', label: 'Violet', 400: '#a78bfa', 500: '#8b5cf6', 600: '#7c3aed' },
  { id: 'fuchsia', label: 'Fuchsia', 400: '#e879f9', 500: '#d946ef', 600: '#c026d3' },
  { id: 'sky', label: 'Sky', 400: '#38bdf8', 500: '#0ea5e9', 600: '#0284c7' },
  { id: 'lime', label: 'Lime', 400: '#a3e635', 500: '#84cc16', 600: '#65a30d' },
  { id: 'orange', label: 'Orange', 400: '#fb923c', 500: '#f97316', 600: '#ea580c' },
]

export const DEFAULT_BRAND_COLOR = BRAND_PALETTE[0]

function hexToRgbTriplet(hex: string): string {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  return `${r} ${g} ${b}`
}

export function findBrandColor(accentColorHex: string | null | undefined): BrandColorShades {
  if (!accentColorHex) return DEFAULT_BRAND_COLOR
  return BRAND_PALETTE.find((c) => c[500].toLowerCase() === accentColorHex.toLowerCase()) ?? DEFAULT_BRAND_COLOR
}

/** Sets/removes the `--accent-{400,500,600}` CSS custom properties (as
 * space-separated RGB triplets, for Tailwind's `rgb(var(...) / <alpha-value>)`
 * pattern) on `document.documentElement`. Pass `null` to clear back to the
 * hardcoded defaults declared in src/index.css. */
export function applyAccentColor(accentColorHex: string | null | undefined) {
  const root = document.documentElement.style
  if (!accentColorHex) {
    root.removeProperty('--accent-400')
    root.removeProperty('--accent-500')
    root.removeProperty('--accent-600')
    return
  }
  const shades = findBrandColor(accentColorHex)
  root.setProperty('--accent-400', hexToRgbTriplet(shades[400]))
  root.setProperty('--accent-500', hexToRgbTriplet(shades[500]))
  root.setProperty('--accent-600', hexToRgbTriplet(shades[600]))
}
