export type RiskLevel = 'Low' | 'Medium' | 'High'
export type BudgetPeriod = 'monthly' | 'yearly'
export type { BudgetResetFrequency, BudgetRolloverMode } from '@/types'
import type { BudgetCategory, BudgetResetFrequency, BudgetRolloverMode, Transaction } from '@/types'

export function getOverspendRisk(remaining: number, total: number): RiskLevel {
  const pct = remaining / total
  if (pct > 0.4) return 'Low'
  if (pct > 0.2) return 'Medium'
  return 'High'
}

export function getCategoryUsedPct(spent: number, allocated: number): number {
  if (allocated === 0) return 0
  return Math.min(100, Math.round((spent / allocated) * 100))
}

export function toMonthlyAllocation(yearlyAllocated: number, period: BudgetPeriod): number {
  return period === 'yearly' ? yearlyAllocated / 12 : yearlyAllocated
}

export function isInBudgetPeriod(date: string, period: BudgetPeriod, now = new Date()): boolean {
  const [year, month] = date.split('-')
  const currentYear = String(now.getFullYear())
  const currentMonth = String(now.getMonth() + 1).padStart(2, '0')

  if (period === 'monthly') return year === currentYear && month === currentMonth
  return year === currentYear
}

export function normalizeBudgetSettings(
  category: BudgetCategory,
): BudgetCategory & {
  reset_frequency: BudgetResetFrequency
  reset_start_day: number
  rollover_enabled: boolean
  rollover_mode: BudgetRolloverMode
  rollover_cap: number | null
} {
  return {
    ...category,
    reset_frequency: category.reset_frequency ?? category.budget_period ?? 'monthly',
    reset_start_day: category.reset_start_day ?? 1,
    rollover_enabled: category.rollover_enabled ?? false,
    rollover_mode: category.rollover_mode ?? 'all_unused',
    rollover_cap: category.rollover_cap ?? null,
  }
}

export function getBudgetResetStartLabel(day: number): string {
  const mod100 = day % 100
  const suffix = mod100 >= 11 && mod100 <= 13
    ? 'th'
    : day % 10 === 1
      ? 'st'
      : day % 10 === 2
        ? 'nd'
        : day % 10 === 3
          ? 'rd'
          : 'th'
  return `${day}${suffix} day of the month`
}

/** Unspent allowance from the month before periodDate that rolls into the
 *  current month (never negative; 0 when the category overspent). */
