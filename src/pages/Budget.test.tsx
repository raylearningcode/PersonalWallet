import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { Budget } from './Budget'

const addCategory = vi.fn()
const updateCategory = vi.fn()
const deleteCategory = vi.fn()

let mockCategories = [
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

let mockTransactions = [
  { id: 'tx-1', amount: 200000, category: 'Food', type: 'expense' as const, date: '2026-06-01', wallet_id: 'w1', description: 'Lunch', needs_review: false, transfer_wallet_id: null, original_amount: 200000, original_currency: 'IDR' },
]

vi.mock('@/lib/queries', () => ({
  useBudgetCategories: () => ({ data: mockCategories, isPending: false }),
  useAddBudgetCategory: () => ({ mutateAsync: addCategory, isPending: false }),
  useUpdateBudgetCategory: () => ({ mutateAsync: updateCategory, isPending: false }),
  useDeleteBudgetCategory: () => ({ mutateAsync: deleteCategory, isPending: false }),
  useTransactions: () => ({ data: mockTransactions }),useRecurringRules: () => ({ data: [] }),
useGoals: () => ({ data: [] }),

  useAppSettings: () => ({ data: undefined }),
}))

vi.mock('@/lib/currency', () => ({
  useMoney: () => ({
    baseCurrency: 'IDR',
    displayCurrency: 'IDR',
    formatDisplay: (n: number) => `Rp ${new Intl.NumberFormat('en-US').format(n)}`,
    formatRef: () => null,
    format: (n: number) => `Rp ${new Intl.NumberFormat('en-US').format(n)}`,
    fromBase: (n: number) => n,
    toBase: (n: number) => n,
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
    expect(screen.getAllByText('Daily left').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'Remaining' }))
    expect(screen.getAllByText('Remaining').length).toBeGreaterThan(0)
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
    expect(foodBtn).toHaveClass('lg:grid-cols-[minmax(160px,1.2fr)_130px_130px_150px_140px_32px]')
  })

  it('opens budget editing in a compact desktop side panel', () => {
    renderBudget()
    fireEvent.click(screen.getByRole('button', { name: /Open Food budget details/i }))

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveClass('inset-y-0')
    expect(dialog).toHaveClass('right-0')
    expect(dialog).toHaveClass('max-w-xl')
    expect(dialog).not.toHaveClass('inset-x-0')
  })

  it('shows Unassigned spending when a transaction uses an unknown category', () => {
    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    mockCategories = [
      { id: 'cat-1', name: 'Food', yearly_allocated: 600000, budget_period: 'monthly' as const, color: '#A9F5C7', spent: 200000, group: 'Living' },
    ]
    mockTransactions = [
      { id: 'tx-other', amount: 150000, category: 'Other', type: 'expense' as const, date: `${currentMonth}-01`, wallet_id: 'w1', description: 'Mystery purchase', needs_review: false, transfer_wallet_id: null, original_amount: 150000, original_currency: 'IDR' },
    ]
    renderBudget()
    expect(screen.getByText(/Unassigned spending/)).toBeInTheDocument()
  })

  it('shows a single Balancing row with combined spent when the category exists', () => {
    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    mockCategories = [
      { id: 'cat-1', name: 'Food', yearly_allocated: 600000, budget_period: 'monthly' as const, color: '#A9F5C7', spent: 200000, group: 'Living' },
      { id: 'cat-bal', name: 'Balancing', yearly_allocated: 0, budget_period: 'monthly' as const, color: '#64748B', spent: 0, group: 'Other' },
    ]
    mockTransactions = [
      { id: 'tx-other', amount: 150000, category: 'Other', type: 'expense' as const, date: `${currentMonth}-01`, wallet_id: 'w1', description: 'Mystery purchase', needs_review: false, transfer_wallet_id: null, original_amount: 150000, original_currency: 'IDR' },
    ]
    renderBudget()
    expect(screen.getAllByText('Balancing')).toHaveLength(1)
    expect(screen.getByText('Includes unknown & unallocated')).toBeInTheDocument()
    expect(screen.getByText('Rp 150,000')).toBeInTheDocument()
    expect(screen.queryByText(/Unassigned spending/)).not.toBeInTheDocument()
  })
})
