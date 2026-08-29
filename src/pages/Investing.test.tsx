import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Investing } from './Investing'

const saveInvestmentConfig = vi.fn()

// Mutable holders so tests can simulate a reload (config present) and a rate refetch
const { investConfigData, moneyRates, bumpRates } = vi.hoisted(() => {
  const investConfigData: { value: unknown } = { value: undefined }
  const moneyRates: { value: object } = { value: {} }
  return {
    investConfigData,
    moneyRates,
    bumpRates: () => { moneyRates.value = {} },
  }
})

vi.mock('@/lib/queries', () => ({
  useInvestmentConfig: () => ({ data: investConfigData.value }),
  useSaveInvestmentConfig: () => ({ mutateAsync: saveInvestmentConfig, isPending: false }),
  useAppSettings: () => ({ data: undefined }),
  useHoldings: () => ({ data: [] }),
  useAddHolding: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateHolding: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteHolding: () => ({ mutate: vi.fn() }),
  useDividends: () => ({ data: [] }),
  useAddDividend: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteDividend: () => ({ mutate: vi.fn() }),
}))

vi.mock('@/lib/priceFetch', () => ({
  useLivePrices: () => ({ data: new Map(), refetch: vi.fn(), isFetching: false }),
  fetchPrice: vi.fn(),
  fetchPricesForHoldings: vi.fn(),
}))

vi.mock('@/lib/currency', () => ({
  CURRENCIES: ['USD', 'IDR', 'TWD', 'EUR', 'JPY'],
  isKnownCurrency: (code: string) => ['USD', 'IDR', 'TWD', 'EUR', 'JPY'].includes(code),
  useMoney: () => ({
    baseCurrency: 'IDR',
    displayCurrency: 'TWD',
    rates: moneyRates.value,
    toBase: (amount: number, currency: string) => currency === 'TWD' ? amount * 550 : amount,
    fromBase: (amount: number, currency = 'TWD') => currency === 'TWD' ? amount / 550 : amount,
    format: (amount: number, currency: string) =>
      currency === 'IDR'
        ? `Rp ${new Intl.NumberFormat('en-US').format(Math.round(amount / 1_000_000 * 10) / 10)}M`
        : `${currency} ${new Intl.NumberFormat('en-US').format(Math.round(amount))}`,
    formatBase: (amount: number) => `Rp ${new Intl.NumberFormat('en-US').format(Math.round(amount / 1_000_000 * 10) / 10)}M`,
    formatDisplay: (amount: number) => `TWD ${new Intl.NumberFormat('en-US').format(Math.round(amount / 550))}`,
    formatRef: (amount: number) => `TWD ${new Intl.NumberFormat("en-US").format(Math.round(amount / 550))}`,
  }),
  useCurrency: () => (amount: number) =>
    `TWD ${new Intl.NumberFormat('en-US').format(Math.round(amount / 550))}`,
  formatCurrency: (amount: number) =>
    `Rp ${new Intl.NumberFormat('en-US').format(amount)}`,
  useExchangeRates: () => ({ data: {} }),
}))

