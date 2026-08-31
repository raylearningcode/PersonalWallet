import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { OnboardingFlow } from './OnboardingFlow'
import { DEFAULT_BUDGET_CATEGORIES } from '@/lib/categories'

const { addWallet, addCategory, addTransaction, saveSettings, updateWallet } = vi.hoisted(() => ({
  addWallet: vi.fn(async () => ({ id: 'w1' })),
  addCategory: vi.fn(async () => ({ id: 'c1' })),
  addTransaction: vi.fn(async () => ({ id: 't1' })),
  saveSettings: vi.fn(async () => ({})),
  updateWallet: vi.fn(async () => ({ id: 'w1' })),
}))

const state = vi.hoisted(() => ({ wallets: [] as { id: string; name: string; type: string }[] }))

vi.mock('@/lib/queries', () => ({
  useWallets: () => ({ data: state.wallets }),
useTransactions: () => ({ data: [] }),
useRecurringRules: () => ({ data: [] }),

  useGoals: () => ({ data: [] }),
  useBudgetCategories: () => ({ data: [] }),
  useAddWallet: () => ({ mutateAsync: addWallet, isPending: false }),
  useAddBudgetCategory: () => ({ mutateAsync: addCategory, isPending: false }),
  useAddTransaction: () => ({ mutateAsync: addTransaction, isPending: false }),
  useSaveAppSettings: () => ({ mutateAsync: saveSettings, isPending: false }),
  useUpdateWallet: () => ({ mutateAsync: updateWallet, isPending: false }),
}))

vi.mock('@/hooks/useIsDesktop', () => ({
  useIsDesktop: () => true,
}))

vi.mock('@/lib/currency', () => ({
  CURRENCIES: ['USD', 'IDR', 'TWD', 'EUR', 'JPY'],
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
    state.wallets = []
    addWallet.mockClear()
    addCategory.mockClear()
    addTransaction.mockClear()
  })

  it('shows the welcome screen first, with branding and skip', () => {
    const onComplete = vi.fn()
    render(<OnboardingFlow onComplete={onComplete} />)

    expect(screen.getByText('Welcome to FinPath')).toBeInTheDocument()
    expect(screen.getByText('Log in seconds')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Skip for now'))
    expect(localStorage.getItem('finpath_onboarding_complete')).toBe('1')
    expect(onComplete).toHaveBeenCalled()
  })

  it('auto-seeds a default Cash wallet and all starter categories after Get started', async () => {
    render(<OnboardingFlow onComplete={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /get started/i }))

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
        icon: c.icon,
      })
    }

    expect(await screen.findByText('Everything is ready')).toBeInTheDocument()
    expect(screen.getByText('Cash wallet created')).toBeInTheDocument()
    expect(screen.getByText(`${DEFAULT_BUDGET_CATEGORIES.length} starter categories added`)).toBeInTheDocument()
  })

  it('continues to the first-transaction step after auto-setup', async () => {
    render(<OnboardingFlow onComplete={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /get started/i }))
    const continueBtn = await screen.findByRole('button', { name: /continue/i })
    fireEvent.click(continueBtn)

    expect(await screen.findByText('Log your first transaction')).toBeInTheDocument()
  })

  it('finish screen shows the feature tour and completes onboarding', async () => {
    // The seeded wallet appears (simulates the query refetch after seeding).
    state.wallets = [{ id: 'w1', name: 'Cash', type: 'cash' }]
    const onComplete = vi.fn()
    render(<OnboardingFlow onComplete={onComplete} />)

    fireEvent.click(screen.getByRole('button', { name: /get started/i }))
    fireEvent.click(await screen.findByRole('button', { name: /continue/i }))
    fireEvent.change(await screen.findByLabelText('Transaction amount'), { target: { value: '50000' } })
    fireEvent.click(screen.getByRole('button', { name: /log it/i }))

    expect(await screen.findByText("You're all set!")).toBeInTheDocument()
    expect(screen.getByText('Quick add')).toBeInTheDocument()
    expect(screen.getByText('Balancing budget')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /start using finpath/i }))
    expect(onComplete).toHaveBeenCalled()
  })
})
