import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Investing } from './Investing'

const saveInvestmentConfig = vi.fn()

vi.mock('@/lib/queries', () => ({
  useInvestmentConfig: () => ({ data: undefined }),
  useSaveInvestmentConfig: () => ({ mutateAsync: saveInvestmentConfig, isPending: false }),
  useAppSettings: () => ({ data: undefined }),
}))

vi.mock('@/lib/currency', () => ({
  CURRENCIES: ['USD', 'IDR', 'TWD', 'EUR', 'JPY'],
  useMoney: () => ({
    baseCurrency: 'IDR',
    displayCurrency: 'TWD',
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
  it('starts empty and updates the ROI simulation from user input', () => {
    render(<Investing />)

    expect(screen.getByText(/Estimated in 10 years/i)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Contribution currency'), { target: { value: 'TWD' } })
    fireEvent.change(screen.getByLabelText('Monthly contribution'), { target: { value: '1500000' } })
    fireEvent.change(screen.getByLabelText('Expected return / year'), { target: { value: '7%' } })
    fireEvent.change(screen.getByLabelText('Duration (years)'), { target: { value: '7' } })
    fireEvent.change(screen.getByLabelText('Initial capital'), { target: { value: '5000000' } })
    expect(screen.getByText(/Estimated in 7 years/i)).toBeInTheDocument()
    expect(screen.getByText(/Projected in TWD/i)).toBeInTheDocument()
    expect(screen.getAllByText(/Base value/i).length).toBeGreaterThan(0)
  })

  it('saves the simulator assumptions for future sessions', () => {
    render(<Investing />)

    fireEvent.change(screen.getByLabelText('Contribution currency'), { target: { value: 'TWD' } })
    fireEvent.change(screen.getByLabelText('Monthly contribution'), { target: { value: '2000000' } })
    fireEvent.change(screen.getByLabelText('Target portfolio'), { target: { value: '5000000' } })
    fireEvent.change(screen.getByLabelText('Target portfolio currency'), { target: { value: 'TWD' } })
    fireEvent.change(screen.getByLabelText('Expected return / year'), { target: { value: '8' } })
    fireEvent.change(screen.getByLabelText('Duration (years)'), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText('Initial capital'), { target: { value: '10000000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save simulator' }))

    expect(saveInvestmentConfig).toHaveBeenCalledWith(expect.objectContaining({
      monthly_contribution: 1100000000,
      contribution_currency: 'TWD',
      target_portfolio: 2750000000,
      target_currency: 'TWD',
      return_rate: 8,
      duration_years: 10,
      current_value: 10000000,
    }))
  })

  it('shows target progress beside the projected portfolio', () => {
    render(<Investing />)

    fireEvent.change(screen.getByLabelText('Contribution currency'), { target: { value: 'TWD' } })
    fireEvent.change(screen.getByLabelText('Monthly contribution'), { target: { value: '1000' } })
    fireEvent.change(screen.getByLabelText('Target portfolio'), { target: { value: '100000' } })

    expect(screen.getAllByText(/Target portfolio/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Target gap/i).length).toBeGreaterThan(0)
  })
})
