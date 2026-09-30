import { render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CashChangeAssistant } from './CashChangeAssistant'
import type { Wallet } from '@/types'

vi.mock('@/lib/currency', () => ({
  useMoney: () => ({
    baseCurrency: 'TWD',
    displayCurrency: 'TWD',
    toBase: (amount: number) => amount,
    format: (amount: number, currency: string) => `${currency} ${new Intl.NumberFormat('en-US').format(amount)}`,
    formatBase: (amount: number) => `NT$${new Intl.NumberFormat('en-US').format(amount)}`,
    formatDisplay: (amount: number) => `NT$${new Intl.NumberFormat('en-US').format(amount)}`,
  }),
}))

const wallets: Wallet[] = [
  { id: 'notes', name: 'Notes wallet', type: 'cash', balance: 5000, currency: 'TWD', cash_role: 'notes' },
  { id: 'coins', name: 'Coin pouch', type: 'cash', balance: 120, currency: 'TWD', cash_role: 'coins' },
]

function renderAssistant(props?: Partial<ComponentProps<typeof CashChangeAssistant>>) {
  return render(
    <MemoryRouter>
      <CashChangeAssistant
        cashEnabled
        cashTendered="1000"
        walletId="notes"
        inputCurrency="TWD"
        amount="750"
        changeBillsWalletId=""
        changeCoinsWalletId="coins"
        wallets={wallets}
        category="Food"
        setCashEnabled={vi.fn()}
        setCashTendered={vi.fn()}
        setChangeBillsWalletId={vi.fn()}
        setChangeCoinsWalletId={vi.fn()}
        {...props}
      />
    </MemoryRouter>
  )
}

describe('CashChangeAssistant balance preview', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('shows the selected wallet after expense plus only change routed away', () => {
    renderAssistant()

    expect(screen.getByText('Notes wallet')).toBeInTheDocument()
    expect(screen.getByText('NT$5,000 → NT$4,200')).toBeInTheDocument()
    expect(screen.getByText('NT$120 → NT$170')).toBeInTheDocument()
  })

  it('shows full tendered leaving the selected wallet when all change routes away', () => {
    renderAssistant({ changeBillsWalletId: 'coins' })

    expect(screen.getByText('NT$5,000 → NT$4,000')).toBeInTheDocument()
    expect(screen.getByText('NT$120 → NT$370')).toBeInTheDocument()
  })
})
