import { describe, expect, it } from 'vitest'
import { getTwdTenderOptions, pickQuickAddWallet } from './quickAdd'
import type { Wallet } from '@/types'

const wallets: Wallet[] = [
  { id: 'card', name: 'Debit card', type: 'card', balance: 0, currency: 'TWD' },
  { id: 'coins', name: 'Coin pouch', type: 'cash', balance: 0, currency: 'TWD', cash_role: 'coins' },
  { id: 'notes', name: 'Notes wallet', type: 'cash', balance: 0, currency: 'TWD', cash_role: 'notes' },
  { id: 'mixed', name: 'Mixed cash', type: 'cash', balance: 0, currency: 'TWD', cash_role: 'mixed' },
]

describe('pickQuickAddWallet', () => {
  it('uses the last wallet for normal quick add when it still exists', () => {
    expect(pickQuickAddWallet(wallets, 'card', false)?.id).toBe('card')
  })

  it('prefers a notes cash wallet for cash quick add', () => {
    expect(pickQuickAddWallet(wallets, 'card', true)?.id).toBe('notes')
  })

  it('falls back to any cash wallet for cash quick add', () => {
    const onlyCoins = wallets.filter(wallet => wallet.id !== 'notes' && wallet.id !== 'mixed')

    expect(pickQuickAddWallet(onlyCoins, 'card', true)?.id).toBe('coins')
  })

  it('falls back to the first wallet when the saved wallet is missing', () => {
    expect(pickQuickAddWallet(wallets, 'missing', false)?.id).toBe('card')
  })
})

describe('getTwdTenderOptions', () => {
  it('offers the standard TWD tender chips when no amount is entered', () => {
    expect(getTwdTenderOptions(0)).toEqual([50, 100, 200, 500, 1000])
  })

  it('filters out denominations that cannot cover the expense', () => {
    expect(getTwdTenderOptions(75)).toEqual([100, 200, 500, 1000])
  })

  it('includes NT$50 for small purchases', () => {
    expect(getTwdTenderOptions(45)).toEqual([50, 100, 200, 500, 1000])
  })

  it('adds the next thousand chip for larger purchases', () => {
    expect(getTwdTenderOptions(1250)).toEqual([2000])
  })
})
