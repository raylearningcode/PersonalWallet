import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { QuickAddSheet } from './QuickAddSheet'

const mockWallets = [
  { id: 'cash', name: 'Cash', type: 'cash' as const, balance: 0, currency: 'IDR' },
  { id: 'card', name: 'Debit card', type: 'card' as const, balance: 0, currency: 'IDR' },
]

vi.mock('@/lib/queries', () => ({
  useBudgetCategories: () => ({ data: [
    { id: 'food', name: 'Food', yearly_allocated: 1200000, budget_period: 'monthly', color: '#A9F5C7' },
  ] }),
  useWallets: () => ({ data: mockWallets }),
  useTransactions: () => ({ data: [] }),
  useAddTransaction: () => ({ mutateAsync: vi.fn(), isPending: false }),
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

vi.mock('@/lib/gemini', () => ({
  getGeminiKey: () => '',
  scanReceipt: vi.fn(),
}))

describe('QuickAddSheet keypad behavior', () => {
  it('opens the money keypad from the amount field and closes it from confirm', () => {
    render(
      <MemoryRouter>
        <QuickAddSheet open onClose={vi.fn()} />
      </MemoryRouter>
    )

    expect(screen.queryByTestId('money-keypad')).not.toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Amount'))
    expect(screen.getByTestId('money-keypad')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Confirm amount' }))
    expect(screen.queryByTestId('money-keypad')).not.toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Amount'))
    expect(screen.getByTestId('money-keypad')).toBeInTheDocument()

    fireEvent.pointerDown(screen.getByText('Category'))
    expect(screen.queryByTestId('money-keypad')).not.toBeInTheDocument()
  })
})
