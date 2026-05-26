import { describe, it, expect } from 'vitest'
import { formatCurrency } from './currency'

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
})
