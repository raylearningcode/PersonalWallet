import { describe, it, expect } from 'vitest'
import { calculateCashChange, splitChangeByPolicy, splitTwdChange } from './cashChange'

describe('calculateCashChange', () => {
  it('returns valid change when tendered > amount', () => {
    const result = calculateCashChange(75, 100)
    expect(result.valid).toBe(true)
    expect(result.change).toBe(25)
  })

  it('returns no change when tendered equals amount (exact cash)', () => {
    const result = calculateCashChange(100, 100)
    expect(result.valid).toBe(true)
    expect(result.change).toBe(0)
  })

  it('is invalid when tendered < amount', () => {
    const result = calculateCashChange(100, 50)
    expect(result.valid).toBe(false)
    expect(result.change).toBe(0)
  })

  it('handles large amounts correctly', () => {
    const result = calculateCashChange(750, 1000)
    expect(result.valid).toBe(true)
    expect(result.change).toBe(250)
  })

  it('handles zero tendered', () => {
    const result = calculateCashChange(50, 0)
    expect(result.valid).toBe(false)
  })

  it('rejects non-finite amounts', () => {
    expect(calculateCashChange(Number.NaN, 100)).toEqual({ valid: false, change: 0 })
    expect(calculateCashChange(75, Number.POSITIVE_INFINITY)).toEqual({ valid: false, change: 0 })
  })
})

describe('splitChangeByPolicy', () => {
  it('routes all TWD change to coins when policy is all-coins', () => {
    const { bills, coins } = splitChangeByPolicy(250, { currency: 'TWD', routeFiftyCoinTo: 'all-coins' })

    expect(bills).toBe(0)
    expect(coins).toBe(250)
  })

  it('uses notes routing when policy sends NT$50 to notes', () => {
    const { bills, coins } = splitChangeByPolicy(175, { currency: 'TWD', routeFiftyCoinTo: 'notes' })

    expect(bills).toBe(150)
    expect(coins).toBe(25)
  })

  it('routes non-TWD change as one destination amount', () => {
    const { bills, coins } = splitChangeByPolicy(12.5, { currency: 'USD', routeFiftyCoinTo: 'coins' })

    expect(bills).toBe(0)
    expect(coins).toBe(12.5)
  })

  it('never returns negative change buckets', () => {
    const { bills, coins } = splitChangeByPolicy(-25, { currency: 'TWD', routeFiftyCoinTo: 'coins' })

    expect(bills).toBe(0)
    expect(coins).toBe(0)
  })
})

describe('splitTwdChange (coins routing — default)', () => {
  it('splits NT$25 into 0 bills and 25 coins', () => {
    const { bills, coins } = splitTwdChange(25)
    expect(bills).toBe(0)
    expect(coins).toBe(25)
  })

  it('splits NT$250 into 200 bills and 50 coins (NT$50 → coin pouch)', () => {
    const { bills, coins } = splitTwdChange(250)
    expect(bills).toBe(200)
    expect(coins).toBe(50)
  })

  it('splits NT$100 into 100 bills and 0 coins', () => {
    const { bills, coins } = splitTwdChange(100)
    expect(bills).toBe(100)
    expect(coins).toBe(0)
  })

  it('splits NT$199 into 100 bills and 99 coins', () => {
    const { bills, coins } = splitTwdChange(199)
    expect(bills).toBe(100)
    expect(coins).toBe(99)
  })

  it('handles zero change', () => {
    const { bills, coins } = splitTwdChange(0)
    expect(bills).toBe(0)
    expect(coins).toBe(0)
  })

  it('NT$75 expense with NT$100 tendered → NT$25 coin transfer', () => {
    const { bills, coins } = splitTwdChange(100 - 75)
    expect(bills).toBe(0)
    expect(coins).toBe(25)
  })

  it('NT$750 expense with NT$1000 tendered → NT$200 bill + NT$50 coin', () => {
    const { bills, coins } = splitTwdChange(1000 - 750)
    expect(bills).toBe(200)
    expect(coins).toBe(50)
  })
})

describe('splitTwdChange (notes routing — NT$50 stays in main wallet)', () => {
  it('NT$250 change → 250 bills, 0 coins when NT$50 routes to notes', () => {
    const { bills, coins } = splitTwdChange(250, 'notes')
    expect(bills).toBe(250)
    expect(coins).toBe(0)
  })

  it('NT$350 change → 350 bills, 0 coins when NT$50 routes to notes', () => {
    const { bills, coins } = splitTwdChange(350, 'notes')
    expect(bills).toBe(350)
    expect(coins).toBe(0)
  })

  it('NT$175 change → 150 bills, 25 coins when NT$50 routes to notes', () => {
    const { bills, coins } = splitTwdChange(175, 'notes')
    expect(bills).toBe(150)
    expect(coins).toBe(25)
  })

  it('NT$25 change → 0 bills, 25 coins even when routing notes (sub-50)', () => {
    const { bills, coins } = splitTwdChange(25, 'notes')
    expect(bills).toBe(0)
    expect(coins).toBe(25)
  })

  it('NT$100 change → 100 bills, 0 coins', () => {
    const { bills, coins } = splitTwdChange(100, 'notes')
    expect(bills).toBe(100)
    expect(coins).toBe(0)
  })
})
