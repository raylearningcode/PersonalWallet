import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { Reports } from './Reports'
import { downloadPDF, generateReportHTML } from '@/lib/pdfExport'

vi.mock('@/lib/pdfExport', () => {
  const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
  return {
    escapeHtml,
    generateReportHTML: vi.fn((title: string, subtitle: string, _summary: { label: string; value: string }[], tableHTML: string) =>
      `<h1>${title}</h1><p>${subtitle}</p>${tableHTML}`),
    downloadPDF: vi.fn(),
    generatePDFFromHTML: vi.fn(),
  }
})

const now = new Date()
const thisMonthLabel = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
const prevMonthLabel = prev.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

vi.mock('@/lib/queries', () => ({
  useTransactions: () => ({ data: [
    { id: 'tx-1', description: 'Lunch', amount: 550000, original_amount: 1000, original_currency: 'TWD', type: 'expense', category: 'Food', wallet_id: 'cash', transfer_wallet_id: null, date: '2026-05-21', needs_review: false },
    { id: 'tx-2', description: 'Course', amount: 1100000, original_amount: 2000, original_currency: 'TWD', type: 'expense', category: 'Learning', wallet_id: 'cash', transfer_wallet_id: null, date: '2026-05-18', needs_review: false },
    { id: 'tx-3', description: 'Salary', amount: 2200000, original_amount: 4000, original_currency: 'TWD', type: 'income', category: 'Wage', wallet_id: 'cash', transfer_wallet_id: null, date: '2026-05-01', needs_review: false },
  ] }),
  useBudgetCategories: () => ({ data: [
    { id: 'food', name: 'Food', yearly_allocated: 1000000, budget_period: 'monthly', color: '#A9F5C7' },
    { id: 'learning', name: 'Learning', yearly_allocated: 1000000, budget_period: 'monthly', color: '#93C5FD' },
  ] }),
  useAppSettings: () => ({ data: undefined }),
  useWallets: () => ({ data: [{ id: 'w1', name: 'Cash', type: 'cash', balance: 0, currency: 'IDR' }] }),
useRecurringRules: () => ({ data: [] }),

  useGoals: () => ({ data: [] }),
  useAddTransaction: () => ({ mutateAsync: async () => {} }),
}))

vi.mock('@/lib/currency', () => ({
  useCurrency: () => (amount: number) => `Rp ${new Intl.NumberFormat('en-US').format(amount)}`,
  useMoney: () => ({
    baseCurrency: 'IDR',
    displayCurrency: 'IDR',
    formatDisplay: (amount: number) => `Rp ${new Intl.NumberFormat('en-US').format(amount)}`,
    formatRef: () => null,
  }),
  txAmountColor: (amount: number, type: string) => amount === 0 ? 'text-foreground' : type === 'income' ? 'text-primary' : 'text-[#FF8388]',
  txAmountSign: (amount: number, type: string) => amount === 0 ? '' : type === 'income' ? '+' : type === 'transfer' ? '' : '-',
}))

describe('Reports', () => {
  it('switches report range between week, month, and year', () => {
    render(<MemoryRouter><Reports /></MemoryRouter>)

    // Range dropdown appears in both the header and the mobile sticky bar
    expect(screen.getAllByLabelText('Time range').length).toBeGreaterThan(0)
    fireEvent.change(screen.getAllByLabelText('Time range')[0], { target: { value: 'month' } })
    expect(screen.getByText('Spending by category')).toBeInTheDocument()
    expect(screen.getByText('Category breakdown')).toBeInTheDocument()
    expect(screen.getAllByText('Food').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Learning').length).toBeGreaterThan(0)
  })

  it('moves between specific reporting periods', () => {
    render(<MemoryRouter><Reports /></MemoryRouter>)

    // Period label appears in both the header and the mobile sticky bar
    expect(screen.getAllByText(thisMonthLabel).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/No transactions in this period\./).length).toBeGreaterThan(0)
    // Go back to the previous month
    fireEvent.click(screen.getAllByRole('button', { name: 'Previous period' })[0])
    expect(screen.getAllByText(prevMonthLabel).length).toBeGreaterThan(0)
    // Go forward again
    fireEvent.click(screen.getAllByRole('button', { name: 'Next period' })[0])
    expect(screen.getAllByText(thisMonthLabel).length).toBeGreaterThan(0)
  })

  it('downloads a PDF report from the header button', () => {
    render(<MemoryRouter><Reports /></MemoryRouter>)

    fireEvent.click(screen.getByRole('button', { name: 'PDF' }))

    expect(generateReportHTML).toHaveBeenCalledWith(
      expect.stringContaining('FinPath Report'),
      expect.stringContaining('All wallets'),
      expect.arrayContaining([
        expect.objectContaining({ label: 'Income', variant: 'positive' }),
        expect.objectContaining({ label: 'Expenses', variant: 'negative' }),
        expect.objectContaining({ label: 'Top category' }),
      ]),
      expect.any(String),
    )
    expect(downloadPDF).toHaveBeenCalledWith(
      expect.stringContaining('<h1>FinPath Report'),
      expect.stringContaining('finpath-report-'),
    )
  })
})
