export interface PasswordRequirement {
  label: string
  met: boolean
}

export interface PasswordStrength {
  /** 0-4 — count of met requirements, drives both the strength bar and label. */
  score: number
  label: 'Weak' | 'Fair' | 'Good' | 'Strong'
  textColor: string
  barColor: string
  requirements: PasswordRequirement[]
  /** All requirements met — the minimum bar for accepting a new password. */
  isValid: boolean
}

const LEVELS: Array<Pick<PasswordStrength, 'label' | 'textColor' | 'barColor'>> = [
  { label: 'Weak', textColor: 'text-danger', barColor: 'bg-danger' },
  { label: 'Weak', textColor: 'text-danger', barColor: 'bg-danger' },
  { label: 'Fair', textColor: 'text-warn', barColor: 'bg-warn' },
  { label: 'Good', textColor: 'text-accent-400', barColor: 'bg-accent-500' },
  { label: 'Strong', textColor: 'text-success', barColor: 'bg-success' },
]

/** Matches the character-class requirements the app's own temp-password
 * generator guarantees (netlify/functions/lib/passwordGen.ts) — length,
 * uppercase, lowercase, and a digit — so self-chosen passwords meet the
 * same bar as system-generated ones. */
export function evaluatePasswordStrength(password: string): PasswordStrength {
  const requirements: PasswordRequirement[] = [
    { label: 'At least 8 characters', met: password.length >= 8 },
    { label: 'One uppercase letter', met: /[A-Z]/.test(password) },
    { label: 'One lowercase letter', met: /[a-z]/.test(password) },
    { label: 'One number', met: /[0-9]/.test(password) },
  ]
  const score = requirements.filter((r) => r.met).length
  const level = LEVELS[score]

  return {
    score,
    label: level.label,
    textColor: level.textColor,
    barColor: level.barColor,
    requirements,
    isValid: score === requirements.length,
  }
}
