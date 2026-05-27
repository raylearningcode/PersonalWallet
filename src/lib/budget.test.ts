import { describe, it, expect } from 'vitest'
import { getOverspendRisk, getCategoryUsedPct, isInBudgetPeriod } from './budget'

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
