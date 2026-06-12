import { describe, expect, it } from 'vitest'
import { formatNumberInput, parseNumberInput } from './numberInput'

describe('number input helpers', () => {
  it('adds grouping while preserving decimals', () => {
    expect(formatNumberInput('1200000')).toBe('1,200,000')
    expect(formatNumberInput('1200000.55')).toBe('1,200,000.55')
  })

  it('parses formatted numbers back to plain values', () => {
    expect(parseNumberInput('1,200,000')).toBe(1200000)
  })
})
