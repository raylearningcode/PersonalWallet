import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Estimation } from './Estimation'

vi.mock('@/lib/queries', () => ({
  useEstimationPlans: () => ({ data: [] }),
  useUpsertEstimationPlan: () => ({ mutateAsync: vi.fn(), isPending: false }),
useBudgetCategories: () => ({ data: [] }),
useRecurringRules: () => ({ data: [] }),
useGoals: () => ({ data: [] }),
  useAppSettings: () => ({ data: { currency: 'USD', base_currency: 'TWD' } }),
  useTransactions: () => ({ data: [] }),
  useAddGoal: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

vi.mock('@/lib/currency', () => ({
  CURRENCIES: ['USD', 'IDR', 'TWD', 'EUR', 'JPY'],
  useMoney: () => ({
    baseCurrency: 'IDR',
    displayCurrency: 'TWD',
    toBase: (amount: number, currency = 'TWD') => currency === 'TWD' ? amount * 550 : amount,
    fromBase: (amount: number, currency = 'TWD') => currency === 'TWD' ? amount / 550 : amount,
    format: (amount: number, currency: string) => `${currency} ${new Intl.NumberFormat('en-US').format(amount)}`,
    formatBase: (amount: number) => `Rp ${new Intl.NumberFormat('en-US').format(amount)}`,
    formatDisplay: (amount: number) => `NT$${new Intl.NumberFormat('en-US').format(Math.round(amount / 550))}`,
    formatRef: (amount: number) => `TWD ${new Intl.NumberFormat("en-US").format(Math.round(amount / 550))}`,
  }),
  formatCurrency: (amount: number) =>
    `Rp ${new Intl.NumberFormat('en-US').format(amount)}`,
  useExchangeRates: () => ({ data: {} }),
}))

describe('Estimation', () => {
  it('shows the settings display currency as read-only', () => {
    render(<Estimation />)

    expect(screen.getByText('IDR')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Main currency' })).not.toBeInTheDocument()
  })

  it('starts with zero totals and shows monthly and yearly estimates from item periods', () => {
    render(<Estimation />)

    expect(screen.getAllByText('NT$0').length).toBeGreaterThan(0)

    fireEvent.change(screen.getByLabelText('Income source'), { target: { value: 'Scholarship' } })
    fireEvent.change(screen.getByLabelText('Income amount'), { target: { value: '12000' } })
    fireEvent.change(screen.getByLabelText('Income period'), { target: { value: 'monthly' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Add' })[0])
    fireEvent.change(screen.getByLabelText('Expense detail'), { target: { value: 'Rent and bills' } })
    fireEvent.change(screen.getByLabelText('Expense amount'), { target: { value: '24000' } })
    fireEvent.change(screen.getByLabelText('Expense period'), { target: { value: 'yearly' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Add' })[1])

    expect(screen.getAllByText('NT$12,000').length).toBeGreaterThan(0)
    expect(screen.getByText('NT$144,000')).toBeInTheDocument()
    expect(screen.getAllByText('NT$2,000').length).toBeGreaterThan(0)
    expect(screen.getByText('NT$120,000')).toBeInTheDocument()
  })

  it('lets income and expense details be entered as separate line items', () => {
    render(<Estimation />)

    fireEvent.change(screen.getByLabelText('Income source'), { target: { value: 'Part-time work' } })
    fireEvent.change(screen.getByLabelText('Income amount'), { target: { value: '2500' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Add' })[0])

    fireEvent.change(screen.getByLabelText('Expense detail'), { target: { value: 'Apartment rent' } })
    fireEvent.change(screen.getByLabelText('Expense amount'), { target: { value: '1000' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Add' })[1])

    expect(screen.getByText('Part-time work')).toBeInTheDocument()
    expect(screen.getByText('Apartment rent')).toBeInTheDocument()
    expect(screen.getAllByText('NT$2,500').length).toBeGreaterThan(0)
    expect(screen.getAllByText('NT$1,000').length).toBeGreaterThan(0)
    expect(screen.getByText('NT$18,000')).toBeInTheDocument()
  })

  it('adds wishlist items with amount, type, and note', () => {
    render(<Estimation />)

    fireEvent.change(screen.getByLabelText('Wishlist item'), { target: { value: 'MacBook upgrade' } })
    fireEvent.change(screen.getByLabelText('Wishlist amount'), { target: { value: '45000' } })
    fireEvent.change(screen.getByLabelText('Wishlist type'), { target: { value: 'Work' } })
    fireEvent.change(screen.getByLabelText('Wishlist note'), { target: { value: 'For design projects' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add wishlist item' }))

    expect(screen.getByText('MacBook upgrade')).toBeInTheDocument()
    expect(screen.getAllByText('Work').length).toBeGreaterThan(0)
    expect(screen.getByText('For design projects')).toBeInTheDocument()
    expect(screen.getAllByText('NT$45,000').length).toBeGreaterThan(0)
  })

  it('uses a multiline text box for plan notes', () => {
    render(<Estimation />)

    const notes = screen.getByRole('textbox', { name: 'Notes' })
    fireEvent.change(notes, { target: { value: 'Scholarship may move\nCheck rent increase' } })

    expect(notes.tagName).toBe('TEXTAREA')
    expect(notes).toHaveValue('Scholarship may move\nCheck rent increase')
  })
})
