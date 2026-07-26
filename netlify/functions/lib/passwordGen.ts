import crypto from 'crypto'

// Excludes visually ambiguous characters (I/l/1, O/0) to keep a manually
// copy-pasted temporary password from being misread by the Super Admin or the
// person they email it to.
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const LOWER = 'abcdefghijkmnpqrstuvwxyz'
const DIGITS = '23456789'
const SYMBOLS = '!@#$%^&*'
const ALL = UPPER + LOWER + DIGITS + SYMBOLS

function pick(chars: string): string {
  return chars[crypto.randomInt(chars.length)]
}

/** Securely generates a 14-character temporary password with at least one
 * uppercase, lowercase, digit, and symbol — generated server-side only, never
 * on the client, per spec. Used exclusively for the Signup Request approve flow. */
export function generateTempPassword(length = 14): string {
  const required = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SYMBOLS)]
  const rest = Array.from({ length: Math.max(0, length - required.length) }, () => pick(ALL))
  const combined = [...required, ...rest]

  for (let i = combined.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1)
    ;[combined[i], combined[j]] = [combined[j], combined[i]]
  }

  return combined.join('')
}
