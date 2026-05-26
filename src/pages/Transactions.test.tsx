import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Transactions } from './Transactions'

const addTransaction = vi.fn()

vi.mock('@/lib/queries', () => ({
  useTransactions: () => ({ data: [] }),
  useDeleteTransaction: () => ({ mutate: vi.fn() }),
  useMarkReviewed: () => ({ mutate: vi.fn() }),
  useAddTransaction: () => ({ mutateAsync: addTransaction, isPending: false }),
  useBudgetCategories: () => ({ data: [{ id: 'food', name: 'Food', yearly_allocated: 0, color: '#A9F5C7' }] }),
  useAppSettings: () => ({ data: undefined }),
}))

vi.mock('@/lib/currency', () => ({
  useCurrency: () => (amount: number) =>
    `Rp ${new Intl.NumberFormat('en-US').format(amount)}`,
  formatCurrency: (amount: number) =>
    `Rp ${new Intl.NumberFormat('en-US').format(amount)}`,
  useExchangeRates: () => ({ data: {} }),
}))

describe('Transactions', () => {
  it('adds a transaction from the input form', () => {
    render(<Transactions />)

    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Lunch' } })
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '120000' } })
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Food' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add transaction' }))

    expect(addTransaction).toHaveBeenCalledWith(expect.objectContaining({
      description: 'Lunch',
      amount: 120000,
      category: 'Food',
      type: 'expense',
      needs_review: false,
    }))
  })
})
