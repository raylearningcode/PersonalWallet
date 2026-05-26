import { describe, it, expect } from 'vitest'
import { calculateProjectedValue, generateGrowthData } from './investing'

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
