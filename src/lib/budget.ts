export type RiskLevel = 'Low' | 'Medium' | 'High'
export type BudgetPeriod = 'monthly' | 'yearly'

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

import type { Transaction, BudgetCategory } from '@/types'

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
    !names.has(t.category.toLowerCase()),
  )
}

/** Sum of positive split leftovers (amount − sum(portions)) for split expenses in the month. */
export function getSplitRemainders(transactions: Transaction[], periodDate: Date): number {
  const y = String(periodDate.getFullYear())
  const m = String(periodDate.getMonth() + 1).padStart(2, '0')
  const prefix = `${y}-${m}`
  return transactions.reduce((sum, t) => {
    if (t.type === 'income' || t.type === 'transfer' || !t.date.startsWith(prefix)) return sum
    if (!t.split_portions || t.split_portions.length === 0) return sum
    const allocated = t.split_portions.reduce((s, p) => s + p.amount, 0)
    return sum + Math.max(0, t.amount - allocated)
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
  return unmatchedTotal + getSplitRemainders(transactions, periodDate)
}
