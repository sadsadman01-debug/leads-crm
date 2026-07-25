import { Badge } from '@/components/ui/Badge'
import type { CustomFieldDefinition } from '@/types/customField'

function formatValue(field: CustomFieldDefinition, value: any): string {
  if (value === null || value === undefined || value === '') return '—'
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : '—'
  if (field.field_type === 'checkbox') return value ? 'Yes' : 'No'
  return String(value)
}

export function CustomFieldsDisplay({
  fields,
  values,
}: {
  fields: CustomFieldDefinition[]
  values: Record<string, any>
}) {
  if (fields.length === 0) return null

  return (
    <div className="card space-y-3 p-6">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-base-300">Custom Fields</h2>
      <div className="space-y-2.5">
        {fields.map((field) => {
          const value = values[field.id]
          if (field.field_type === 'url' && value) {
            return (
              <div key={field.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-base-400">{field.label}</span>
                <a
                  href={/^https?:\/\//i.test(value) ? value : `https://${value}`}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-accent-400 hover:underline"
                >
                  {value}
                </a>
              </div>
            )
          }
          return (
            <div key={field.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-base-400">{field.label}</span>
              {field.field_type === 'checkbox' ? (
                <Badge tone={value ? 'success' : 'neutral'}>{value ? 'Yes' : 'No'}</Badge>
              ) : (
                <span className="text-right text-base-200">{formatValue(field, value)}</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
