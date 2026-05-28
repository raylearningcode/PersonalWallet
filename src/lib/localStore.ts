import type { AppSettings, BudgetCategory, EstimationPlan, Goal, InvestmentConfig, RecurringRule, Transaction, Wallet } from '@/types'
import { getDueRecurringOccurrences, getNextRecurringState } from './recurring'

const PFX = 'finpath_guest_'

function load<T>(key: string, fallback: T): T {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(PFX + key) : null
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function save<T>(key: string, value: T): void {
  try {
    if (typeof window !== 'undefined') localStorage.setItem(PFX + key, JSON.stringify(value))
  } catch {
    // storage full or unavailable
  }
}

function newId() {
  return crypto.randomUUID()
}

function nowIso() {
  return new Date().toISOString()
}

// ─── Transactions ───────────────────────────────────────────────────────────

export function localGetTransactions(): Transaction[] {
  return load<Transaction[]>('transactions', [])
}

export function localAddTransaction(data: Omit<Transaction, 'id' | 'user_id' | 'created_at'>): Transaction {
  const tx: Transaction = { ...data, id: newId(), user_id: null, created_at: nowIso() }
  save('transactions', [...localGetTransactions(), tx])
  return tx
}

export function localUpdateTransaction(id: string, patch: Partial<Transaction>): Transaction {
  const all = localGetTransactions().map(t => (t.id === id ? { ...t, ...patch } : t))
  save('transactions', all)
  return all.find(t => t.id === id)!
}

export function localDeleteTransaction(id: string): void {
  save('transactions', localGetTransactions().filter(t => t.id !== id))
}

export function localMarkReviewed(id: string): void {
  localUpdateTransaction(id, { needs_review: false })
}

// ─── Wallets ─────────────────────────────────────────────────────────────────

export function localGetWallets(): Wallet[] {
  return load<Wallet[]>('wallets', [])
}

export function localAddWallet(data: Omit<Wallet, 'id' | 'user_id' | 'created_at'>): Wallet {
  const wallet: Wallet = { ...data, id: newId(), user_id: null, created_at: nowIso() }
  save('wallets', [...localGetWallets(), wallet])
  return wallet
}

export function localDeleteWallet(id: string): void {
  save('wallets', localGetWallets().filter(w => w.id !== id))
}

// ─── Budget Categories ────────────────────────────────────────────────────────

export function localGetCategories(): BudgetCategory[] {
  return load<BudgetCategory[]>('categories', [])
}

export function localAddCategory(data: Omit<BudgetCategory, 'id' | 'user_id' | 'created_at' | 'budget_period'> & Partial<Pick<BudgetCategory, 'budget_period'>>): BudgetCategory {
  const cat: BudgetCategory = { ...data, budget_period: data.budget_period ?? 'monthly', id: newId(), user_id: null, created_at: nowIso() }
  save('categories', [...localGetCategories(), cat])
  return cat
}

export function localUpdateCategory(id: string, patch: Partial<BudgetCategory>): BudgetCategory {
  const all = localGetCategories().map(c => (c.id === id ? { ...c, ...patch } : c))
  save('categories', all)
  return all.find(c => c.id === id)!
}

export function localDeleteCategory(id: string): void {
  save('categories', localGetCategories().filter(c => c.id !== id))
}

// ─── Recurring Rules ──────────────────────────────────────────────────────────

export function localGetRules(): RecurringRule[] {
  return load<RecurringRule[]>('rules', [])
}

export function localAddRule(data: Omit<RecurringRule, 'id' | 'user_id' | 'created_at'>): RecurringRule {
  const rule: RecurringRule = { ...data, id: newId(), user_id: null, created_at: nowIso() }
  save('rules', [...localGetRules(), rule])
  return rule
}

export function localUpdateRule(id: string, patch: Partial<RecurringRule>): RecurringRule {
  const all = localGetRules().map(r => (r.id === id ? { ...r, ...patch } : r))
  save('rules', all)
  return all.find(r => r.id === id)!
}

export function localDeleteRule(id: string): void {
  save('rules', localGetRules().filter(r => r.id !== id))
}

export function localRunDueRules(today = new Date().toISOString().slice(0, 10)): number {
  const rules = localGetRules().filter(r => r.active && r.next_due_date <= today)
  const existingTxs = localGetTransactions()
  let count = 0
  for (const rule of rules) {
    const occurrences = getDueRecurringOccurrences(rule, today)
    for (const dueDate of occurrences) {
      const alreadyExists = existingTxs.some(
        t => t.recurring_rule_id === rule.id && t.recurring_due_date === dueDate
      )
      if (!alreadyExists) {
        localAddTransaction({
          description: rule.description,
          amount: rule.amount,
          original_amount: rule.original_amount,
          original_currency: rule.original_currency,
          type: rule.type,
          category: rule.category,
          wallet_id: rule.wallet_id ?? null,
          transfer_wallet_id: rule.transfer_wallet_id ?? null,
          recurring_rule_id: rule.id,
          recurring_due_date: dueDate,
          date: dueDate,
          needs_review: false,
        })
        count++
      }
    }
    if (occurrences.length > 0) {
      localUpdateRule(rule.id, getNextRecurringState(rule, occurrences.length))
    }
  }
  return count
}

// ─── App Settings ─────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: AppSettings = {
  id: 'guest',
  user_id: null,
  user_name: '',
  email: '',
  theme: 'dark',
  currency: 'IDR',
  base_currency: 'IDR',
  year_start: '01-01',
  default_view: 'dashboard',
  notifications: 'off',
  annual_goal_label: '',
  annual_goal_pct: 0,
}

