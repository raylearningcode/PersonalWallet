import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { Transactions } from './Transactions'

const renderTx = () => render(<MemoryRouter><Transactions /></MemoryRouter>)

const addTransaction = vi.fn()
const updateTransaction = vi.fn()
const deleteTransaction = vi.fn()
const addRecurringRule = vi.fn()
const updateRecurringRule = vi.fn()
const deleteRecurringRule = vi.fn()
const runDueRecurringRules = vi.fn()
const mockWallets = [
  { id: 'cash', name: 'Cash', type: 'cash' as const, balance: 0, currency: 'IDR' },
  { id: 'card', name: 'Debit card', type: 'card' as const, balance: 0, currency: 'IDR' },
]
const mockTransactions = [{
  id: 'tx-1',
  description: 'Old lunch',
  amount: 55000,
  original_amount: 100,
  original_currency: 'TWD',
  type: 'expense' as const,
  category: 'Food',
  wallet_id: 'cash',
  transfer_wallet_id: null,
  date: '2026-06-01',
  needs_review: false,
}, {
  id: 'tx-3',
  description: 'Bus',
  amount: 11000,
  original_amount: 20,
  original_currency: 'TWD',
  type: 'expense' as const,
  category: 'Transport',
  wallet_id: 'cash',
  transfer_wallet_id: null,
  date: '2026-06-01',
  needs_review: false,
}, {
  id: 'tx-2',
  description: 'Salary',
  amount: 2200000,
  original_amount: 4000,
  original_currency: 'TWD',
  type: 'income' as const,
  category: 'Wage',
  wallet_id: 'cash',
  transfer_wallet_id: null,
  date: '2026-06-02',
  needs_review: false,
}]

vi.mock('@/lib/queries', () => ({
  useTransactions: () => ({ data: mockTransactions }),
  useDeleteTransaction: () => ({ mutate: deleteTransaction, mutateAsync: deleteTransaction }),
  useMarkReviewed: () => ({ mutate: vi.fn() }),
  useAddTransaction: () => ({ mutateAsync: addTransaction, isPending: false }),
  useUpdateTransaction: () => ({ mutateAsync: updateTransaction, isPending: false }),
  useWallets: () => ({ data: mockWallets }),
  useAddWallet: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteWallet: () => ({ mutate: vi.fn(), isPending: false }),
  useRecurringRules: () => ({ data: [] }),
  useAddRecurringRule: () => ({ mutateAsync: addRecurringRule, isPending: false }),
  useUpdateRecurringRule: () => ({ mutate: updateRecurringRule, isPending: false }),
  useDeleteRecurringRule: () => ({ mutate: deleteRecurringRule, isPending: false }),
  useRunDueRecurringRules: () => ({ mutate: runDueRecurringRules, isPending: false }),
  useBudgetCategories: () => ({ data: [
    { id: 'food', name: 'Food', yearly_allocated: 1200000, budget_period: 'monthly', color: '#A9F5C7' },
    { id: 'transport', name: 'Transport', yearly_allocated: 400000, budget_period: 'monthly', color: '#93C5FD' },
  ] }),
  useAppSettings: () => ({ data: undefined }),
}))

vi.mock('@/lib/currency', () => ({
  CURRENCIES: ['USD', 'IDR', 'TWD', 'EUR', 'JPY'],
  useMoney: () => ({
    baseCurrency: 'IDR',
    displayCurrency: 'TWD',
    toBase: (amount: number, currency: string) => currency === 'TWD' ? amount * 550 : amount,
    format: (amount: number, currency: string) => `${currency} ${new Intl.NumberFormat('en-US').format(amount)}`,
    formatBase: (amount: number) => `Rp ${new Intl.NumberFormat('en-US').format(amount)}`,
    formatDisplay: (amount: number) => `NT$${new Intl.NumberFormat('en-US').format(Math.round(amount / 550))}`,
    formatRef: (amount: number) => `NT$${new Intl.NumberFormat('en-US').format(Math.round(amount / 550))}`,
    formatTx: (tx: { amount: number; original_amount?: number | null; original_currency?: string | null }) =>
      `Rp ${new Intl.NumberFormat('en-US').format(tx.original_currency === 'IDR' && tx.original_amount != null ? tx.original_amount : tx.amount)}`,
    approxBase: (amount: number) => `Rp ${new Intl.NumberFormat('en-US').format(amount)}`,
  }),
  formatCurrency: (amount: number) =>
    `Rp ${new Intl.NumberFormat('en-US').format(amount)}`,
  useExchangeRates: () => ({ data: {} }),
  txAmountColor: (amount: number, type: string) => amount === 0 ? 'text-foreground' : type === 'income' ? 'text-primary' : 'text-[#FF8388]',
  txAmountSign: (amount: number, type: string) => amount === 0 ? '' : type === 'income' ? '+' : type === 'transfer' ? '' : '-',
}))

