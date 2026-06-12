import { describe, expect, it } from 'vitest'
import { FREQ_MONTHS, getMonthlyImpact, getYearlyImpact } from './subscriptionCalc'

describe('subscription frequency multipliers', () => {
  it('daily multiplier converts to monthly correctly (×30)', () => {
    // Rp 10,000/day → Rp 300,000/month
    expect(FREQ_MONTHS.daily).toBe(30)
    expect(getMonthlyImpact(10_000, 'daily')).toBe(300_000)
  })

  it('weekly multiplier converts to monthly correctly (×4.33)', () => {
    // Rp 50,000/week → ≈ Rp 216,500/month
    expect(FREQ_MONTHS.weekly).toBe(4.33)
    expect(getMonthlyImpact(50_000, 'weekly')).toBeCloseTo(216_500, 0)
  })

  it('monthly multiplier is identity (×1)', () => {
    expect(FREQ_MONTHS.monthly).toBe(1)
    expect(getMonthlyImpact(200_000, 'monthly')).toBe(200_000)
  })

  it('yearly multiplier reduces to monthly (÷12)', () => {
    // Rp 1,200,000/year → Rp 100,000/month
    expect(getMonthlyImpact(1_200_000, 'yearly')).toBeCloseTo(100_000, 0)
  })

  it('yearly impact is 12× monthly impact', () => {
    expect(getYearlyImpact(10_000, 'monthly')).toBeCloseTo(120_000, 0)
    expect(getYearlyImpact(10_000, 'daily')).toBeCloseTo(3_600_000, 0)
  })

  it('unknown frequency falls back to ×1 (monthly)', () => {
    expect(getMonthlyImpact(100, 'biannual')).toBe(100)
  })
})
