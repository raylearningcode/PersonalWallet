import { describe, it, expect } from 'vitest'
import { getOverspendRisk, getCategoryUsedPct, isInBudgetPeriod, toMonthlyAllocation } from './budget'

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
