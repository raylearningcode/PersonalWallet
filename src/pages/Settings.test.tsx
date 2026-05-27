import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Settings } from './Settings'

const saveSettings = vi.fn()
const signIn = vi.fn()
const signUp = vi.fn()
const addCategory = vi.fn()
const deleteCategory = vi.fn()
const addWallet = vi.fn()
const deleteWallet = vi.fn()

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
  useWallets: () => ({ data: [{ id: 'cash', name: 'Cash', type: 'cash', balance: 0, currency: 'IDR' }] }),
  useTransactions: () => ({ data: [
    { id: 'tx-1', description: 'Salary', amount: 2200000, original_amount: 4000, original_currency: 'TWD', type: 'income', category: 'Wage', wallet_id: 'cash', transfer_wallet_id: null, date: '2026-05-20', needs_review: false },
    { id: 'tx-2', description: 'Food', amount: 550000, original_amount: 1000, original_currency: 'TWD', type: 'expense', category: 'Food', wallet_id: 'cash', transfer_wallet_id: null, date: '2026-05-21', needs_review: false },
  ] }),
  useAddWallet: () => ({ mutateAsync: addWallet, isPending: false }),
  useDeleteWallet: () => ({ mutate: deleteWallet }),
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
  }),
}))

describe('Settings', () => {
  it('restores missing starter categories without duplicating existing ones', async () => {
    render(<Settings />)

    fireEvent.click(screen.getByRole('button', { name: 'Restore starter categories' }))

    await waitFor(() => expect(addCategory).toHaveBeenCalledWith(expect.objectContaining({ name: 'Housing' })))
    await waitFor(() => expect(addCategory).toHaveBeenCalledWith(expect.objectContaining({ name: 'Food' })))
    expect(addCategory).not.toHaveBeenCalledWith(expect.objectContaining({ name: 'Income' }))
  })

  it('asks for confirmation before deleting a category', () => {
    render(<Settings />)

    fireEvent.click(screen.getByRole('button', { name: 'Delete Income category' }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Delete Income category?')).toBeInTheDocument()
    expect(deleteCategory).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(deleteCategory).toHaveBeenCalledWith('income')
  })

  it('saves a selected currency without unused preference fields', () => {
    render(<Settings />)

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
    render(<Settings />)

    fireEvent.change(screen.getByLabelText('Auth email'), { target: { value: 'ray@example.com' } })
    fireEvent.change(screen.getByLabelText('Auth password'), { target: { value: 'secret123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }))

    expect(signIn).toHaveBeenCalledWith({ email: 'ray@example.com', password: 'secret123' })
    expect(signUp).toHaveBeenCalledWith({ email: 'ray@example.com', password: 'secret123' })
  })

  it('adds wallet and card options', () => {
    render(<Settings />)

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

  it('shows live wallet money from transactions', () => {
    render(<Settings />)

    expect(screen.getByText('Wallet balance')).toBeInTheDocument()
    expect(screen.getByText('Rp 1,650,000')).toBeInTheDocument()
  })

  it('saves the yearly goal from settings', () => {
    render(<Settings />)

    fireEvent.change(screen.getByLabelText('Yearly goal label'), { target: { value: '$20k net worth' } })
    fireEvent.change(screen.getByLabelText('Yearly goal progress'), { target: { value: '68' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save yearly goal' }))

    expect(saveSettings).toHaveBeenCalledWith(expect.objectContaining({
      annual_goal_label: '$20k net worth',
      annual_goal_pct: 68,
    }))
  })
})
