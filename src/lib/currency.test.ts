import { describe, it, expect } from 'vitest'
import { convertCurrency, formatCurrency, getFallbackRates } from './currency'

describe('formatCurrency', () => {
  it('formats IDR with Rp prefix and no decimals', () => {
    expect(formatCurrency(84250000, 'IDR')).toBe('Rp 84,250,000')
  })

  it('formats USD with $ symbol and 2 decimals', () => {
    expect(formatCurrency(84250, 'USD')).toBe('$84,250.00')
  })

  it('formats zero for IDR', () => {
    expect(formatCurrency(0, 'IDR')).toBe('Rp 0')
  })

  it('formats zero for USD', () => {
    expect(formatCurrency(0, 'USD')).toBe('$0.00')
  })

  it('never contains the string "IDR"', () => {
    expect(formatCurrency(1000000, 'IDR')).not.toContain('IDR')
  })

  it('converts a typed foreign amount back into the base currency', () => {
    const rates = getFallbackRates('IDR')

    expect(Math.round(convertCurrency(1000, 'TWD', 'IDR', rates))).toBe(550000)
  })

  it('converts a base amount into the display currency', () => {
    const rates = getFallbackRates('IDR')

    expect(Math.round(convertCurrency(550000, 'IDR', 'TWD', rates))).toBe(1000)
  })
})
