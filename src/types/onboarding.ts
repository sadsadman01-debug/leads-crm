export interface OnboardingStep {
  id: string
  label: string
  link: string
  done: boolean
}

export interface OnboardingStatus {
  applicable: boolean
  dismissed: boolean
  completed: boolean
  justCompleted: boolean
  steps: OnboardingStep[]
  completedCount: number
  totalCount: number
}
