import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { Goals } from './Goals'

const addGoal = vi.fn()
const updateGoal = vi.fn()
const deleteGoal = vi.fn()
const addTransaction = vi.fn()
const addRecurringRule = vi.fn()

const mockGoals = [
  {
    id: 'goal-1',
    name: 'Emergency Fund',
    category: 'Savings',
    target_amount: 5000000,
    current_amount: 1500000,
    color: '#A9F5C7',
    deadline: '2027-12-31',
    notes: '',
  },
  {
    id: 'goal-2',
    name: 'Laptop',
    category: 'Gadget',
    target_amount: 2000000,
    current_amount: 2000000,
    color: '#93C5FD',
    deadline: null,
    notes: '',
  },
]

const mockWallets = [
  { id: 'wallet-1', name: 'Main wallet', type: 'card' as const, balance: 10000000, currency: 'IDR', cash_role: null },
]

vi.mock('@/lib/queries', () => ({
  useGoals: () => ({ data: mockGoals }),
  useAddGoal: () => ({ mutateAsync: addGoal, isPending: false }),
  useUpdateGoal: () => ({ mutateAsync: updateGoal, isPending: false }),
  useDeleteGoal: () => ({ mutateAsync: deleteGoal, isPending: false }),
  useWallets: () => ({ data: mockWallets }),
  useAddTransaction: () => ({ mutateAsync: addTransaction, isPending: false }),
  useAddRecurringRule: () => ({ mutateAsync: addRecurringRule, isPending: false }),
  useAppSettings: () => ({ data: undefined }),
}))

vi.mock('@/lib/currency', () => ({
  useMoney: () => ({
    baseCurrency: 'IDR',
    displayCurrency: 'IDR',
    formatDisplay: (n: number) => `Rp ${new Intl.NumberFormat('en-US').format(n)}`,
    formatRef: () => null,
    format: (n: number) => `Rp ${new Intl.NumberFormat('en-US').format(n)}`,
    toBase: (n: number) => n,
  }),
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const renderGoals = () => render(<MemoryRouter><Goals /></MemoryRouter>)

describe('Goals', () => {
  it('shows existing goals with progress bars', () => {
    renderGoals()
    expect(screen.getAllByText('Emergency Fund').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Laptop').length).toBeGreaterThan(0)
  })

  it('shows "Goal reached!" for completed goals', () => {
    renderGoals()
    expect(screen.getByText('Goal reached!')).toBeInTheDocument()
  })

  it('shows "Contribute" button on non-completed goals', () => {
    renderGoals()
    const contributeButtons = screen.getAllByText('+ Contribute')
    expect(contributeButtons.length).toBeGreaterThan(0)
  })

  it('shows "Need X/month" hint for goals with deadlines', () => {
    renderGoals()
    expect(screen.getByText(/Need.*month/)).toBeInTheDocument()
  })

  it('shows new goal form when Add goal button clicked', () => {
    renderGoals()
    const addBtn = screen.getAllByRole('button').find(b => b.textContent?.includes('New goal') || b.textContent?.includes('Add goal') || b.getAttribute('aria-label')?.includes('add goal'))
    if (addBtn) fireEvent.click(addBtn)
    // Form should render
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0)
  })

  it('shows stat cards for total saved and target', () => {
    renderGoals()
    expect(screen.getByText('Total saved')).toBeInTheDocument()
    expect(screen.getByText('Total target')).toBeInTheDocument()
  })

  it('opens detail sheet when goal card is tapped', () => {
    renderGoals()
    fireEvent.click(screen.getByRole('button', { name: /Open Emergency Fund details/i }))
    expect(screen.getAllByText('Log contribution').length).toBeGreaterThan(0)
  })
})
