import { describe, expect, it } from 'vitest'
import { buildCashPaymentPreview } from './cashPaymentPreview'
import type { Transaction, Wallet } from '@/types'

const wallets: Wallet[] = [
  { id: 'notes', name: 'Notes wallet', type: 'cash', balance: 5000, currency: 'TWD', cash_role: 'notes' },
  { id: 'coins', name: 'Coin pouch', type: 'cash', balance: 120, currency: 'TWD', cash_role: 'coins' },
]

const toBase = (amount: number) => amount

describe('buildCashPaymentPreview', () => {
  it('uses live wallet balances and applies expense plus routed change for new payments', () => {
    const liveBalances = new Map([
      ['notes', 4350],
      ['coins', 180],
    ])

    const preview = buildCashPaymentPreview({
      wallets,
      walletBalances: liveBalances,
      walletId: 'notes',
      amount: 750,
      tendered: 1000,
      inputCurrency: 'TWD',
      changeBillsWalletId: '',
      changeCoinsWalletId: 'coins',
      toBase,
    })

    expect(preview.rows).toEqual([
      { walletId: 'notes', name: 'Notes wallet', before: 4350, after: 3550, delta: -800 },
      { walletId: 'coins', name: 'Coin pouch', before: 180, after: 230, delta: 50 },
    ])
  })

  it('reverses the previous cash payment before applying edited values', () => {
    const liveBalances = new Map([
      ['notes', 4200],
      ['coins', 170],
    ])
    const previousPayment: Transaction = {
      id: 'old-payment',
      description: 'Lunch',
      amount: 750,
      original_amount: 750,
      original_currency: 'TWD',
      type: 'expense',
      category: 'Food',
      wallet_id: 'notes',
      transfer_wallet_id: null,
      date: '2026-10-01',
      needs_review: false,
      cash_tendered: 1000,
    }
    const previousChange: Transaction = {
      id: 'old-change',
      description: 'Change coins - Lunch',
      amount: 50,
      original_amount: 50,
      original_currency: 'TWD',
      type: 'transfer',
      category: 'Transfer',
      wallet_id: 'notes',
      transfer_wallet_id: 'coins',
      linked_transaction_id: 'old-payment',
      is_system_generated: true,
      date: '2026-10-01',
      needs_review: false,
    }

    const unchanged = buildCashPaymentPreview({
      wallets,
      walletBalances: liveBalances,
      walletId: 'notes',
      amount: 750,
      tendered: 1000,
      inputCurrency: 'TWD',
      changeBillsWalletId: '',
      changeCoinsWalletId: 'coins',
      previousTransactions: [previousPayment, previousChange],
      toBase,
    })

    expect(unchanged.rows).toEqual([
      { walletId: 'notes', name: 'Notes wallet', before: 4200, after: 4200, delta: 0 },
      { walletId: 'coins', name: 'Coin pouch', before: 170, after: 170, delta: 0 },
    ])

    const edited = buildCashPaymentPreview({
      wallets,
      walletBalances: liveBalances,
      walletId: 'notes',
      amount: 800,
      tendered: 1000,
      inputCurrency: 'TWD',
      changeBillsWalletId: '',
      changeCoinsWalletId: 'coins',
      previousTransactions: [previousPayment, previousChange],
      toBase,
    })

    expect(edited.rows).toEqual([
      { walletId: 'notes', name: 'Notes wallet', before: 4200, after: 4200, delta: 0 },
      { walletId: 'coins', name: 'Coin pouch', before: 170, after: 120, delta: -50 },
    ])
  })
})
