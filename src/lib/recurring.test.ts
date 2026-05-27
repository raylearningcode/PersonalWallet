import { describe, expect, it } from 'vitest'
import {
  addRecurringInterval,
  getDueRecurringOccurrences,
  getNextRecurringState,
} from './recurring'
import type { RecurringRule } from '@/types'

const baseRule: RecurringRule = {
  id: 'rule-1',
  description: 'Laptop cicilan',
  amount: 550000,
  original_amount: 1000,
  original_currency: 'TWD',
  type: 'expense',
  category: 'Learning',
  wallet_id: 'cash',
  transfer_wallet_id: null,
  start_date: '2026-01-31',
  next_due_date: '2026-02-28',
  frequency: 'monthly',
  installment_total: 12,
  installment_paid: 1,
  active: true,
}

describe('recurring helpers', () => {
  it('clamps monthly dates to the last valid day', () => {
    expect(addRecurringInterval('2026-01-31', 'monthly')).toBe('2026-02-28')
    expect(addRecurringInterval('2026-02-28', 'monthly')).toBe('2026-03-28')
  })

  it('returns due occurrences through today while respecting installment totals', () => {
    expect(getDueRecurringOccurrences(baseRule, '2026-04-02')).toEqual([
      '2026-02-28',
      '2026-03-28',
    ])
  })

  it('advances installment progress and pauses completed rules', () => {
    expect(getNextRecurringState(baseRule, 11)).toMatchObject({
      installment_paid: 12,
      active: false,
    })
  })

  it('stops at an end date', () => {
    expect(getDueRecurringOccurrences({ ...baseRule, end_date: '2026-03-01', installment_total: null }, '2026-05-01')).toEqual([
      '2026-02-28',
    ])
  })
})
