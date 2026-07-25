export type FieldType = 'text' | 'number' | 'date' | 'dropdown' | 'multiselect' | 'checkbox' | 'url' | 'textarea'
export type AppliesTo = 'leads' | 'deals' | 'both'

export interface CustomFieldDefinition {
  id: string
  applies_to: AppliesTo
  label: string
  field_type: FieldType
  options: string[] | null
  required: boolean
  default_value: string | null
  display_order: number
}

export const FIELD_TYPES: Array<{ value: FieldType; label: string }> = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'dropdown', label: 'Dropdown (single-select)' },
  { value: 'multiselect', label: 'Multi-select' },
  { value: 'checkbox', label: 'Checkbox (Yes/No)' },
  { value: 'url', label: 'URL' },
  { value: 'textarea', label: 'Long text / notes' },
]

export const APPLIES_TO_OPTIONS: Array<{ value: AppliesTo; label: string }> = [
  { value: 'leads', label: 'Leads' },
  { value: 'deals', label: 'Deals' },
  { value: 'both', label: 'Both' },
]

export type CustomFieldValues = Record<string, any>