describe('Transactions', () => {
  beforeEach(() => {
    addTransaction.mockClear()
    updateTransaction.mockClear()
    deleteTransaction.mockClear()
    addRecurringRule.mockClear()
    updateRecurringRule.mockClear()
    deleteRecurringRule.mockClear()
    runDueRecurringRules.mockClear()
  })

  it('adds a transaction from the input form', () => {
    renderTx()

    fireEvent.click(screen.getByRole('button', { name: 'New transaction' }))
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Lunch' } })
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '120000' } })
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-05-10' } })
    fireEvent.click(screen.getByRole('combobox', { name: 'Category' }))
    fireEvent.click(screen.getByRole('option', { name: 'Food' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }))

    expect(addTransaction).toHaveBeenCalledWith(expect.objectContaining({
      description: 'Lunch',
      amount: 66000000,
      original_amount: 120000,
      original_currency: 'TWD',
      category: 'Food',
      wallet_id: 'cash',
      transfer_wallet_id: null,
      date: '2026-05-10',
      type: 'expense',
      needs_review: false,
    }))
  })

  it('edits an existing transaction from history', () => {
    renderTx()

    fireEvent.click(screen.getByRole('button', { name: 'Edit Old lunch' }))
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Updated lunch' } })
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '200' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save expense' }))

    expect(updateTransaction).toHaveBeenCalledWith(expect.objectContaining({
      id: 'tx-1',
      description: 'Updated lunch',
      amount: 110000,
      original_amount: 200,
      original_currency: 'TWD',
      category: 'Food',
      wallet_id: 'cash',
      transfer_wallet_id: null,
      date: '2026-06-01',
      type: 'expense',
    }))
  })

  it('adds a transfer between wallets', () => {
    renderTx()

    fireEvent.click(screen.getByRole('button', { name: 'New transaction' }))
    fireEvent.click(screen.getByRole('button', { name: 'Transfer' }))
    expect(screen.queryByText('Merchant name')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Transfer note'), { target: { value: 'Move to card' } })
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '300' } })
    fireEvent.change(screen.getByLabelText('From wallet'), { target: { value: 'cash' } })
    fireEvent.change(screen.getByLabelText('To wallet'), { target: { value: 'card' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add transfer' }))

    expect(addTransaction).toHaveBeenCalledWith(expect.objectContaining({
      description: 'Move to card',
      amount: 165000,
      type: 'transfer',
      category: 'Transfer',
      wallet_id: 'cash',
      transfer_wallet_id: 'card',
    }))
  })

  it('creates a recurring installment rule from the transaction form', async () => {
    renderTx()

    fireEvent.click(screen.getByRole('button', { name: 'New transaction' }))
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Laptop cicilan' } })
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '1000' } })
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-05-27' } })
    fireEvent.click(screen.getByLabelText('Recurring / Installment'))
    fireEvent.change(screen.getByLabelText('Recurring frequency'), { target: { value: 'monthly' } })
    fireEvent.change(screen.getByLabelText('Installment count'), { target: { value: '12' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }))

    await waitFor(() => expect(addRecurringRule).toHaveBeenCalledWith(expect.objectContaining({
      description: 'Laptop cicilan',
      original_amount: 1000,
      original_currency: 'TWD',
      frequency: 'monthly',
      start_date: '2026-05-27',
      next_due_date: '2026-06-27',
      installment_total: 12,
      installment_paid: 1,
      active: true,
    })))
  })

  it('asks with an in-app dialog before deleting a transaction', () => {
    renderTx()

    fireEvent.click(screen.getByRole('button', { name: 'Delete Old lunch' }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Delete Old lunch?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(deleteTransaction).toHaveBeenCalledWith('tx-1')
  })

  it('keeps category management out of the transaction form', () => {
    renderTx()

    expect(screen.queryByRole('button', { name: 'Add category option' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Transaction history' })).toBeInTheDocument()
  })

  it('groups history by date and shows note/category/price columns', () => {
    renderTx()

    expect(screen.getByRole('heading', { name: '2 Jun 2026' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '1 Jun 2026' })).toBeInTheDocument()
    expect(screen.getAllByText('Item name').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Note').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Price').length).toBeGreaterThan(0)
  })

  it('uses income categories when adding income and hides recurring and needs review filters', () => {
    renderTx()

    expect(screen.queryByRole('tab', { name: /recurring/i })).not.toBeInTheDocument()
    // Needs review tab is now always visible in the filter bar
    fireEvent.click(screen.getByRole('button', { name: 'New transaction' }))
    fireEvent.click(screen.getByRole('button', { name: 'Income' }))

    expect(screen.getByRole('option', { name: 'Wage' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Food' })).not.toBeInTheDocument()
  })

  it('filters history when an expense category is selected', () => {
    renderTx()

    fireEvent.click(screen.getByRole('button', { name: /Filter by Food/i }))

    expect(screen.getByRole('heading', { name: 'Food' })).toBeInTheDocument()
    expect(screen.getByText('Old lunch')).toBeInTheDocument()
    expect(screen.queryByText('Bus')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Show all transactions/i })).toBeInTheDocument()
  })

  it('keeps the expense category box compact and scrollable', () => {
    renderTx()

    const categoryList = screen.getByTestId('expense-category-list')
    expect(categoryList).toHaveClass('max-h-[220px]')
    expect(screen.getByTestId('expense-category-list')).toHaveClass('overflow-y-auto')
    // category buttons now show the total amount per category alongside the count
    expect(within(categoryList).getByText('Food')).toBeInTheDocument()
  })
})
