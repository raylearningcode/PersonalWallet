export interface Transaction {
  id: string
  user_id?: string | null
  description: string
  amount: number
  original_amount: number
  original_currency: string
  type: 'income' | 'expense' | 'recurring' | 'transfer'
  category: string
  wallet_id?: string | null
  transfer_wallet_id?: string | null
  recurring_rule_id?: string | null
  recurring_due_date?: string | null
  date: string
  needs_review: boolean
  created_at?: string
}

export type RecurringFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly'

export interface RecurringRule {
  id: string
  user_id?: string | null
  description: string
  amount: number
  original_amount: number
  original_currency: string
  type: 'income' | 'expense' | 'transfer'
  category: string
  wallet_id?: string | null
  transfer_wallet_id?: string | null
  start_date: string
  next_due_date: string
  frequency: RecurringFrequency
  end_date?: string | null
  installment_total?: number | null
  installment_paid: number
  active: boolean
  created_at?: string
}

export interface Wallet {
  id: string
  user_id?: string | null
  name: string
  type: 'cash' | 'bank' | 'card' | 'e_wallet' | 'investment' | 'other'
  balance: number
  currency: string
  created_at?: string
}

export interface BudgetCategory {
  id: string
  user_id?: string | null
  name: string
  yearly_allocated: number
  budget_period: 'monthly' | 'yearly'
  color: string
  created_at?: string
}

export interface BudgetRule {
  id: string
  user_id?: string | null
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
  user_id?: string | null
  monthly_contribution: number
  contribution_currency?: string
  target_portfolio?: number
  target_currency?: string
  return_rate: number
  duration_years: number
  current_value: number
  allocations: AllocationItem[]
  created_at?: string
}

export interface EstimationPlan {
  id: string
  user_id?: string | null
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
  user_id?: string | null
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