export function localGetSettings(): AppSettings {
  return load<AppSettings>('settings', DEFAULT_SETTINGS)
}

export function localSaveSettings(patch: Partial<AppSettings>): AppSettings {
  const updated = { ...localGetSettings(), ...patch }
  save('settings', updated)
  return updated
}

// ─── Investment Config ────────────────────────────────────────────────────────

export function localGetInvestment(): InvestmentConfig | null {
  return load<InvestmentConfig | null>('investment', null)
}

export function localSaveInvestment(data: Partial<Omit<InvestmentConfig, 'created_at'>>): InvestmentConfig {
  const current = localGetInvestment()
  const updated: InvestmentConfig = {
    id: current?.id ?? newId(),
    user_id: null,
    monthly_contribution: 0,
    return_rate: 7,
    duration_years: 10,
    current_value: 0,
    allocations: [],
    ...current,
    ...data,
    created_at: current?.created_at ?? nowIso(),
  }
  save('investment', updated)
  return updated
}

// ─── Estimation Plans ─────────────────────────────────────────────────────────

export function localGetPlans(): EstimationPlan[] {
  return load<EstimationPlan[]>('plans', [])
}

export function localUpsertPlan(data: Omit<EstimationPlan, 'id' | 'user_id' | 'created_at'>): EstimationPlan {
  const plans = localGetPlans()
  const existing = plans.find(p => p.month === data.month && p.year === data.year)
  if (existing) {
    const updated = plans.map(p => (p.id === existing.id ? { ...p, ...data } : p))
    save('plans', updated)
    return updated.find(p => p.id === existing.id)!
  }
  const plan: EstimationPlan = { ...data, id: newId(), user_id: null, created_at: nowIso() }
  save('plans', [...plans, plan])
  return plan
}

// ─── Goals ────────────────────────────────────────────────────────────────────

export function localGetGoals(): Goal[] {
  return load<Goal[]>('goals', [])
}

export function localAddGoal(data: Omit<Goal, 'id' | 'user_id' | 'created_at'>): Goal {
  const goal: Goal = { ...data, id: newId(), user_id: null, created_at: nowIso() }
  save('goals', [...localGetGoals(), goal])
  return goal
}

export function localUpdateGoal(id: string, patch: Partial<Goal>): Goal {
  const all = localGetGoals().map(g => (g.id === id ? { ...g, ...patch } : g))
  save('goals', all)
  return all.find(g => g.id === id)!
}

export function localDeleteGoal(id: string): void {
  save('goals', localGetGoals().filter(g => g.id !== id))
}

// ─── Guest mode helpers ───────────────────────────────────────────────────────

export function hasGuestData(): boolean {
  return (
    localGetTransactions().length > 0 ||
    localGetWallets().length > 0 ||
    localGetCategories().length > 0 ||
    localGetRules().length > 0 ||
    localGetPlans().length > 0 ||
    localGetGoals().length > 0 ||
    localGetInvestment() !== null
  )
}

export function clearGuestData(): void {
  const keys = ['transactions', 'wallets', 'categories', 'rules', 'settings', 'investment', 'plans', 'goals']
  keys.forEach(k => {
    if (typeof window !== 'undefined') localStorage.removeItem(PFX + k)
  })
}

export function getGuestDataForMigration() {
  return {
    transactions: localGetTransactions(),
    wallets: localGetWallets(),
    categories: localGetCategories(),
    rules: localGetRules(),
    plans: localGetPlans(),
    goals: localGetGoals(),
    investment: localGetInvestment(),
  }
}
