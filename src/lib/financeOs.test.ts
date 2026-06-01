import { describe, expect, it } from 'vitest'
import {
  getCategoryInsights,
  getMerchantSuggestion,
  getRecurringCandidates,
  getSafeToSpend,
} from './financeOs'
import type { BudgetCategory, Transaction } from '@/types'

const transactions: Transaction[] = [
  { id: '1', description: 'Kantin', amount: 100, original_amount: 100, original_currency: 'IDR', type: 'expense', category: 'Food', date: '2026-06-01', needs_review: false },
  { id: '2', description: 'Kantin', amount: 120, original_amount: 120, original_currency: 'IDR', type: 'expense', category: 'Food', date: '2026-06-01', needs_review: false },
  { id: '3', description: 'Kantin', amount: 110, original_amount: 110, original_currency: 'IDR', type: 'expense', category: 'Food', date: '2026-06-01', needs_review: false },
  { id: '4', description: 'Salary', amount: 1000, original_amount: 1000, original_currency: 'IDR', type: 'income', category: 'Wage', date: '2026-06-01', needs_review: false },
  { id: '5', description: 'Course', amount: 300, original_amount: 300, original_currency: 'IDR', type: 'expense', category: 'Learning', date: '2026-06-01', needs_review: false },
]

const categories: BudgetCategory[] = [
  { id: 'food', name: 'Food', yearly_allocated: 600, budget_period: 'monthly', color: '#A9F5C7' },
  { id: 'learning', name: 'Learning', yearly_allocated: 1000, budget_period: 'monthly', color: '#93C5FD' },
]

describe('finance OS helpers', () => {
  it('calculates safe daily spend from remaining budget and days left', () => {
    expect(getSafeToSpend(900, 300, 15)).toBe(40)
  })

  it('suggests category from matching merchant history', () => {
    expect(getMerchantSuggestion('Kantin dinner', transactions)).toEqual({
      category: 'Food',
      wallet_id: undefined,
      type: 'expense',
    })
  })

  it('detects recurring candidates by repeated merchant and close amount', () => {
    expect(getRecurringCandidates(transactions)[0]).toMatchObject({
      description: 'Kantin',
      category: 'Food',
      count: 3,
    })
  })

  it('returns category pace insights', () => {
    const insights = getCategoryInsights(transactions, categories, new Date('2026-05-20'))

    expect(insights[0]).toMatchObject({ category: 'Food', usedPct: 55, overPace: false })
    expect(insights[0].message).toContain('55%')
    expect(insights[0].message).toContain('monthly limit')
  })

  it('returns over-pace message when spending outpaces the calendar', () => {
    // Day 5 of 31 = 16% through month, Food spent 330/600 = 55% — that is over pace
    const insights = getCategoryInsights(transactions, categories, new Date('2026-05-05'))
    const food = insights.find(i => i.category === 'Food')!
    expect(food.overPace).toBe(true)
    expect(food.message).toContain('over pace')
  })
})
