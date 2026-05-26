import { describe, it, expect } from 'vitest'
import { calculateSavingsRate } from './stats'

describe('calculateSavingsRate', () => {
  it('returns 0 for zero income', () => {
    expect(calculateSavingsRate(0, 1000)).toBe(0)
  })
  it('returns 0 when expenses exceed income', () => {
    expect(calculateSavingsRate(100, 200)).toBe(0)
  })
  it('calculates 28.4% rate correctly', () => {
    expect(calculateSavingsRate(10000, 7160)).toBe(28.4)
  })
})
