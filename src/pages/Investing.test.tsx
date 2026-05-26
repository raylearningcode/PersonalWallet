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
  useCurrency: () => (amount: number) =>
    `Rp ${new Intl.NumberFormat('en-US').format(Math.round(amount / 1_000_000 * 10) / 10)}M`,
  formatCurrency: (amount: number) =>
    `Rp ${new Intl.NumberFormat('en-US').format(amount)}`,
  useExchangeRates: () => ({ data: {} }),
}))

describe('Investing', () => {
  it('starts empty and updates the ROI simulation from user input', () => {
    render(<Investing />)

    expect(screen.getByText(/Estimated in 0 years/i)).toBeInTheDocument()
    expect(screen.getAllByText('Rp 0M').length).toBeGreaterThan(0)

    fireEvent.change(screen.getByLabelText('Monthly contribution'), { target: { value: '1500000' } })
    fireEvent.change(screen.getByLabelText('Expected return / year'), { target: { value: '7%' } })
    fireEvent.change(screen.getByLabelText('Duration (years)'), { target: { value: '7' } })
    fireEvent.change(screen.getByLabelText('Initial capital'), { target: { value: '5000000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Run ROI sim' }))

    expect(screen.getByText(/Estimated in 7 years/i)).toBeInTheDocument()
    expect(screen.getAllByText('Rp 170.1M').length).toBeGreaterThan(0)
  })

  it('saves the simulator assumptions for future sessions', () => {
    render(<Investing />)

    fireEvent.change(screen.getByLabelText('Monthly contribution'), { target: { value: '2000000' } })
    fireEvent.change(screen.getByLabelText('Expected return / year'), { target: { value: '8' } })
    fireEvent.change(screen.getByLabelText('Duration (years)'), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText('Initial capital'), { target: { value: '10000000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save simulator' }))

    expect(saveInvestmentConfig).toHaveBeenCalledWith(expect.objectContaining({
      monthly_contribution: 2000000,
      return_rate: 8,
      duration_years: 10,
      current_value: 10000000,
    }))
  })
})
