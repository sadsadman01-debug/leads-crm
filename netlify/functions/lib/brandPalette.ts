// Curated so a picked color always reads well against the dark theme — kept
// in sync with the frontend's src/lib/brandColors.ts (each id there maps to
// the same 500-shade hex stored here). Shared by both Organization Branding
// (netlify/functions/routes/branding.ts) and Platform Default Branding
// (netlify/functions/routes/platformBranding.ts).
export const CURATED_PALETTE = [
  { id: 'indigo', label: 'Indigo', hex: '#5b6cf0' },
  { id: 'emerald', label: 'Emerald', hex: '#10b981' },
  { id: 'amber', label: 'Amber', hex: '#f59e0b' },
  { id: 'rose', label: 'Rose', hex: '#f43f5e' },
  { id: 'cyan', label: 'Cyan', hex: '#06b6d4' },
  { id: 'violet', label: 'Violet', hex: '#8b5cf6' },
  { id: 'fuchsia', label: 'Fuchsia', hex: '#d946ef' },
  { id: 'sky', label: 'Sky', hex: '#0ea5e9' },
  { id: 'lime', label: 'Lime', hex: '#84cc16' },
  { id: 'orange', label: 'Orange', hex: '#f97316' },
] as const

export const ALLOWED_HEX = new Set(CURATED_PALETTE.map((c) => c.hex.toLowerCase()))
