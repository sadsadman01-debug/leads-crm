import clsx from 'clsx'

export function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 ease-out',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        checked ? 'bg-accent-500' : 'bg-base-600'
      )}
    >
      <span
        className={clsx(
          'inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow-soft transition-transform duration-200 ease-out',
          checked ? 'translate-x-6' : 'translate-x-1'
        )}
        style={{ height: '1.125rem', width: '1.125rem' }}
      />
    </button>
  )
}
