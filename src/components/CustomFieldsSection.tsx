import type { CustomFieldDefinition } from '@/types/customField'

export function CustomFieldsSection({
  fields,
  values,
  onChange,
}: {
  fields: CustomFieldDefinition[]
  values: Record<string, any>
  onChange: (fieldId: string, value: any) => void
}) {
  if (fields.length === 0) return null

  return (
    <div className="space-y-4 border-t border-base-700/60 pt-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-base-300">Custom Fields</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {fields.map((field) => (
          <div key={field.id} className={field.field_type === 'textarea' ? 'sm:col-span-2' : ''}>
            <CustomFieldInput field={field} value={values[field.id]} onChange={(v) => onChange(field.id, v)} />
          </div>
        ))}
      </div>
    </div>
  )
}

export function CustomFieldInput({
  field,
  value,
  onChange,
}: {
  field: CustomFieldDefinition
  value: any
  onChange: (value: any) => void
}) {
  const label = (
    <label className="label">
      {field.label}
      {field.required && <span className="ml-1 text-danger">*</span>}
    </label>
  )

  if (field.field_type === 'checkbox') {
    return (
      <label className="flex items-center gap-2.5 pt-6 text-sm text-base-200">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 rounded border-base-600 bg-base-800 text-accent-500 focus:ring-accent-500"
        />
        {field.label}
        {field.required && <span className="text-danger">*</span>}
      </label>
    )
  }

  if (field.field_type === 'textarea') {
    return (
      <>
        {label}
        <textarea className="input min-h-[80px] resize-y" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
      </>
    )
  }

  if (field.field_type === 'dropdown') {
    return (
      <>
        {label}
        <select className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">—</option>
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      </>
    )
  }

  if (field.field_type === 'multiselect') {
    const selected: string[] = Array.isArray(value) ? value : []
    function toggle(option: string) {
      onChange(selected.includes(option) ? selected.filter((o) => o !== option) : [...selected, option])
    }
    return (
      <>
        {label}
        <div className="flex flex-wrap gap-1.5">
          {(field.options ?? []).map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => toggle(o)}
              className={`pill border transition-colors ${
                selected.includes(o)
                  ? 'border-accent-500 bg-accent-500/15 text-accent-400'
                  : 'border-base-600 bg-base-800 text-base-300 hover:bg-base-700'
              }`}
            >
              {o}
            </button>
          ))}
        </div>
      </>
    )
  }

  const inputType = field.field_type === 'number' ? 'number' : field.field_type === 'date' ? 'date' : field.field_type === 'url' ? 'url' : 'text'

  return (
    <>
      {label}
      <input
        type={inputType}
        className="input"
        value={value ?? ''}
        placeholder={field.field_type === 'url' ? 'https://…' : undefined}
        onChange={(e) => onChange(field.field_type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value)}
      />
    </>
  )
}
