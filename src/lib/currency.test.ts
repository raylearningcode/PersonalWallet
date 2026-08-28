import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// currency.ts pulls in queries.ts → supabase.ts, which now fails fast when
// VITE_SUPABASE_* are missing — provide test env vars before loading the module.
async function loadCurrency() {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key')
  vi.resetModules()
  return import('./currency')
}

let currency: typeof import('./currency')

beforeEach(async () => {
  currency = await loadCurrency()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('formatCurrency', () => {
  it('formats IDR with Rp prefix and no decimals', () => {
    expect(currency.formatCurrency(84250000, 'IDR')).toBe('Rp 84,250,000')
  })

  it('formats whole USD without trailing .00', () => {
    expect(currency.formatCurrency(84250, 'USD')).toBe('$84,250')
  })

  it('formats USD with cents when not whole', () => {
    expect(currency.formatCurrency(84250.5, 'USD')).toBe('$84,250.50')
  })

  it('formats zero for IDR', () => {
    expect(currency.formatCurrency(0, 'IDR')).toBe('Rp 0')
  })

  it('formats zero for USD without trailing .00', () => {
    expect(currency.formatCurrency(0, 'USD')).toBe('$0')
  })

  it('never contains the string "IDR"', () => {
    expect(currency.formatCurrency(1000000, 'IDR')).not.toContain('IDR')
  })

  it('converts a typed foreign amount back into the base currency', () => {
    const rates = currency.getFallbackRates('IDR')

    expect(Math.round(currency.convertCurrency(1000, 'TWD', 'IDR', rates)!)).toBe(550000)
  })

  it('converts a base amount into the display currency', () => {
    const rates = currency.getFallbackRates('IDR')

    expect(Math.round(currency.convertCurrency(550000, 'IDR', 'TWD', rates)!)).toBe(1000)
  })

  it('returns null when a currency is outside the known table instead of 1:1 math', () => {
    const rates = currency.getFallbackRates('IDR')

    expect(currency.convertCurrency(1000, 'KRW', 'IDR', rates)).toBeNull()
    expect(currency.convertCurrency(1000, 'IDR', 'KRW', rates)).toBeNull()
    expect(currency.convertCurrency(1000, 'GBP', 'KRW', rates)).toBeNull()
  })

  it('still converts when both codes are known but absent from the rates map', () => {
    const rates = currency.getFallbackRates('IDR')

    expect(Math.round(currency.convertCurrency(1000, 'USD', 'EUR', rates)!)).toBe(920)
  })

  it('falls back to raw amount + code for unknown currencies in formatCurrency', () => {
    expect(currency.formatCurrency(1234.5, 'KRW')).toBe('1234.5 KRW')
  })
})

describe('isKnownCurrency', () => {
  it('returns true for every supported code, case-insensitively', () => {
    for (const code of ['USD', 'IDR', 'TWD', 'EUR', 'JPY']) {
      expect(currency.isKnownCurrency(code)).toBe(true)
      expect(currency.isKnownCurrency(code.toLowerCase())).toBe(true)
    }
  })

  it('returns false for unknown/legacy codes', () => {
    for (const code of ['HKD', 'SGD', 'GBP', 'KRW', 'CNY', 'AUD', '']) {
      expect(currency.isKnownCurrency(code)).toBe(false)
    }
  })
})
