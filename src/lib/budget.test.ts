import { describe, it, expect } from 'vitest'
import { getOverspendRisk, getCategoryUsedPct } from './budget'

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
