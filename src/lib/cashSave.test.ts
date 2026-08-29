import { describe, it, expect } from 'vitest'
import {
  validateSplitAmounts, validateWalletSplits, buildSplitPortions, buildWalletSplits,
  planCashChange, buildChangeTransferPayloads,
} from './cashSave'

const toBase = (n: number, _c: string) => n

describe('validateSplitAmounts', () => {
  it('accepts a fully-allocated split', () => {
    expect(validateSplitAmounts(100, [{ amount: '60' }, { amount: '40' }], 'USD')).toBeNull()
  })
  it('rejects fewer than 2 valid portions', () => {
    expect(validateSplitAmounts(100, [{ amount: '100' }], 'USD')).toMatch(/at least 2/i)
  })
  it('rejects empty amounts', () => {
    expect(validateSplitAmounts(100, [{ amount: '' }, { amount: '' }], 'USD')).toMatch(/amount/i)
  })
  it('rejects a sum below total', () => {
    expect(validateSplitAmounts(100, [{ amount: '30' }, { amount: '30' }], 'USD')).toMatch(/40/i)
  })
  it('rejects a sum above total', () => {
    expect(validateSplitAmounts(100, [{ amount: '70' }, { amount: '40' }], 'USD')).toMatch(/over/i)
  })
  it('uses exact equality for IDR (no decimals)', () => {
    expect(validateSplitAmounts(100000, [{ amount: '99999' }, { amount: '1' }], 'IDR')).toBeNull()
  })
})

describe('validateWalletSplits', () => {
  it('accepts a fully-allocated wallet split', () => {
    expect(validateWalletSplits(50, [{ amount: '20' }, { amount: '30' }], 'USD')).toBeNull()
  })
  it('rejects a mismatched sum', () => {
    expect(validateWalletSplits(50, [{ amount: '20' }, { amount: '20' }], 'USD')).toMatch(/10/i)
  })
})

describe('buildSplitPortions', () => {
  it('converts amounts to base and drops empty rows', () => {
    const out = buildSplitPortions(
      [{ category: 'Food', amount: '10' }, { category: 'Fun', amount: '' }], 'USD', toBase)
    expect(out).toEqual([{ category: 'Food', amount: 10 }])
  })
})

describe('buildWalletSplits', () => {
  it('converts amounts to base and keeps wallet ids', () => {
    const out = buildWalletSplits(
      [{ wallet_id: 'w1', amount: '7' }, { wallet_id: 'w2', amount: '3' }], 'USD', toBase)
    expect(out).toEqual([{ wallet_id: 'w1', amount: 7 }, { wallet_id: 'w2', amount: 3 }])
  })
})

describe('planCashChange', () => {
  it('splits TWD change into bills and coins', () => {
    const p = planCashChange(950, 1000, 'TWD')
    expect(p.isTWD).toBe(true)
    expect(p.change).toBe(50)
    expect(p.bills + p.coins).toBe(50)
  })
  it('routes non-TWD change entirely as coins', () => {
    const p = planCashChange(9, 10, 'USD')
    expect(p.isTWD).toBe(false)
    expect(p.coins).toBe(1)
    expect(p.bills).toBe(0)
  })
})

describe('buildChangeTransferPayloads', () => {
  const base = {
    savedTxId: 'tx1', safeDescription: 'Lunch', walletId: 'walletA',
    changeBillsWalletId: 'walletB', changeCoinsWalletId: 'walletC',
    date: '2026-08-28', inputCurrency: 'TWD', toBase,
  }
  it('builds bills+coins transfers for TWD', () => {
    const plan = planCashChange(750, 1000, 'TWD')
    const payloads = buildChangeTransferPayloads({ ...base, plan })
    expect(payloads).toHaveLength(2)
    expect(payloads.every(p => p.type === 'transfer' && p.is_system_generated && p.linked_transaction_id === 'tx1')).toBe(true)
    expect(payloads.map(p => p.transfer_wallet_id).sort()).toEqual(['walletB', 'walletC'])
  })
  it('skips a change wallet that equals the paying wallet', () => {
    const plan = planCashChange(750, 1000, 'TWD')
    const payloads = buildChangeTransferPayloads({ ...base, changeCoinsWalletId: 'walletA', plan })
    expect(payloads.some(p => p.transfer_wallet_id === 'walletA')).toBe(false)
  })
  it('returns no payloads when change is zero', () => {
    const payloads = buildChangeTransferPayloads({ ...base, plan: { isTWD: false, bills: 0, coins: 0, change: 0 } })
    expect(payloads).toEqual([])
  })
})
