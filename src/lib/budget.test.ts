import { describe, it, expect } from 'vitest'
import { getOverspendRisk, getCategoryUsedPct, getMonthlyRollover, isInBudgetPeriod, toMonthlyAllocation } from './budget'

describe('getOverspendRisk', () => {
  it('returns Low when remaining > 40%', () => {
    expect(getOverspendRisk(5000, 10000)).toBe('Low')
  })
  it('returns Medium when remaining 20–40%', () => {
    expect(getOverspendRisk(3000, 10000)).toBe('Medium')
  })
  it('returns High when remaining < 20%', () => {
    expect(getOverspendRisk(1000, 10000)).toBe('High')
  })
  it('returns High for negative remaining', () => {
    expect(getOverspendRisk(-100, 10000)).toBe('High')
  })
})

describe('getCategoryUsedPct', () => {
  it('returns 0 for zero allocation', () => {
    expect(getCategoryUsedPct(100, 0)).toBe(0)
  })
  it('returns correct percentage', () => {
    expect(getCategoryUsedPct(720, 1000)).toBe(72)
  })
  it('caps at 100 when overspent', () => {
    expect(getCategoryUsedPct(1500, 1000)).toBe(100)
  })
})

describe('toMonthlyAllocation', () => {
  it('returns the amount unchanged for monthly budgets', () => {
    expect(toMonthlyAllocation(1_000_000, 'monthly')).toBe(1_000_000)
  })

  it('divides yearly allocation by 12 for yearly budgets', () => {
    expect(toMonthlyAllocation(1_200_000, 'yearly')).toBe(100_000)
    expect(toMonthlyAllocation(6_000_000, 'yearly')).toBe(500_000)
  })

  it('normalising prevents apples-and-oranges summation', () => {
    // Summing monthly + yearly/12 gives a sensible monthly total
    const monthlyBudget = toMonthlyAllocation(500_000, 'monthly')
    const yearlyBudget = toMonthlyAllocation(1_200_000, 'yearly')
    expect(monthlyBudget + yearlyBudget).toBe(600_000)
  })
})

describe('isInBudgetPeriod', () => {
  const currentDate = new Date('2026-05-27T12:00:00')

  it('matches only the current month for monthly budgets', () => {
    expect(isInBudgetPeriod('2026-05-01', 'monthly', currentDate)).toBe(true)
    expect(isInBudgetPeriod('2026-04-30', 'monthly', currentDate)).toBe(false)
  })

  it('matches the current year for yearly budgets', () => {
    expect(isInBudgetPeriod('2026-01-01', 'yearly', currentDate)).toBe(true)
    expect(isInBudgetPeriod('2025-12-31', 'yearly', currentDate)).toBe(false)
  })
})

import { getUnmatchedExpenses, getSplitRemainders, getSplitAttribution, getBalancingSpent } from './budget'
import type { Transaction, BudgetCategory } from '@/types'

const periodDate = new Date(2026, 7, 15) // Aug 2026
const cats: BudgetCategory[] = [
  { id: 'c1', name: 'Food', yearly_allocated: 100, budget_period: 'monthly', color: '#fff' },
  { id: 'c2', name: 'Balancing', yearly_allocated: 0, budget_period: 'monthly', color: '#64748B' },
]
const tx = (partial: Partial<Transaction>): Transaction => ({
  id: 'x', description: 'x', amount: 10, original_amount: 10, original_currency: 'USD',
  type: 'expense', category: 'Food', date: '2026-08-05', needs_review: false, ...partial,
})

