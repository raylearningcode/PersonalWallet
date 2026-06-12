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
