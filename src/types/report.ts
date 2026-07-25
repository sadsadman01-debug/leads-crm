export type ReportType = 'leads' | 'deals' | 'activity'
export type ChartType = 'table' | 'bar' | 'line' | 'donut' | 'table_and_chart'

export interface ReportFilters {
  dateFrom?: string
  dateTo?: string
  priority?: string
  industryId?: string
  assignedTo?: string
  stageId?: string
  customFields?: Record<string, any>
}

export interface SavedReport {
  id: string
  name: string
  report_type: ReportType
  selected_fields: string[]
  group_by: string | null
  filters: ReportFilters
  chart_type: ChartType
  visible_to_all: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface ReportRunResult {
  rows: any[]
  truncated: boolean
  displayCurrency?: string
  ratesUpdatedAt?: string
}

export const REPORT_TYPES: Array<{ value: ReportType; label: string }> = [
  { value: 'leads', label: 'Leads' },
  { value: 'deals', label: 'Deals' },
  { value: 'activity', label: 'Activity / Outreach' },
]

export const CHART_TYPES: Array<{ value: ChartType; label: string }> = [
  { value: 'table', label: 'Table' },
  { value: 'bar', label: 'Bar Chart' },
  { value: 'line', label: 'Line Chart' },
  { value: 'donut', label: 'Pie / Donut Chart' },
  { value: 'table_and_chart', label: 'Table + Chart' },
]

export const GROUP_BY_OPTIONS: Array<{ value: string; label: string; reportTypes: ReportType[] }> = [
  { value: 'industry', label: 'Industry', reportTypes: ['leads', 'deals'] },
  { value: 'assignedTo', label: 'Team Member', reportTypes: ['leads', 'deals', 'activity'] },
  { value: 'stage', label: 'Pipeline Stage', reportTypes: ['leads', 'deals'] },
  { value: 'leadSource', label: 'Lead Source', reportTypes: ['leads'] },
  { value: 'month', label: 'Month', reportTypes: ['leads', 'deals', 'activity'] },
  { value: 'type', label: 'Activity Type', reportTypes: ['activity'] },
]

export interface StarterTemplate {
  name: string
  report_type: ReportType
  group_by: string | null
  chart_type: ChartType
  description: string
}

export const STARTER_TEMPLATES: StarterTemplate[] = [
  { name: 'Leads by Source', report_type: 'leads', group_by: 'leadSource', chart_type: 'bar', description: 'Lead volume broken down by acquisition channel.' },
  { name: 'Conversion Funnel by Industry', report_type: 'leads', group_by: 'industry', chart_type: 'table_and_chart', description: 'Conversion rate compared across industries.' },
  { name: 'Deals by Stage', report_type: 'deals', group_by: 'stage', chart_type: 'donut', description: 'Deal count and value across the pipeline.' },
  { name: 'Revenue by Month', report_type: 'deals', group_by: 'month', chart_type: 'line', description: 'Deal value trended by month.' },
  { name: 'Team Outreach Volume', report_type: 'activity', group_by: 'assignedTo', chart_type: 'bar', description: 'Activity/outreach count per team member.' },
]