describe('balancing helpers', () => {
  const txs: Transaction[] = [
    tx({ id: 'a', category: 'Food', amount: 30 }),
    tx({ id: 'b', category: 'Other', amount: 12 }),
    tx({ id: 'c', category: 'Old Category', amount: 8 }),
    tx({ id: 'd', category: 'Split', amount: 50, split_portions: [
      { category: 'Food', amount: 40 }, { category: 'Old Category', amount: 5 },
    ] }),
    tx({ id: 'e', type: 'income', category: 'Wage', amount: 500 }),
    tx({ id: 'f', type: 'transfer', category: 'Transfer', amount: 20 }),
    tx({ id: 'g', category: 'Food', amount: 30, date: '2026-07-05' }), // wrong month
  ]

  it('getUnmatchedExpenses returns only unmatched expenses in the month', () => {
    const unmatched = getUnmatchedExpenses(txs, cats, periodDate)
    expect(unmatched.map(t => t.id).sort()).toEqual(['b', 'c'])
  })

  it('getSplitRemainders is a split’s amount minus its budget-matched portions', () => {
    // split 'd': 50 - 40 (Food portion matches) = 10 = 5 unmatched portion + 5 unallocated gap
    expect(getSplitRemainders(txs, cats, periodDate)).toBe(10)
  })

  it('getSplitRemainders is 0 for a fully allocated, fully matched split', () => {
    const t = [tx({ id: 'h', category: 'Split2', amount: 60, split_portions: [
      { category: 'Food', amount: 40 }, { category: 'Food', amount: 20 },
    ] })]
    expect(getSplitRemainders(t, cats, periodDate)).toBe(0)
  })

  it('getSplitRemainders is the full amount for a split with no matching portions', () => {
    // contribution to balancing never exceeds the split's amount
    const t = [tx({ id: 'i', category: 'Split3', amount: 70, split_portions: [
      { category: 'Old Category', amount: 70 },
    ] })]
    expect(getSplitRemainders(t, cats, periodDate)).toBe(70)
  })

  it('getSplitAttribution attributes portions to matching categories', () => {
    const att = getSplitAttribution(txs, cats, periodDate)
    expect(att['food']).toBe(40)
    // 'Old Category' matches nothing → not attributed
    expect(att['old category']).toBeUndefined()
  })

  it('getBalancingSpent = unmatched total + split balancing shares', () => {
    // unmatched: 12 + 8 = 20 (split 'd' is excluded); split share: 10
    expect(getBalancingSpent(txs, cats, periodDate)).toBe(30)
  })

  it('is case-insensitive on category names', () => {
    const t = [tx({ id: 'h', category: 'food', amount: 3 })]
    expect(getUnmatchedExpenses(t, cats, periodDate)).toEqual([])
  })
})

describe('getMonthlyRollover', () => {
  const periodDate = new Date(2026, 8, 15) // Sep 2026 -> previous month Aug 2026
  const txs = [
    { id: 'a', description: '', amount: 400, original_amount: 400, original_currency: 'IDR', type: 'expense' as const, category: 'Food', date: '2026-08-10', needs_review: false },
    { id: 'b', description: '', amount: 999, original_amount: 999, original_currency: 'IDR', type: 'expense' as const, category: 'Other', date: '2026-08-11', needs_review: false },
    { id: 'c', description: '', amount: 100, original_amount: 100, original_currency: 'IDR', type: 'expense' as const, category: 'Food', date: '2026-09-02', needs_review: false },
    { id: 'd', description: '', amount: 50, original_amount: 50, original_currency: 'IDR', type: 'expense' as const, category: 'Food', date: '2026-08-12', needs_review: false, is_system_generated: true },
  ]

  it('returns the unspent amount from the previous month', () => {
    expect(getMonthlyRollover(txs, 'Food', 1000, periodDate)).toBe(600)
  })

  it('is zero when the previous month overspent', () => {
    expect(getMonthlyRollover(txs, 'Food', 400, periodDate)).toBe(0)
  })

  it('ignores other categories, other months, and system transfers', () => {
    expect(getMonthlyRollover(txs, 'Other', 1000, periodDate)).toBe(1)
    expect(getMonthlyRollover([txs[2]], 'Food', 1000, periodDate)).toBe(1000)
  })
})
