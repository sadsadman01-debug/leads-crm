export function formatCurrency(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: value % 1 === 0 ? 0 : 2,
    }).format(value)
  } catch {
    return `${value.toLocaleString()} ${currency}`
  }
}

/** Same as formatCurrency, but shows "•••" instead when the value has been
 * masked server-side (viewer lacks "Can view Deal monetary values"). */
export function formatMaskedCurrency(value: number | null | undefined, currency: string): string {
  if (value === null || value === undefined) return '•••'
  return formatCurrency(value, currency)
}
