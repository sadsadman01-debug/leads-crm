// Chart palette — validated with the dataviz skill's validator (dark mode, surface #111114):
// all 5 pass lightness band, chroma floor, CVD separation, and contrast checks.
// Assigned in fixed order per category; never cycled or reassigned when a filter changes
// the visible set.

export const CATEGORICAL_PALETTE = ['#5b6cf0', '#0d9488', '#d97706', '#e11d48', '#0891b2'] as const

export const LEAD_SOURCE_COLORS: Record<string, string> = {
  'Google Maps': CATEGORICAL_PALETTE[0],
  Referral: CATEGORICAL_PALETTE[1],
  'Manual Entry': CATEGORICAL_PALETTE[2],
  Website: CATEGORICAL_PALETTE[3],
  Other: CATEGORICAL_PALETTE[4],
}

// Status colors are reserved — reused from the Badge component's tones (Part 1) so a
// given meaning (success/warn/danger/accent/neutral) always maps to the same color
// everywhere in the app, charts included.
export const STATUS_DIST_COLORS: Record<string, string> = {
  New: '#6b6d7a',
  'Outreach Sent': '#eab308',
  Replied: '#5b6cf0',
  'Invalid Contact': '#ef4444',
  Converted: '#22c55e',
}

export const PRIORITY_COLORS: Record<string, string> = {
  High: '#ef4444',
  Medium: '#eab308',
  Low: '#22c55e',
}

export const SENTIMENT_COLORS: Record<string, string> = {
  Positive: '#22c55e',
  Neutral: '#9a9ca8',
  Negative: '#ef4444',
  'Not Interested': '#d97706',
}

// Sequential ramp, single hue (accent), light → dark — used for the funnel, where
// each stage is a magnitude of the same underlying metric.
export const FUNNEL_RAMP = ['#c7d2fe', '#a5b4fc', '#818cf8', '#6366f1', '#4338ca']

// Two series of the same unit (counts) on one axis — first two categorical hues, in order.
export const TREND_COLORS = {
  leadsAdded: CATEGORICAL_PALETTE[0],
  emailsSent: CATEGORICAL_PALETTE[1],
}

// Gross vs Net revenue — two series of the same unit (currency) on one axis,
// so they reuse the first two categorical hues in fixed order (already
// validated above), same convention as TREND_COLORS.
export const REVENUE_TREND_COLORS = {
  gross: CATEGORICAL_PALETTE[0],
  net: CATEGORICAL_PALETTE[1],
  refunds: CATEGORICAL_PALETTE[2],
}

// 7 fixed payment channels (a closed enum, not an open-ended "top N" series,
// so each gets its own color rather than folding into "Other") — validated
// as a full 7-color categorical set via the dataviz skill's validator
// (dark mode, surface #111114): all pass lightness/chroma/CVD/contrast.
export const PAYMENT_METHOD_COLORS: Record<string, string> = {
  bkash: CATEGORICAL_PALETTE[0],
  nagad: CATEGORICAL_PALETTE[1],
  rocket: CATEGORICAL_PALETTE[2],
  bank_transfer: CATEGORICAL_PALETTE[3],
  payoneer: CATEGORICAL_PALETTE[4],
  crypto: '#a855f7',
  other: '#65a30d',
}

export const CHART_SURFACE = '#111114'
export const CHART_GRID = '#26272e'
export const CHART_TEXT_MUTED = '#9a9ca8'
