import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { Subscriptions } from './Subscriptions'

const updateRule = vi.fn()
const deleteRule = vi.fn()
const addRule = vi.fn()
const addTransaction = vi.fn()

const mockRules = [
  {
    id: 'rule-1',
    description: 'Netflix',
    amount: 154000,
    original_amount: 154000,
    original_currency: 'IDR',
    type: 'expense' as const,
    frequency: 'monthly' as const,
    category: 'Streaming',
    next_due_date: '2026-06-15',
    active: true,
    wallet_id: 'wallet-1',
    installment_total: null,
    installment_paid: null,
    start_date: '2026-01-15',
    recurring_rule_id: null,
    linked_transaction_id: null,
  },
  {
    id: 'rule-2',
    description: 'Gym membership',
    amount: 250000,
    original_amount: 250000,
    original_currency: 'IDR',
    type: 'expense' as const,
    frequency: 'monthly' as const,
    category: 'Health',
    next_due_date: '2026-06-20',
    active: false,
    wallet_id: 'wallet-1',
    installment_total: null,
    installment_paid: null,
    start_date: '2026-01-20',
    recurring_rule_id: null,
    linked_transaction_id: null,
  },
]

vi.mock('@/lib/queries', () => ({
  useRecurringRules: () => ({ data: mockRules }),
  useAddRecurringRule: () => ({ mutateAsync: addRule, isPending: false }),
  useUpdateRecurringRule: () => ({ mutateAsync: updateRule, isPending: false }),
  useDeleteRecurringRule: () => ({ mutateAsync: deleteRule, isPending: false }),
  useAddTransaction: () => ({ mutateAsync: addTransaction, isPending: false }),
  useTransactions: () => ({ data: [] }),
  useWallets: () => ({ data: [{ id: 'wallet-1', name: 'Main', type: 'card' as const, balance: 0, currency: 'IDR' }] }),
  useBudgetCategories: () => ({ data: [] }),
  useAppSettings: () => ({ data: undefined }),
}))

vi.mock('@/lib/currency', () => ({
  CURRENCIES: ['IDR', 'TWD', 'USD'],
  useMoney: () => ({
    baseCurrency: 'IDR',
    displayCurrency: 'IDR',
    toBase: (n: number) => n,
    formatDisplay: (n: number) => `Rp ${new Intl.NumberFormat('en-US').format(n)}`,
    formatRef: () => null,
    format: (n: number) => `Rp ${new Intl.NumberFormat('en-US').format(n)}`,
  }),
  txAmountColor: () => 'text-foreground',
  txAmountSign: () => '-',
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const renderSubs = () => render(<MemoryRouter><Subscriptions /></MemoryRouter>)

describe('Subscriptions', () => {
  it('shows recurring rules in the expenses section', () => {
    renderSubs()
    expect(screen.getAllByText('Netflix').length).toBeGreaterThan(0)
  })

  it('shows paused badge on inactive rules', () => {
    renderSubs()
    expect(screen.getAllByText('Paused').length).toBeGreaterThan(0)
  })

  it('shows stat cards for monthly cost and net monthly', () => {
    renderSubs()
    expect(screen.getByText('Monthly cost')).toBeInTheDocument()
    expect(screen.getByText('Net monthly')).toBeInTheDocument()
  })

  it('shows 3-month outlook section', () => {
    renderSubs()
    expect(screen.getByText('3-month outlook')).toBeInTheDocument()
  })

  it('opens add subscription form when button is clicked', () => {
    renderSubs()
    // Find the header "Add subscription" button (not the empty state ones)
    const addBtns = screen.getAllByRole('button').filter(b => b.textContent?.includes('Add subscription'))
    expect(addBtns.length).toBeGreaterThan(0)
    fireEvent.click(addBtns[0])
    expect(screen.getByText('New subscription')).toBeInTheDocument()
  })

  it('shows filter tabs for all/active/paused/due-soon', () => {
    renderSubs()
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Active' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Paused' })).toBeInTheDocument()
  })

  it('opens rule detail sheet when Netflix rule row is tapped', () => {
    renderSubs()
    // Find the rule row button containing "Netflix"
    const ruleButtons = screen.getAllByRole('button').filter(b => b.textContent?.includes('Netflix') && b.textContent?.includes('monthly'))
    expect(ruleButtons.length).toBeGreaterThan(0)
    fireEvent.click(ruleButtons[0])
    // Detail sheet should open - Netflix appears more times
    expect(screen.getAllByText('Netflix').length).toBeGreaterThan(1)
  })

  it('saves changes from the detail sheet', () => {
    renderSubs()
    const ruleButtons = screen.getAllByRole('button').filter(b => b.textContent?.includes('Netflix') && b.textContent?.includes('monthly'))
    fireEvent.click(ruleButtons[0])
    // Save button in the detail sheet updates the rule
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(updateRule).toHaveBeenCalledWith(expect.objectContaining({ id: 'rule-1', description: 'Netflix' }))
  })

  it('does not render the inline edit form after logging payment from the detail sheet', () => {
    renderSubs()
    const ruleButtons = screen.getAllByRole('button').filter(b => b.textContent?.includes('Netflix') && b.textContent?.includes('monthly'))
    fireEvent.click(ruleButtons[0])
    // "Log payment now" closes the sheet programmatically
    fireEvent.click(screen.getByRole('button', { name: 'Log payment now' }))
    // Edit state must be cleared so the inline "Edit subscription" form stays hidden
    expect(screen.queryByText('Edit subscription')).not.toBeInTheDocument()
  })

  it('does not render the inline edit form after delete-cancel closes the detail sheet', () => {
    renderSubs()
    const ruleButtons = screen.getAllByRole('button').filter(b => b.textContent?.includes('Netflix') && b.textContent?.includes('monthly'))
    fireEvent.click(ruleButtons[0])
    // Delete button in the sheet closes the sheet and opens the confirm dialog
    fireEvent.click(screen.getByRole('button', { name: 'Delete subscription' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    // Edit state must be cleared so the inline "Edit subscription" form stays hidden
    expect(screen.queryByText('Edit subscription')).not.toBeInTheDocument()
  })
})
