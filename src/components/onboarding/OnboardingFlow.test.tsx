import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { OnboardingFlow } from './OnboardingFlow'
import { DEFAULT_BUDGET_CATEGORIES } from '@/lib/categories'

const { addWallet, addCategory, addTransaction } = vi.hoisted(() => ({
  addWallet: vi.fn(async () => ({ id: 'w1' })),
  addCategory: vi.fn(async () => ({ id: 'c1' })),
  addTransaction: vi.fn(async () => ({ id: 't1' })),
}))

vi.mock('@/lib/queries', () => ({
  useWallets: () => ({ data: [] }),
  useBudgetCategories: () => ({ data: [] }),
  useAddWallet: () => ({ mutateAsync: addWallet, isPending: false }),
  useAddBudgetCategory: () => ({ mutateAsync: addCategory, isPending: false }),
  useAddTransaction: () => ({ mutateAsync: addTransaction, isPending: false }),
}))

vi.mock('@/lib/currency', () => ({
  useMoney: () => ({
    displayCurrency: 'IDR',
    baseCurrency: 'IDR',
    toBase: (n: number) => n,
    formatDisplay: (n: number) => String(n),
    format: (n: number) => String(n),
    formatRef: (n: number) => String(n),
  }),
}))

describe('OnboardingFlow', () => {
  beforeEach(() => {
    localStorage.clear()
    addWallet.mockClear()
    addCategory.mockClear()
    addTransaction.mockClear()
  })

  it('auto-seeds a default Cash wallet and all starter categories on first run', async () => {
    render(<OnboardingFlow onComplete={vi.fn()} />)

    await waitFor(() => expect(addWallet).toHaveBeenCalledTimes(1))
    expect(addWallet).toHaveBeenCalledWith({
      name: 'Cash',
      type: 'cash',
      currency: 'IDR',
      balance: 0,
      cash_role: 'mixed',
    })

    await waitFor(() => expect(addCategory).toHaveBeenCalledTimes(DEFAULT_BUDGET_CATEGORIES.length))
    for (const c of DEFAULT_BUDGET_CATEGORIES) {
      expect(addCategory).toHaveBeenCalledWith({
        name: c.name,
        yearly_allocated: c.yearly_allocated,
        budget_period: c.budget_period,
        color: c.color,
      })
    }

    expect(await screen.findByText('Everything is ready')).toBeInTheDocument()
    expect(screen.getByText('Cash wallet created')).toBeInTheDocument()
    expect(screen.getByText(`${DEFAULT_BUDGET_CATEGORIES.length} starter categories added`)).toBeInTheDocument()
  })

  it('continues to the first-transaction step after auto-setup', async () => {
    render(<OnboardingFlow onComplete={vi.fn()} />)

    const continueBtn = await screen.findByRole('button', { name: /continue/i })
    fireEvent.click(continueBtn)

    expect(await screen.findByText('Log your first transaction')).toBeInTheDocument()
  })
})
