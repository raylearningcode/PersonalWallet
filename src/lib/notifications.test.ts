import { describe, expect, it } from 'vitest'
import { daysUntil, ruleNotificationId } from './notifications'
import { toLocalDateStr } from './utils'

describe('daysUntil', () => {
  it('parses YYYY-MM-DD as a local date, never UTC', () => {
    // Built entirely from local parts — the old `new Date(str)` UTC parse can
    // land a day earlier in negative-offset timezones and shift the result.
    const localTarget = new Date(2026, 0, 15)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const expected = Math.round((localTarget.getTime() - today.getTime()) / 86400000)
    expect(daysUntil('2026-01-15')).toBe(expected)
  })

  it('returns 0 for today in the local timezone', () => {
    expect(daysUntil(toLocalDateStr(new Date()))).toBe(0)
  })
})

describe('ruleNotificationId', () => {
  it('is deterministic and stable for the same rule', () => {
    expect(ruleNotificationId('rule-1', 'bill')).toBe(81931)
    expect(ruleNotificationId('rule-1', 'bill')).toBe(ruleNotificationId('rule-1', 'bill'))
  })

  it('derives ids from the rule id so deleting a rule cancels its notification', () => {
    expect(ruleNotificationId('rule-a', 'bill')).not.toBe(ruleNotificationId('rule-b', 'bill'))
    expect(ruleNotificationId('rule-a', 'bill')).not.toBe(ruleNotificationId('rule-a', 'soon'))
  })

  it('keeps ids in the reserved 9000+ range', () => {
    expect(ruleNotificationId('rule-1', 'bill')).toBeGreaterThanOrEqual(9000)
    expect(ruleNotificationId('rule-1', 'bill')).toBeLessThan(99000)
  })
})