export function getMonthlyRollover(
  transactions: Transaction[],
  categoryName: string,
  allocated: number,
  periodDate: Date = new Date(),
): number {
  const prev = new Date(periodDate.getFullYear(), periodDate.getMonth() - 1, 1)
  const prefix = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`
  const spent = transactions
    .filter(t =>
      t.type !== 'income' && t.type !== 'transfer' &&
      t.date.startsWith(prefix) &&
      t.category === categoryName &&
      !t.is_system_generated
    )
    .reduce((s, t) => s + t.amount, 0)
  return Math.max(0, allocated - spent)
}

export function getCategoryRollover(
  transactions: Transaction[],
  category: BudgetCategory,
  periodDate: Date = new Date(),
): number {
  const settings = normalizeBudgetSettings(category)
  if (!settings.rollover_enabled || settings.reset_frequency !== 'monthly' || settings.yearly_allocated <= 0) return 0

  const currentPeriodStart = getMonthlyResetPeriodStart(periodDate, settings.reset_start_day)
  const previousPeriodStart = getClampedMonthDate(
    currentPeriodStart.getFullYear(),
    currentPeriodStart.getMonth() - 1,
    settings.reset_start_day,
  )
  const previousPeriodSpend = getCategorySpendBetween(
    transactions,
    settings.name,
    dateKey(previousPeriodStart),
    dateKey(currentPeriodStart),
  )
  const raw = Math.max(0, settings.yearly_allocated - previousPeriodSpend)
  if (settings.rollover_mode === 'custom_cap') {
    return Math.min(raw, Math.max(0, settings.rollover_cap ?? 0))
  }
  return raw
}

function getMonthlyResetPeriodStart(periodDate: Date, resetStartDay: number): Date {
  const year = periodDate.getFullYear()
  const month = periodDate.getMonth()
  const currentMonthDay = clampDayToMonth(year, month, resetStartDay)
  const startMonth = periodDate.getDate() >= currentMonthDay ? month : month - 1
  return getClampedMonthDate(year, startMonth, resetStartDay)
}

function getClampedMonthDate(year: number, month: number, day: number): Date {
  const start = new Date(year, month, 1)
  return new Date(start.getFullYear(), start.getMonth(), clampDayToMonth(start.getFullYear(), start.getMonth(), day))
}

function clampDayToMonth(year: number, month: number, day: number): number {
  return Math.min(day, new Date(year, month + 1, 0).getDate())
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function getCategorySpendBetween(
  transactions: Transaction[],
  categoryName: string,
  startDate: string,
  endDate: string,
): number {
  return transactions.reduce((sum, t) => {
    if (t.type === 'income' || t.type === 'transfer' || t.is_system_generated) return sum
    if (t.date < startDate || t.date >= endDate) return sum
    if (t.split_portions && t.split_portions.length > 0) {
      return sum + t.split_portions
        .filter(portion => portion.category === categoryName)
        .reduce((portionSum, portion) => portionSum + portion.amount, 0)
    }
    return t.category === categoryName ? sum + t.amount : sum
  }, 0)
}

/** Expense transactions in periodDate's month whose category matches no budget category (case-insensitive). */
export function getUnmatchedExpenses(
  transactions: Transaction[],
  categories: BudgetCategory[],
  periodDate: Date,
): Transaction[] {
  const y = String(periodDate.getFullYear())
  const m = String(periodDate.getMonth() + 1).padStart(2, '0')
  const prefix = `${y}-${m}`
  const names = new Set(categories.map(c => c.name.toLowerCase()))
  return transactions.filter(t =>
    t.type !== 'income' && t.type !== 'transfer' &&
    t.date.startsWith(prefix) &&
    !names.has(t.category.toLowerCase()) &&
    // Splits are excluded: their balancing share is computed by getSplitRemainders,
    // so counting their full amount here would double-count them.
    (t.split_portions?.length ?? 0) === 0,
  )
}

/**
 * Sum over split expenses in the month of each split's balancing share:
 * amount − Σ(portions whose category matches a budget category, case-insensitive).
 * A split with no matching portions contributes its full amount; the share never
 * exceeds the transaction amount (clamped at 0 for malformed portions).
 */
export function getSplitRemainders(
  transactions: Transaction[],
  categories: BudgetCategory[],
  periodDate: Date,
): number {
  const y = String(periodDate.getFullYear())
  const m = String(periodDate.getMonth() + 1).padStart(2, '0')
  const prefix = `${y}-${m}`
  const names = new Set(categories.map(c => c.name.toLowerCase()))
  return transactions.reduce((sum, t) => {
    if (t.type === 'income' || t.type === 'transfer' || !t.date.startsWith(prefix)) return sum
    if (!t.split_portions || t.split_portions.length === 0) return sum
    const matched = t.split_portions
      .filter(p => names.has(p.category.toLowerCase()))
      .reduce((s, p) => s + p.amount, 0)
    return sum + Math.max(0, t.amount - matched)
  }, 0)
}

/** Map of lowercased budget-category name → attributed split-portion total for the month. */
export function getSplitAttribution(
  transactions: Transaction[],
  categories: BudgetCategory[],
  periodDate: Date,
): Record<string, number> {
  const y = String(periodDate.getFullYear())
  const m = String(periodDate.getMonth() + 1).padStart(2, '0')
  const prefix = `${y}-${m}`
  const names = new Set(categories.map(c => c.name.toLowerCase()))
  const att: Record<string, number> = {}
  for (const t of transactions) {
    if (t.type === 'income' || t.type === 'transfer' || !t.date.startsWith(prefix)) continue
    if (!t.split_portions) continue
    for (const p of t.split_portions) {
      const key = p.category.toLowerCase()
      if (!names.has(key)) continue
      att[key] = (att[key] ?? 0) + p.amount
    }
  }
  return att
}

/** Unknown/unallocated spending that the Balancing category absorbs. */
export function getBalancingSpent(
  transactions: Transaction[],
  categories: BudgetCategory[],
  periodDate: Date,
): number {
  const unmatchedTotal = getUnmatchedExpenses(transactions, categories, periodDate)
    .reduce((s, t) => s + t.amount, 0)
  return unmatchedTotal + getSplitRemainders(transactions, categories, periodDate)
}
