import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AddTransaction } from './AddTransaction'

const mockWallets = [
  { id: 'cash', name: 'Cash', type: 'cash' as const, balance: 0, currency: 'IDR' },
  { id: 'card', name: 'Debit card', type: 'card' as const, balance: 0, currency: 'IDR' },
]

const { mockAddTransactionMutate, mockToastError, mockToastSuccess } = vi.hoisted(() => ({
  mockAddTransactionMutate: vi.fn(),
  mockToastError: vi.fn(),
  mockToastSuccess: vi.fn(),
}))

vi.mock('@/lib/queries', () => ({
  useBudgetCategories: () => ({ data: [
    { id: 'food', name: 'Food', yearly_allocated: 1200000, budget_period: 'monthly', color: '#A9F5C7' },
  ] }),
  useWallets: () => ({ data: mockWallets }),
  useTransactions: () => ({ data: [] }),
  useAddTransaction: () => ({ mutateAsync: mockAddTransactionMutate, isPending: false }),
  useUpdateTransaction: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteTransaction: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAddRecurringRule: () => ({ mutateAsync: vi.fn(), isPending: false }),
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
  }),
}))

vi.mock('@/lib/ai', () => ({
  isAiConfigured: () => false,
  scanReceipt: vi.fn(),
}))

vi.mock('@/hooks/useIsDesktop', () => ({
  useIsDesktop: () => false,
}))

vi.mock('sonner', () => ({ toast: { success: mockToastSuccess, error: mockToastError } }))

beforeEach(() => {
  mockAddTransactionMutate.mockClear()
  mockToastError.mockClear()
  mockToastSuccess.mockClear()
  mockAddTransactionMutate.mockResolvedValue({ id: 'tx1' })
})

function renderPage() {
  return render(
    <MemoryRouter>
      <AddTransaction />
    </MemoryRouter>
  )
}

describe('AddTransaction validation', () => {
  it('blocks cash-mode saving when no tendered amount is given', () => {
    renderPage()
    fireEvent.click(screen.getByRole('switch', { name: 'Enable cash change tracking' }))
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '100' } })

    fireEvent.click(screen.getByRole('button', { name: 'Save transaction' }))

    expect(mockToastError).toHaveBeenCalledWith('Enter the cash amount given')
    expect(mockAddTransactionMutate).not.toHaveBeenCalled()
  })

  it('blocks saving when cash given is less than the expense amount', () => {
    renderPage()
    fireEvent.click(screen.getByRole('switch', { name: 'Enable cash change tracking' }))
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '100' } })
    fireEvent.change(screen.getByLabelText('Cash given'), { target: { value: '50' } })

    fireEvent.click(screen.getByRole('button', { name: 'Save transaction' }))

    expect(mockToastError).toHaveBeenCalledWith('Cash given must be at least the expense amount')
    expect(mockAddTransactionMutate).not.toHaveBeenCalled()
  })

  it('routes cash change through a second transfer and links it to the main transaction', async () => {
    renderPage()
    fireEvent.change(screen.getByLabelText('Input currency'), { target: { value: 'IDR' } })
    fireEvent.click(screen.getByRole('switch', { name: 'Enable cash change tracking' }))
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '100' } })
    fireEvent.change(screen.getByLabelText('Cash given'), { target: { value: '200' } })

    fireEvent.click(screen.getByRole('button', { name: 'Save transaction' }))

    await waitFor(() => expect(mockAddTransactionMutate).toHaveBeenCalledTimes(2))
    expect(mockAddTransactionMutate.mock.calls[1][0]).toMatchObject({
      type: 'transfer',
      category: 'Transfer',
      transfer_wallet_id: 'card',
      linked_transaction_id: 'tx1',
      is_system_generated: true,
    })
    expect(mockToastSuccess.mock.calls[0][0]).toBe('Cash payment saved · change routed')
  })
})
