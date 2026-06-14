import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { Dashboard } from './Dashboard'

vi.mock('@/lib/queries', () => ({
  useAuthSession: () => ({ data: null }),
  useTransactions: () => ({ data: [
    { id: 'tx-1', description: 'Lunch', amount: 100000, original_amount: 100000, original_currency: 'IDR', type: 'expense', category: 'Food', date: '2026-05-20', needs_review: false },
    { id: 'tx-2', description: 'Course', amount: 200000, original_amount: 200000, original_currency: 'IDR', type: 'expense', category: 'Learning', date: '2026-05-21', needs_review: false },
  ] }),
  useInvestmentConfig: () => ({ data: undefined }),
  useBudgetCategories: () => ({ data: [
    { id: 'food', name: 'Food', yearly_allocated: 1200000, budget_period: 'monthly', color: '#A9F5C7' },
    { id: 'learning', name: 'Learning', yearly_allocated: 500000, budget_period: 'monthly', color: '#93C5FD' },
  ] }),
  useAppSettings: () => ({ data: { user_name: '', email: '', currency: 'IDR', base_currency: 'IDR' } }),
  useWallets: () => ({ data: [] }),
  useRecurringRules: () => ({ data: [] }),
  useGoals: () => ({ data: [] }),
  useAddTransaction: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAddWallet: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

vi.mock('@/lib/currency', () => ({
  useMoney: () => ({
    baseCurrency: 'IDR', displayCurrency: 'IDR',
    formatBase: (amount: number) => `Rp ${new Intl.NumberFormat('en-US').format(amount)}`,
    formatDisplay: (amount: number) => `Rp ${new Intl.NumberFormat('en-US').format(amount)}`,
    formatRef: () => null,
    formatTx: (tx: any) => `Rp ${new Intl.NumberFormat('en-US').format(tx.original_currency === 'IDR' && tx.original_amount != null ? tx.original_amount : tx.amount)}`,
    approxBase: (amount: number) => `Rp ${new Intl.NumberFormat('en-US').format(amount)}`,
    toBase: (amount: number) => amount,
    format: (amount: number, currency: string) => `${currency} ${new Intl.NumberFormat('en-US').format(amount)}`,
    fromBase: (amount: number) => amount,
  }),
  txAmountColor: (amount: number, type: string) => amount === 0 ? 'text-foreground' : type === 'income' ? 'text-primary' : 'text-[#FF8388]',
  txAmountSign: (amount: number, type: string) => amount === 0 ? '' : type === 'income' ? '+' : type === 'transfer' ? '' : '-',
}))

vi.mock('@/lib/ai', () => ({
  isAiConfigured: () => false,
  getAiKey: () => null,
  getAiInsights: vi.fn(),
}))

describe('Dashboard', () => {
  it('shows greeting and stat cards', () => {
    render(<MemoryRouter><Dashboard /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: /Good (morning|afternoon|evening)/ })).toBeInTheDocument()
    expect(screen.getByText('Net worth')).toBeInTheDocument()
    expect(screen.getByText('This month')).toBeInTheDocument()
  })

  it('shows recent activity and budget health', () => {
    render(<MemoryRouter><Dashboard /></MemoryRouter>)
    expect(screen.getByText('Recent activity')).toBeInTheDocument()
    expect(screen.getByText('Budget health')).toBeInTheDocument()
    expect(screen.getByText('Lunch')).toBeInTheDocument()
  })
})
