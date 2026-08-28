import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationsSheet } from './NotificationsSheet'
import type { RecurringRule } from '@/types/index'

// Query results are mutated per-test to simulate pending -> loaded transitions.
const queryStates = vi.hoisted(() => ({
  transactions: { data: undefined as unknown[] | undefined, isPending: false },
  categories: { data: undefined as unknown[] | undefined, isPending: false },
  recurringRules: { data: undefined as unknown[] | undefined, isPending: false },
  goals: { data: undefined as unknown[] | undefined, isPending: false },
}))

vi.mock('@/lib/queries', () => ({
  useTransactions: () => queryStates.transactions,
  useBudgetCategories: () => queryStates.categories,
  useRecurringRules: () => queryStates.recurringRules,
  useGoals: () => queryStates.goals,
}))

vi.mock('@/lib/currency', () => ({
  useMoney: () => ({ formatDisplay: (n: number) => `Rp ${n}` }),
}))

const DISMISSALS_KEY = 'finpath_dismissed_notifications'

function todayStr(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function makeRule(overrides: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: 'r1',
    description: 'Internet',
    amount: 100,
    original_amount: 100,
    original_currency: 'IDR',
    type: 'expense',
    category: 'Utilities',
    start_date: '2026-01-01',
    next_due_date: todayStr(),
    frequency: 'monthly',
    installment_paid: 0,
    active: true,
    ...overrides,
  }
}

beforeEach(() => {
  localStorage.clear()
  queryStates.transactions = { data: [], isPending: false }
  queryStates.categories = { data: [], isPending: false }
  queryStates.recurringRules = { data: [], isPending: false }
  queryStates.goals = { data: [], isPending: false }
})

describe('NotificationsSheet dismissal pruning', () => {
  it('does not persist an empty dismissal set while queries are pending (cold start)', () => {
    localStorage.setItem(DISMISSALS_KEY, JSON.stringify(['bill_today_r1', 'stale_999']))
    queryStates.transactions = { data: undefined, isPending: true }
    queryStates.categories = { data: undefined, isPending: true }
    queryStates.recurringRules = { data: undefined, isPending: true }
    queryStates.goals = { data: undefined, isPending: true }

    render(<NotificationsSheet />)

    // liveIds is unknown while queries are pending — pruning must be skipped,
    // so the previously persisted dismissals stay untouched.
    expect(localStorage.getItem(DISMISSALS_KEY)).toBe(JSON.stringify(['bill_today_r1', 'stale_999']))
  })

  it('prunes dismissals that no longer match a live notification once queries have loaded', () => {
    localStorage.setItem(DISMISSALS_KEY, JSON.stringify(['bill_today_r1', 'stale_999']))
    queryStates.recurringRules = { data: [makeRule()], isPending: false }

    render(<NotificationsSheet />)

    // The stale dismissal is removed, but the live one (bill_today_r1) is kept
    // — and the still-live notification stays dismissed (does not reappear).
    expect(localStorage.getItem(DISMISSALS_KEY)).toBe(JSON.stringify(['bill_today_r1']))
    expect(screen.getByRole('button', { name: /0 notifications/ })).toBeInTheDocument()
  })

  it('keeps dismissals across a pending -> loaded transition (app cold start)', () => {
    localStorage.setItem(DISMISSALS_KEY, JSON.stringify(['bill_today_r1', 'stale_999']))
    queryStates.transactions = { data: undefined, isPending: true }
    queryStates.categories = { data: undefined, isPending: true }
    queryStates.recurringRules = { data: undefined, isPending: true }
    queryStates.goals = { data: undefined, isPending: true }

    const { rerender } = render(<NotificationsSheet />)
    expect(localStorage.getItem(DISMISSALS_KEY)).toBe(JSON.stringify(['bill_today_r1', 'stale_999']))

    // Queries resolve with a live bill_today_r1 notification.
    queryStates.transactions = { data: [], isPending: false }
    queryStates.categories = { data: [], isPending: false }
    queryStates.recurringRules = { data: [makeRule()], isPending: false }
    queryStates.goals = { data: [], isPending: false }

    rerender(<NotificationsSheet />)

    // Only the stale id is pruned; the live dismissal survived the load and the
    // still-live notification does not reappear.
    expect(localStorage.getItem(DISMISSALS_KEY)).toBe(JSON.stringify(['bill_today_r1']))
    expect(screen.getByRole('button', { name: /0 notifications/ })).toBeInTheDocument()
  })
})
