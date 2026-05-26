export interface Transaction {
  id: string
  description: string
  amount: number
  type: 'income' | 'expense' | 'recurring'
  category: string
  date: string
  needs_review: boolean
  created_at?: string
}

export interface BudgetCategory {
  id: string
  name: string
  yearly_allocated: number
  color: string
  created_at?: string
}

export interface BudgetRule {
  id: string
  name: string
  category: string
  rule_type: 'cap' | 'minimum' | 'flexible' | 'emergency_months'
  value: number
  created_at?: string
}

export interface AllocationItem {
  name: string
  pct: number
  color: string
}

export interface InvestmentConfig {
  id: string
  monthly_contribution: number
  return_rate: number
  duration_years: number
  current_value: number
  allocations: AllocationItem[]
  created_at?: string
}

export interface EstimationPlan {
  id: string
  month: number
  year: number
  estimated_income: number
  fixed_expenses: number
  variable_estimate: number
  currency: string
  notes?: string
  created_at?: string
}

export interface AppSettings {
  id: string
  user_name: string
  email: string
  theme: string
  currency: string
  base_currency: string
  year_start: string
  default_view: string
  notifications: string
  annual_goal_label: string
  annual_goal_pct: number
  created_at?: string
}
