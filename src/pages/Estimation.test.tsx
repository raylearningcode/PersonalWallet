import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Estimation } from './Estimation'

vi.mock('@/lib/queries', () => ({
  useEstimationPlans: () => ({ data: [] }),
  useUpsertEstimationPlan: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAppSettings: () => ({ data: undefined }),
}))

vi.mock('@/lib/currency', () => ({
  useCurrency: () => (amount: number) =>
    `Rp ${new Intl.NumberFormat('en-US').format(amount)}`,
  formatCurrency: (amount: number) =>
    `Rp ${new Intl.NumberFormat('en-US').format(amount)}`,
  useExchangeRates: () => ({ data: {} }),
}))

describe('Estimation', () => {
  it('starts with zero totals and recalculates monthly and yearly item totals', () => {
    render(<Estimation />)

    expect(screen.getAllByText('Rp 0').length).toBeGreaterThan(0)

    fireEvent.change(screen.getByLabelText('Income source'), { target: { value: 'Scholarship' } })
    fireEvent.change(screen.getByLabelText('Income amount'), { target: { value: '12000000' } })
    // First 'Add' button is for income
    fireEvent.click(screen.getAllByRole('button', { name: 'Add' })[0])
    fireEvent.change(screen.getByLabelText('Expense detail'), { target: { value: 'Rent and bills' } })
    fireEvent.change(screen.getByLabelText('Expense amount'), { target: { value: '7000000' } })
    // Second 'Add' button is for expenses
    fireEvent.click(screen.getAllByRole('button', { name: 'Add' })[1])

    expect(screen.getAllByText('Rp 12,000,000').length).toBeGreaterThan(0)
    expect(screen.getByText('Rp 5,000,000')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'yearly' }))

    expect(screen.getByText('Rp 144,000,000')).toBeInTheDocument()
    expect(screen.getByText('Rp 60,000,000')).toBeInTheDocument()
  })

  it('lets income and expense details be entered as separate line items', () => {
    render(<Estimation />)

    fireEvent.change(screen.getByLabelText('Income source'), { target: { value: 'Part-time work' } })
    fireEvent.change(screen.getByLabelText('Income amount'), { target: { value: '2500000' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Add' })[0])

    fireEvent.change(screen.getByLabelText('Expense detail'), { target: { value: 'Apartment rent' } })
    fireEvent.change(screen.getByLabelText('Expense amount'), { target: { value: '1000000' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Add' })[1])

    expect(screen.getByText('Part-time work')).toBeInTheDocument()
    expect(screen.getByText('Apartment rent')).toBeInTheDocument()
    expect(screen.getAllByText('Rp 2,500,000').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Rp 1,000,000').length).toBeGreaterThan(0)
    expect(screen.getByText('Rp 1,500,000')).toBeInTheDocument()
  })
})