describe('Investing', () => {
  beforeEach(() => {
    investConfigData.value = undefined
    saveInvestmentConfig.mockClear()
  })

  it('renders simulator tab by default with empty state', () => {
    render(<Investing />)
    // Default tab is simulator
    expect(screen.getByText('Simulator')).toBeInTheDocument()
    expect(screen.getByText('Portfolio')).toBeInTheDocument()
    // The simulator shows the empty state message
    expect(screen.getByText(/No simulation yet/i)).toBeInTheDocument()
  })

  it('fills simulator inputs and sees projected values', () => {
    render(<Investing />)

    fireEvent.change(screen.getByLabelText('Contribution currency'), { target: { value: 'TWD' } })
    fireEvent.change(screen.getByLabelText('Amount per month (TWD)'), { target: { value: '1500000' } })
    fireEvent.change(screen.getByLabelText('Expected return / year'), { target: { value: '7' } })
    fireEvent.change(screen.getByLabelText('Duration (years)'), { target: { value: '7' } })
    fireEvent.change(screen.getByLabelText('Initial capital (IDR)'), { target: { value: '5000000' } })

    // The hero card should show projected portfolio in display currency
    expect(screen.getByText(/Portfolio simulator/i)).toBeInTheDocument()
  })

  it('saves the simulator assumptions', () => {
    render(<Investing />)

    fireEvent.change(screen.getByLabelText('Contribution currency'), { target: { value: 'TWD' } })
    fireEvent.change(screen.getByLabelText('Amount per month (TWD)'), { target: { value: '2000000' } })
    // Target portfolio currency is separate, defaults to IDR in mock
    fireEvent.change(screen.getByLabelText('Target portfolio (IDR)'), { target: { value: '5000000' } })
    fireEvent.change(screen.getByLabelText('Target portfolio currency'), { target: { value: 'TWD' } })
    fireEvent.change(screen.getByLabelText('Expected return / year'), { target: { value: '8' } })
    fireEvent.change(screen.getByLabelText('Duration (years)'), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText('Initial capital (IDR)'), { target: { value: '10000000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(saveInvestmentConfig).toHaveBeenCalledWith(expect.objectContaining({
      monthly_contribution: 1100000000,
      contribution_currency: 'TWD',
      target_portfolio: 2750000000,
      target_currency: 'TWD',
      return_rate: 8,
      duration_years: 10,
      current_value: 10000000,
      allocations: expect.any(Array),
      inflation_rate: 3,
      lump_sum: 0,
    }))
  })

  it('shows target progress and gap when target is set', () => {
    render(<Investing />)

    fireEvent.change(screen.getByLabelText('Contribution currency'), { target: { value: 'TWD' } })
    fireEvent.change(screen.getByLabelText('Amount per month (TWD)'), { target: { value: '1000' } })
    // Target portfolio defaults to IDR currency
    fireEvent.change(screen.getByLabelText('Target portfolio (IDR)'), { target: { value: '100000' } })

    expect(screen.getByText(/Target progress/i)).toBeInTheDocument()
    expect(screen.getByText(/Gap:/i)).toBeInTheDocument()
  })

  it('renders both tabs and opens portfolio when clicked', () => {
    render(<Investing />)

    // Both tabs are present
    expect(screen.getByRole('tab', { name: 'Simulator' })).toBeInTheDocument()
    const portfolioTab = screen.getByRole('tab', { name: 'Portfolio' })
    expect(portfolioTab).toBeInTheDocument()

    // Simulator is active by default
    expect(screen.getByRole('tab', { name: 'Simulator' })).toHaveAttribute('data-state', 'active')

    // Verify simulator content is showing
    expect(screen.getByText(/No simulation yet/i)).toBeInTheDocument()
  })

  it('round-trips a weekly contribution amount and frequency through save and reload', () => {
    const { unmount } = render(<Investing />)

    fireEvent.change(screen.getByLabelText('Contribution frequency'), { target: { value: 'weekly' } })
    fireEvent.change(screen.getByLabelText('Contribution currency'), { target: { value: 'TWD' } })
    fireEvent.change(screen.getByLabelText('Amount per week (TWD)'), { target: { value: '1000' } })
    fireEvent.change(screen.getByLabelText('Expected return / year'), { target: { value: '8' } })
    fireEvent.change(screen.getByLabelText('Duration (years)'), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    // Persisted: monthly-equivalent (1000/week × 52/12) × TWD→IDR conversion + the frequency
    expect(saveInvestmentConfig).toHaveBeenCalledWith(expect.objectContaining({
      monthly_contribution: 1000 * (52 / 12) * 550,
      contribution_frequency: 'weekly',
      contribution_currency: 'TWD',
    }))

    unmount()

    // Reload — hydrate from the saved config: per-period field must be 1000/week again
    investConfigData.value = {
      id: 'cfg-1',
      monthly_contribution: 1000 * (52 / 12) * 550,
      contribution_frequency: 'weekly',
      contribution_currency: 'TWD',
      target_portfolio: 0,
      target_currency: 'IDR',
      return_rate: 8,
      duration_years: 10,
      current_value: 0,
      allocations: [],
      inflation_rate: 3,
      lump_sum: 0,
    }
    render(<Investing />)

    expect(screen.getByLabelText('Amount per week (TWD)')).toHaveValue('1,000')
  })

  it('keeps the in-progress draft when exchange rates refetch', () => {
    const { rerender } = render(<Investing />)

    fireEvent.change(screen.getByLabelText('Amount per month (IDR)'), { target: { value: '250000' } })
    fireEvent.change(screen.getByLabelText('Expected return / year'), { target: { value: '7' } })

    // A refetch produces a new emptySimulator object; the draft must survive it
    bumpRates()
    rerender(<Investing />)

    expect(screen.getByLabelText('Amount per month (IDR)')).toHaveValue('250,000')
    expect(screen.getByLabelText('Expected return / year')).toHaveValue('7')
  })
})
