import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Dashboard } from './Dashboard'

const DEFAULT_TXS = [
  { id: 'tx-1', description: 'Lunch', amount: 100000, original_amount: 100000, original_currency: 'IDR', type: 'expense', category: 'Food', date: '2026-05-20', needs_review: false },
  { id: 'tx-2', description: 'Course', amount: 200000, original_amount: 200000, original_currency: 'IDR', type: 'expense', category: 'Learning', date: '2026-05-21', needs_review: false },
]

const txState = vi.hoisted(() => ({ txs: [] as Record<string, unknown>[] }))

vi.mock('@/lib/queries', () => ({
  useAuthSession: () => ({ data: null }),
  useTransactions: () => ({ data: txState.txs }),
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
  beforeEach(() => {
    txState.txs = [...DEFAULT_TXS]
  })

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

  it('shows an empty state when nothing was spent in the last 7 days', () => {
    render(<MemoryRouter><Dashboard /></MemoryRouter>)
    expect(screen.getByText('Spending trend')).toBeInTheDocument()
    expect(screen.getByText('No spending in the last 7 days.')).toBeInTheDocument()
  })

  it('renders the trend bars for recent spending', () => {
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    txState.txs = [...DEFAULT_TXS, { id: 'tx-today', description: 'Coffee', amount: 50000, original_amount: 50000, original_currency: 'IDR', type: 'expense', category: 'Food', date: todayStr, needs_review: false }]

    render(<MemoryRouter><Dashboard /></MemoryRouter>)
    expect(screen.getByRole('img', { name: /Daily spending for the last 7 days/ })).toBeInTheDocument()
    expect(screen.getByText('dashed line = 7-day average')).toBeInTheDocument()
    expect(screen.queryByText('No spending in the last 7 days.')).not.toBeInTheDocument()
  })
})
