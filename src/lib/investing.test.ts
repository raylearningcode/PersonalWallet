import { describe, it, expect } from 'vitest'
import { calculateProjectedValue, calculateInvestmentPlan, generateGrowthData } from './investing'

describe('calculateProjectedValue', () => {
  it('returns 0 for 0 monthly contribution', () => {
    expect(calculateProjectedValue(0, 7, 7)).toBe(0)
  })
  it('handles 0% return rate as simple sum', () => {
    expect(calculateProjectedValue(100, 0, 1)).toBe(1200)
  })
  it('calculates $430/month at 7% for 7 years ≈ $46,440', () => {
    expect(calculateProjectedValue(430, 7, 7)).toBeCloseTo(46440, -2)
  })
})

describe('calculateInvestmentPlan', () => {
  it('includes initial capital and monthly contributions in projected portfolio', () => {
    const plan = calculateInvestmentPlan({
      monthlyContribution: 1500000,
      annualReturnRate: 7,
      durationYears: 7,
      initialCapital: 5000000,
    })

    expect(plan.projectedPortfolio).toBeCloseTo(170100000, -5)
    expect(plan.totalContributed).toBe(126000000)
    expect(plan.totalInvested).toBe(131000000)
    expect(plan.projectedGain).toBeGreaterThan(39000000)
  })
})

describe('generateGrowthData', () => {
  it('returns durationYears + 1 points starting at year 0 with value 0', () => {
    const data = generateGrowthData(430, 7, 7)
    expect(data).toHaveLength(8)
    expect(data[0]).toEqual({ year: 0, value: 0, contributed: 0 })
  })
  it('final year value matches calculateProjectedValue', () => {
    const data = generateGrowthData(430, 7, 7)
    expect(data[7].value).toBeCloseTo(calculateProjectedValue(430, 7, 7), 0)
  })
})
