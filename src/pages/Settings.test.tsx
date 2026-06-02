import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { Settings } from './Settings'

const renderSettings = (initialPath = '/settings') =>
  render(<MemoryRouter initialEntries={[initialPath]}><Settings /></MemoryRouter>)

const saveSettings = vi.fn()
const signIn = vi.fn()
const signUp = vi.fn()
const addCategory = vi.fn()
const deleteCategory = vi.fn()
const addWallet = vi.fn()
const deleteWallet = vi.fn()
const addTransaction = vi.fn()
const addBudgetRule = vi.fn()
const saveInvestmentConfig = vi.fn()
const upsertEstimationPlan = vi.fn()

vi.mock('@/lib/queries', () => ({
  useAppSettings: () => ({ data: undefined }),
  useSaveAppSettings: () => ({ mutateAsync: saveSettings, isPending: false }),
  useBudgetCategories: () => ({
    data: [
      { id: 'income', name: 'Income', yearly_allocated: 0, budget_period: 'monthly', color: '#64748B' },
      { id: 'investing', name: 'Investing', yearly_allocated: 0, budget_period: 'monthly', color: '#8B5CF6' },
    ],
  }),
  useAddBudgetCategory: () => ({ mutateAsync: addCategory, isPending: false }),
  useDeleteBudgetCategory: () => ({ mutate: deleteCategory }),
  useRenameBudgetCategory: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRenameWallet: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateWallet: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useWallets: () => ({ data: [{ id: 'cash', name: 'Cash', type: 'cash', balance: 0, currency: 'IDR' }] }),
  useBudgetRules: () => ({ data: [] }),
  useInvestmentConfig: () => ({ data: null }),
  useEstimationPlans: () => ({ data: [] }),
  useTransactions: () => ({ data: [
    { id: 'tx-1', description: 'Salary', amount: 2200000, original_amount: 4000, original_currency: 'TWD', type: 'income', category: 'Wage', wallet_id: 'cash', transfer_wallet_id: null, date: '2026-05-20', needs_review: false },
    { id: 'tx-2', description: 'Food', amount: 550000, original_amount: 1000, original_currency: 'TWD', type: 'expense', category: 'Food', wallet_id: 'cash', transfer_wallet_id: null, date: '2026-05-21', needs_review: false },
  ] }),
  useAddWallet: () => ({ mutateAsync: addWallet, isPending: false }),
  useDeleteWallet: () => ({ mutate: deleteWallet }),
  useAddTransaction: () => ({ mutateAsync: addTransaction, isPending: false }),
  useAddBudgetRule: () => ({ mutateAsync: addBudgetRule, isPending: false }),
  useSaveInvestmentConfig: () => ({ mutateAsync: saveInvestmentConfig, isPending: false }),
  useUpsertEstimationPlan: () => ({ mutateAsync: upsertEstimationPlan, isPending: false }),
  useAuthSession: () => ({ data: null }),
  useSignIn: () => ({ mutateAsync: signIn, isPending: false }),
  useSignUp: () => ({ mutateAsync: signUp, isPending: false }),
  useSignOut: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

vi.mock('@/lib/currency', () => ({
  useMoney: () => ({
    baseCurrency: 'IDR',
    displayCurrency: 'IDR',
    formatBase: (amount: number) => `Rp ${new Intl.NumberFormat('en-US').format(amount)}`,
    formatDisplay: (amount: number) => `Rp ${new Intl.NumberFormat('en-US').format(amount)}`,
  }),
}))

describe('Settings', () => {
  it('restores missing starter categories without duplicating existing ones', async () => {
    renderSettings()

    fireEvent.click(screen.getByRole('button', { name: 'Categories' }))
    fireEvent.click(screen.getByRole('button', { name: 'Restore starter categories' }))

    await waitFor(() => expect(addCategory).toHaveBeenCalledWith(expect.objectContaining({ name: 'Housing' })))
    await waitFor(() => expect(addCategory).toHaveBeenCalledWith(expect.objectContaining({ name: 'Food' })))
    expect(addCategory).not.toHaveBeenCalledWith(expect.objectContaining({ name: 'Income' }))
  })

  it('asks for confirmation before deleting a category', () => {
    renderSettings()

    fireEvent.click(screen.getByRole('button', { name: 'Categories' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete Income category' }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Delete Income category?')).toBeInTheDocument()
    expect(deleteCategory).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(deleteCategory).toHaveBeenCalledWith('income')
  })

  it('saves a selected currency without unused preference fields', () => {
    renderSettings()

    fireEvent.click(screen.getByRole('combobox', { name: 'Display currency' }))
    fireEvent.click(screen.getByRole('option', { name: 'TWD' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save currency' }))

    expect(saveSettings).toHaveBeenCalledWith(expect.objectContaining({
      base_currency: 'IDR',
      currency: 'TWD',
    }))
    expect(screen.queryByText('Year start')).not.toBeInTheDocument()
    expect(screen.queryByText('Default view')).not.toBeInTheDocument()
    expect(screen.queryByText('Notifications')).not.toBeInTheDocument()
  })

  it('provides email login and signup actions', () => {
    renderSettings()

    fireEvent.change(screen.getByLabelText('Auth email'), { target: { value: 'ray@example.com' } })
    fireEvent.change(screen.getByLabelText('Auth password'), { target: { value: 'secret123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }))

    expect(signIn).toHaveBeenCalledWith({ email: 'ray@example.com', password: 'secret123' })
    expect(signUp).toHaveBeenCalledWith({ email: 'ray@example.com', password: 'secret123' })
  })

  it('adds wallet and card options', () => {
    renderSettings()

    fireEvent.click(screen.getByRole('button', { name: 'Wallets' }))
    fireEvent.change(screen.getByLabelText('Wallet name'), { target: { value: 'Taiwan card' } })
    fireEvent.change(screen.getByLabelText('Wallet type'), { target: { value: 'card' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add wallet' }))

    expect(addWallet).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Taiwan card',
      type: 'card',
      currency: 'IDR',
    }))
    expect(screen.getAllByText('Cash').length).toBeGreaterThan(0)
  })

  it('shows live wallet balance from transactions', () => {
    renderSettings()

    fireEvent.click(screen.getByRole('button', { name: 'Wallets' }))
    expect(screen.getByText('Rp 1,650,000')).toBeInTheDocument()
  })
})
