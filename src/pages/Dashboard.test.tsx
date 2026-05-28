import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { Dashboard } from './Dashboard'

vi.mock('@/lib/queries', () => ({
  useTransactions: () => ({ data: [
    { id: 'tx-1', description: 'Lunch', amount: 100000, original_amount: 100000, original_currency: 'IDR', type: 'expense', category: 'Food', date: '2026-05-20', needs_review: false },
    { id: 'tx-2', description: 'Course', amount: 200000, original_amount: 200000, original_currency: 'IDR', type: 'expense', category: 'Learning', date: '2026-05-21', needs_review: false },
  ] }),
  useInvestmentConfig: () => ({ data: undefined }),
  useBudgetCategories: () => ({ data: [
    { id: 'food', name: 'Food', yearly_allocated: 0, budget_period: 'monthly', color: '#A9F5C7' },
    { id: 'learning', name: 'Learning', yearly_allocated: 0, budget_period: 'monthly', color: '#93C5FD' },
  ] }),
  useAppSettings: () => ({ data: { user_name: '', email: '', currency: 'IDR', base_currency: 'IDR' } }),
  useWallets: () => ({ data: [] }),
  useRecurringRules: () => ({ data: [] }),
  useGoals: () => ({ data: [] }),
}))

vi.mock('@/lib/currency', () => ({
  useMoney: () => ({
    baseCurrency: 'IDR',
    displayCurrency: 'IDR',
    formatBase: (amount: number) => `Rp ${new Intl.NumberFormat('en-US').format(amount)}`,
    formatDisplay: (amount: number) => `Rp ${new Intl.NumberFormat('en-US').format(amount)}`,
  }),
  txAmountColor: (amount: number, type: string) => amount === 0 ? 'text-foreground' : type === 'income' ? 'text-primary' : 'text-[#FF8388]',
  txAmountSign: (amount: number, type: string) => amount === 0 ? '' : type === 'income' ? '+' : type === 'transfer' ? '' : '-',
}))

describe('Dashboard', () => {
  it('does not show a hardcoded profile name when settings has no user name', () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    )

    expect(screen.getByRole('heading', { name: /Good (morning|afternoon|evening)|Still awake|Early start|Midday|Winding down|midnight oil/ })).toBeInTheDocument()
    expect(screen.queryByText(/Rayhan/)).not.toBeInTheDocument()
  })

  it('explains the spending overview purpose and shows the top category', () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    )

    expect(screen.getByText('Where your money is going this year')).toBeInTheDocument()
    expect(screen.getByText('Rp 200,000 Learning')).toBeInTheDocument()
  })
})
