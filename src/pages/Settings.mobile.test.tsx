import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { Settings } from './Settings'

const renderSettings = (initialPath = '/settings') =>
  render(<MemoryRouter initialEntries={[initialPath]}><Settings /></MemoryRouter>)

vi.mock('@/hooks/useIsDesktop', () => ({
  useIsDesktop: () => false,
}))

vi.mock('@/lib/queries', () => ({
  useAppSettings: () => ({ data: undefined }),
  useSaveAppSettings: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useBudgetCategories: () => ({ data: [{ id: 'food', name: 'Food', yearly_allocated: 0, budget_period: 'monthly', color: '#FFD276' }] }),
  useAddBudgetCategory: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteBudgetCategory: () => ({ mutate: vi.fn() }),
  useRenameBudgetCategory: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRenameWallet: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateWallet: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useWallets: () => ({ data: [{ id: 'cash', name: 'Cash', type: 'cash', balance: 0, currency: 'TWD', cash_role: 'notes' }] }),
  useBudgetRules: () => ({ data: [] }),
  useInvestmentConfig: () => ({ data: null }),
  useEstimationPlans: () => ({ data: [] }),
  useTransactions: () => ({ data: [] }),
  useAddWallet: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteWallet: () => ({ mutate: vi.fn() }),
  useAddTransaction: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAddBudgetRule: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSaveInvestmentConfig: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpsertEstimationPlan: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAuthSession: () => ({ data: null }),
  useSignIn: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSignUp: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSignOut: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

vi.mock('@/lib/currency', () => ({
  useMoney: () => ({
    baseCurrency: 'TWD',
    displayCurrency: 'TWD',
    ratesDate: null,
    fromBase: (amount: number) => amount,
    toBase: (amount: number) => amount,
    format: (amount: number, currency = 'TWD') => `${currency} ${amount}`,
    formatBase: (amount: number) => `TWD ${amount}`,
    formatDisplay: (amount: number) => `TWD ${amount}`,
    formatRef: () => null,
  }),
}))

describe('Settings mobile behavior', () => {
  it('opens the settings root when no section query is present', () => {
    renderSettings('/settings')

    expect(screen.getByText('Name, currency & account')).toBeInTheDocument()
    expect(screen.getByText('Cash, bank & cards')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Currency' })).not.toBeInTheDocument()
  })

  it('deep-links to a section and returns to the settings menu', () => {
    renderSettings('/settings?section=wallets')

    expect(screen.getByText('Change routing')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))

    expect(screen.getByText('Name, currency & account')).toBeInTheDocument()
    expect(screen.queryByText('Change routing')).not.toBeInTheDocument()
  })

  it('shows mobile AI status instead of API key setup', () => {
    renderSettings('/settings?section=ai')

    expect(screen.getByText('AI status')).toBeInTheDocument()
    expect(screen.queryByLabelText('Gemini API key')).not.toBeInTheDocument()
  })

  it('hides raw backup JSON import on mobile', () => {
    renderSettings('/settings?section=backup')

    expect(screen.getByText(/Raw JSON import is desktop-only/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Backup JSON')).not.toBeInTheDocument()
  })
})
