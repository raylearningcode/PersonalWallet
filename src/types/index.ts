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
  is_system_generated?: boolean | null
  linked_transaction_id?: string | null
  cash_tendered?: number | null
  split_portions?: SplitPortion[] | null
  wallet_splits?: WalletSplit[] | null
  created_at?: string
}

export interface SplitPortion {
  category: string
  amount: number
}

export interface WalletSplit {
  wallet_id: string
  amount: number
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

export type CashRole = 'notes' | 'coins' | 'mixed' | 'digital_cash'

export interface Wallet {
  id: string
  user_id?: string | null
  name: string
  type: 'cash' | 'bank' | 'card' | 'e_wallet' | 'investment' | 'other'
  balance: number
  currency: string
  cash_role?: CashRole | null
  default_change_wallet_id?: string | null
  created_at?: string
}

export interface BudgetCategory {
  id: string
  user_id?: string | null
  name: string
  yearly_allocated: number
  budget_period: 'monthly' | 'yearly'
  color: string
  icon?: string | null
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
  contribution_frequency?: 'weekly' | 'monthly' | 'quarterly' | 'yearly'
  contribution_currency?: string
  target_portfolio?: number
  target_currency?: string
  return_rate: number
  duration_years: number
  current_value: number
  allocations: AllocationItem[]
  inflation_rate?: number
  lump_sum?: number
  created_at?: string
}

export type AssetType = 'stock' | 'crypto' | 'etf' | 'bond' | 'other'

export interface Holding {
  id: string
  user_id?: string | null
  name: string
  ticker: string
  asset_type: AssetType
  quantity: number
  buy_price: number
  buy_date: string
  currency: string
  current_price?: number | null
  created_at?: string
}

export interface DividendLog {
  id: string
  user_id?: string | null
  holding_id: string
  amount: number
  date: string
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

export interface Goal {
  id: string
  user_id?: string | null
  name: string
  target_amount: number
  current_amount: number
  deadline?: string | null
  color: string
  category: string
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
