import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Reports } from './Reports'

vi.mock('@/lib/queries', () => ({
  useTransactions: () => ({ data: [
    { id: 'tx-1', description: 'Lunch', amount: 550000, original_amount: 1000, original_currency: 'TWD', type: 'expense', category: 'Food', wallet_id: 'cash', transfer_wallet_id: null, date: '2026-05-21', needs_review: false },
    { id: 'tx-2', description: 'Course', amount: 1100000, original_amount: 2000, original_currency: 'TWD', type: 'expense', category: 'Learning', wallet_id: 'cash', transfer_wallet_id: null, date: '2026-05-18', needs_review: false },
    { id: 'tx-3', description: 'Salary', amount: 2200000, original_amount: 4000, original_currency: 'TWD', type: 'income', category: 'Wage', wallet_id: 'cash', transfer_wallet_id: null, date: '2026-05-01', needs_review: false },
  ] }),
  useBudgetCategories: () => ({ data: [
    { id: 'food', name: 'Food', yearly_allocated: 1000000, budget_period: 'monthly', color: '#A9F5C7' },
    { id: 'learning', name: 'Learning', yearly_allocated: 1000000, budget_period: 'monthly', color: '#93C5FD' },
  ] }),
  useAppSettings: () => ({ data: undefined }),
  useWallets: () => ({ data: [{ id: 'w1', name: 'Cash', type: 'cash', balance: 0, currency: 'IDR' }] }),
  useAddTransaction: () => ({ mutateAsync: async () => {} }),
}))

vi.mock('@/lib/currency', () => ({
  useCurrency: () => (amount: number) => `Rp ${new Intl.NumberFormat('en-US').format(amount)}`,
  useMoney: () => ({
    baseCurrency: 'IDR',
    displayCurrency: 'IDR',
    formatDisplay: (amount: number) => `Rp ${new Intl.NumberFormat('en-US').format(amount)}`,
  }),
  txAmountColor: (amount: number, type: string) => amount === 0 ? 'text-foreground' : type === 'income' ? 'text-primary' : 'text-[#FF8388]',
  txAmountSign: (amount: number, type: string) => amount === 0 ? '' : type === 'income' ? '+' : type === 'transfer' ? '' : '-',
}))

describe('Reports', () => {
  it('switches report range between week, month, and year', () => {
    render(<Reports />)

    expect(screen.getByRole('button', { name: 'Week' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Month' }))
    expect(screen.getByText('Spending by category')).toBeInTheDocument()
    expect(screen.getByText('Category breakdown')).toBeInTheDocument()
    expect(screen.getAllByText('Food').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Learning').length).toBeGreaterThan(0)
  })

  it('moves between specific reporting periods', () => {
    render(<Reports />)

    // Current month (June 2026) has no mock data — empty state
    expect(screen.getByText('June 2026')).toBeInTheDocument()
    expect(screen.getByText('No expense data in this range.')).toBeInTheDocument()
    // Go back to May 2026 where mock transactions exist
    fireEvent.click(screen.getByRole('button', { name: 'Previous period' }))
    expect(screen.getByText('May 2026')).toBeInTheDocument()
    // Go forward again
    fireEvent.click(screen.getByRole('button', { name: 'Next period' }))
    expect(screen.getByText('June 2026')).toBeInTheDocument()
  })
})
