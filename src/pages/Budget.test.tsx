import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { Budget } from './Budget'

const addCategory = vi.fn()
const updateCategory = vi.fn()
const deleteCategory = vi.fn()

const mockCategories = [
  {
    id: 'cat-1',
    name: 'Food',
    yearly_allocated: 600000,
    budget_period: 'monthly' as const,
    color: '#A9F5C7',
    spent: 200000,
    group: 'Living',
  },
  {
    id: 'cat-2',
    name: 'Transport',
    yearly_allocated: 300000,
    budget_period: 'monthly' as const,
    color: '#93C5FD',
    spent: 50000,
    group: 'Transport',
  },
]

const mockTransactions = [
  { id: 'tx-1', amount: 200000, category: 'Food', type: 'expense' as const, date: '2026-06-01', wallet_id: 'w1', description: 'Lunch', needs_review: false, transfer_wallet_id: null, original_amount: 200000, original_currency: 'IDR' },
]

vi.mock('@/lib/queries', () => ({
  useBudgetCategories: () => ({ data: mockCategories, isPending: false }),
  useAddBudgetCategory: () => ({ mutateAsync: addCategory, isPending: false }),
  useUpdateBudgetCategory: () => ({ mutateAsync: updateCategory, isPending: false }),
  useDeleteBudgetCategory: () => ({ mutateAsync: deleteCategory, isPending: false }),
  useTransactions: () => ({ data: mockTransactions }),
  useAppSettings: () => ({ data: undefined }),
}))

vi.mock('@/lib/currency', () => ({
  useMoney: () => ({
    baseCurrency: 'IDR',
    displayCurrency: 'IDR',
    formatDisplay: (n: number) => `Rp ${new Intl.NumberFormat('en-US').format(n)}`,
    format: (n: number) => `Rp ${new Intl.NumberFormat('en-US').format(n)}`,
  }),
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const renderBudget = () => render(<MemoryRouter><Budget /></MemoryRouter>)

describe('Budget', () => {
  it('shows existing budget categories', () => {
    renderBudget()
    expect(screen.getAllByText('Food').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Transport').length).toBeGreaterThan(0)
  })

  it('shows view mode toggle (Monthly/Daily/Remaining)', () => {
    renderBudget()
    expect(screen.getByRole('button', { name: 'Monthly' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Daily' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remaining' })).toBeInTheDocument()
  })

  it('switches between view modes', () => {
    renderBudget()
    const dailyBtn = screen.getByRole('button', { name: 'Daily' })
    fireEvent.click(dailyBtn)
    expect(screen.getAllByText('Daily').length).toBeGreaterThan(0)
  })

  it('opens add category form when + button is clicked', () => {
    renderBudget()
    const addBtn = screen.getByRole('button', { name: 'Add budget category' })
    fireEvent.click(addBtn)
    expect(screen.getByLabelText('Category name')).toBeInTheDocument()
  })

  it('category rows are tappable (have button role)', () => {
    renderBudget()
    const foodBtn = screen.getByRole('button', { name: /Open Food budget details/i })
    expect(foodBtn).toBeInTheDocument()
    expect(foodBtn.tagName).toBe('BUTTON')
  })

  it('uses dense desktop allocation rows instead of mobile-only card rows', () => {
    renderBudget()
    const foodBtn = screen.getByRole('button', { name: /Open Food budget details/i })
    expect(foodBtn).toHaveClass('lg:grid')
    expect(foodBtn).toHaveClass('lg:grid-cols-[minmax(160px,1fr)_140px_140px_88px_160px_32px]')
  })
})
