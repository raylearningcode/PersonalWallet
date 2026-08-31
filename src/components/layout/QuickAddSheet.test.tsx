import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QuickAddSheet } from './QuickAddSheet'

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
    { id: 'transport', name: 'Transport', yearly_allocated: 600000, budget_period: 'monthly', color: '#FFCF73' },
  ] }),
  useWallets: () => ({ data: mockWallets }),
  useTransactions: () => ({ data: [] }),
  useAddTransaction: () => ({ mutateAsync: mockAddTransactionMutate, isPending: false }),
  useUpdateTransaction: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteTransaction: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAddRecurringRule: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useGoals: () => ({ data: [] }),
useRecurringRules: () => ({ data: [] }),

  useMarkReviewed: () => ({ mutateAsync: vi.fn(), isPending: false }),
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

vi.mock('@/lib/camera', () => ({
  takePhotoWithCamera: vi.fn(async () => null),
  isNativeCameraAvailable: vi.fn(async () => false),
  pickPhotoFromLibrary: vi.fn(),
}))

vi.mock('sonner', () => ({ toast: { success: mockToastSuccess, error: mockToastError } }))

beforeEach(() => {
  mockAddTransactionMutate.mockClear()
  mockToastError.mockClear()
  mockToastSuccess.mockClear()
})

function renderSheet() {
  return render(
    <MemoryRouter>
      <QuickAddSheet open onClose={vi.fn()} />
    </MemoryRouter>
  )
}

describe('QuickAddSheet keypad behavior', () => {
  it('opens the money keypad from the amount field and closes it from confirm', () => {
    renderSheet()

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

describe('QuickAddSheet validation', () => {
  it('blocks saving when split is enabled but portion amounts are empty', () => {
    renderSheet()
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '100' } })
    fireEvent.click(screen.getByRole('button', { name: 'Advanced details' }))
    fireEvent.click(screen.getByRole('switch', { name: 'Split across categories' }))

    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }))

    expect(mockToastError).toHaveBeenCalledWith('Enter at least 2 portion amounts')
    expect(mockAddTransactionMutate).not.toHaveBeenCalled()
  })

  it('blocks saving when split portions sum short of the total', () => {
    renderSheet()
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '100' } })
    fireEvent.click(screen.getByRole('button', { name: 'Advanced details' }))
    fireEvent.click(screen.getByRole('switch', { name: 'Split across categories' }))
    fireEvent.change(screen.getByLabelText('Portion 1 amount'), { target: { value: '30' } })
    fireEvent.change(screen.getByLabelText('Portion 2 amount'), { target: { value: '40' } })

    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }))

    expect(mockToastError).toHaveBeenCalledWith('portion amounts are TWD 30 short of the total')
    expect(mockAddTransactionMutate).not.toHaveBeenCalled()
  })

  it('blocks cash-mode saving when no tendered amount is given', () => {
    renderSheet()
    fireEvent.click(screen.getByRole('button', { name: 'Cash' }))
    fireEvent.click(screen.getByRole('switch', { name: 'Enable cash change tracking' }))
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '100' } })

    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }))

    expect(mockToastError).toHaveBeenCalledWith('Enter the cash amount given')
    expect(mockAddTransactionMutate).not.toHaveBeenCalled()
  })
})
