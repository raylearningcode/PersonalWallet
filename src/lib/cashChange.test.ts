import { describe, it, expect } from 'vitest'
import { calculateCashChange, splitTwdChange } from './cashChange'

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
})

describe('splitTwdChange', () => {
  it('splits NT$25 into 0 bills and 25 coins', () => {
    const { bills, coins } = splitTwdChange(25)
    expect(bills).toBe(0)
    expect(coins).toBe(25)
  })

  it('splits NT$250 into 200 bills and 50 coins', () => {
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
    const { change } = { change: 100 - 75 }
    const { bills, coins } = splitTwdChange(change)
    expect(bills).toBe(0)
    expect(coins).toBe(25)
  })

  it('NT$750 expense with NT$1000 tendered → NT$200 bill + NT$50 coin', () => {
    const { change } = { change: 1000 - 750 }
    const { bills, coins } = splitTwdChange(change)
    expect(bills).toBe(200)
    expect(coins).toBe(50)
  })
})
