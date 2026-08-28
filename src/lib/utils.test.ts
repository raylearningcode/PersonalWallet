import { describe, it, expect, vi } from 'vitest'
import { toLocalDateStr, todayLocal, safeGet } from './utils'

describe('toLocalDateStr', () => {
  it('formats from local date parts, not UTC', () => {
    // 2026-08-15 23:30 local in a UTC+8 zone would be 2026-08-15 (toISOString would give 2026-08-15 too);
    // use a time near local midnight to prove local-part math:
    const d = new Date(2026, 7, 28, 0, 30) // local Aug 28 00:30
    expect(toLocalDateStr(d)).toBe('2026-08-28')
  })
  it('pads month and day', () => {
    expect(toLocalDateStr(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})

describe('todayLocal', () => {
  it('equals toLocalDateStr(new Date())', () => {
    expect(todayLocal()).toBe(toLocalDateStr(new Date()))
  })
  it('matches /^\d{4}-\d{2}-\d{2}$/', () => {
    expect(todayLocal()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('safeGet', () => {
  it('returns the stored value', () => {
    localStorage.setItem('k', 'v')
    expect(safeGet('k')).toBe('v')
  })
  it('returns null when storage throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    expect(safeGet('k')).toBeNull()
    spy.mockRestore()
  })
})
