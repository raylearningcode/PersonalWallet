import { describe, it, expect } from 'vitest'
import {
  getBudgetResetStartLabel,
  getCategoryRollover,
  getOverspendRisk,
  getCategoryUsedPct,
  getMonthlyRollover,
  isInBudgetPeriod,
  normalizeBudgetSettings,
  toMonthlyAllocation,
  type BudgetResetFrequency,
  type BudgetRolloverMode,
} from './budget'

describe('budget setting defaults', () => {
  it('normalizes missing budget settings for older cached categories', () => {
    const normalized = normalizeBudgetSettings({
      id: 'food',
      name: 'Food',
      yearly_allocated: 1000,
      budget_period: 'monthly',
      color: '#A9F5C7',
    })

    expect(normalized.reset_frequency).toBe<BudgetResetFrequency>('monthly')
    expect(normalized.reset_start_day).toBe(1)
    expect(normalized.rollover_enabled).toBe(false)
    expect(normalized.rollover_mode).toBe<BudgetRolloverMode>('all_unused')
    expect(normalized.rollover_cap).toBeNull()
  })

  it('labels reset start days from 1st to 31st day of the month', () => {
    expect(getBudgetResetStartLabel(1)).toBe('1st day of the month')
    expect(getBudgetResetStartLabel(2)).toBe('2nd day of the month')
    expect(getBudgetResetStartLabel(3)).toBe('3rd day of the month')
    expect(getBudgetResetStartLabel(4)).toBe('4th day of the month')
    expect(getBudgetResetStartLabel(21)).toBe('21st day of the month')
    expect(getBudgetResetStartLabel(31)).toBe('31st day of the month')
  })

  it('clamps invalid reset start days into the supported month-day range', () => {
    expect(normalizeBudgetSettings({
      id: 'early',
      name: 'Early',
      yearly_allocated: 1000,
      budget_period: 'monthly',
      reset_start_day: -5,
      color: '#A9F5C7',
    }).reset_start_day).toBe(1)

    expect(normalizeBudgetSettings({
      id: 'late',
      name: 'Late',
      yearly_allocated: 1000,
      budget_period: 'monthly',
      reset_start_day: 99,
      color: '#A9F5C7',
    }).reset_start_day).toBe(31)
  })
})

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

describe('getCategoryRollover', () => {
  const periodDate = new Date(2026, 8, 15)
  const txs = [
    tx({ id: 'aug-food', category: 'Food', amount: 600, date: '2026-08-10' }),
    tx({ id: 'aug-fun', category: 'Fun', amount: 200, date: '2026-08-11' }),
    tx({ id: 'sep-food', category: 'Food', amount: 100, date: '2026-09-02' }),
  ]

  it('returns zero when rollover is disabled', () => {
    const cat = normalizeBudgetSettings({
      id: 'food',
      name: 'Food',
      yearly_allocated: 1000,
      budget_period: 'monthly',
      rollover_enabled: false,
      color: '#A9F5C7',
    })
    expect(getCategoryRollover(txs, cat, periodDate)).toBe(0)
  })

  it('rolls over all unused previous-period money when enabled', () => {
    const cat = normalizeBudgetSettings({
      id: 'food',
      name: 'Food',
      yearly_allocated: 1000,
      budget_period: 'monthly',
      rollover_enabled: true,
      rollover_mode: 'all_unused',
      color: '#A9F5C7',
    })
    expect(getCategoryRollover(txs, cat, periodDate)).toBe(400)
  })

  it('caps rollover when custom cap is set', () => {
    const cat = normalizeBudgetSettings({
      id: 'food',
      name: 'Food',
      yearly_allocated: 1000,
      budget_period: 'monthly',
      rollover_enabled: true,
      rollover_mode: 'custom_cap',
      rollover_cap: 250,
      color: '#A9F5C7',
    })
    expect(getCategoryRollover(txs, cat, periodDate)).toBe(250)
  })

  it('uses the previous custom reset period when reset_start_day is not the first', () => {
    const cat = normalizeBudgetSettings({
      id: 'food',
      name: 'Food',
      yearly_allocated: 1000,
      budget_period: 'monthly',
      rollover_enabled: true,
      reset_start_day: 15,
      color: '#A9F5C7',
    })
    const customResetTxs = [
      tx({ id: 'before-prev-period', category: 'Food', amount: 400, date: '2026-08-10' }),
      tx({ id: 'in-prev-period-aug', category: 'Food', amount: 100, date: '2026-08-20' }),
      tx({ id: 'in-prev-period-sep', category: 'Food', amount: 300, date: '2026-09-10' }),
      tx({ id: 'current-period', category: 'Food', amount: 200, date: '2026-09-15' }),
    ]

    expect(getCategoryRollover(customResetTxs, cat, new Date(2026, 8, 20))).toBe(600)
  })

  it('reduces rollover by prior-period split portions attributed to the category', () => {
    const cat = normalizeBudgetSettings({
      id: 'food',
      name: 'Food',
      yearly_allocated: 1000,
      budget_period: 'monthly',
      rollover_enabled: true,
      color: '#A9F5C7',
    })
    const splitTxs = [
      tx({ id: 'direct-food', category: 'Food', amount: 200, date: '2026-08-10' }),
      tx({ id: 'split-food', category: 'Split', amount: 700, date: '2026-08-11', split_portions: [
        { category: 'Food', amount: 300 },
        { category: 'Fun', amount: 400 },
      ] }),
    ]

    expect(getCategoryRollover(splitTxs, cat, periodDate)).toBe(500)
  })

  it('matches split portions case-insensitively when calculating rollover spend', () => {
    const cat = normalizeBudgetSettings({
      id: 'food',
      name: 'Food',
      yearly_allocated: 1000,
      budget_period: 'monthly',
      rollover_enabled: true,
      color: '#A9F5C7',
    })
    const splitTxs = [
      tx({ id: 'split-food', category: 'Split', amount: 400, date: '2026-08-11', split_portions: [
        { category: 'food', amount: 300 },
        { category: 'Fun', amount: 100 },
      ] }),
    ]

    expect(getCategoryRollover(splitTxs, cat, periodDate)).toBe(700)
  })
})
