import { beforeEach, describe, expect, it, vi } from 'vitest'
import { saveTransactionEntry, type SaveEntryOptions } from './saveTransaction'
import type { Transaction } from '@/types'

const { toastSuccess, toastError, hapticSuccess } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  hapticSuccess: vi.fn(),
}))

vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: toastError } }))
vi.mock('@/lib/haptics', () => ({ hapticSuccess }))

const addMock = vi.fn(async () => tx())
const updateMock = vi.fn(async () => ({}))
const deleteMock = vi.fn(async (_id: string) => ({}))
const onDoneMock = vi.fn()

const baseOptions: SaveEntryOptions = {
  type: 'expense',
  amount: '100',
  inputCurrency: 'IDR',
  date: '2026-08-31',
  description: 'Lunch',
  category: 'Food',
  walletId: 'w1',
  transferWalletId: 'w2',
  cannotSaveTransfer: false,
  cashEnabled: false,
  cashTendered: '',
  showCashAssistant: false,
  changeBillsWalletId: '',
  changeCoinsWalletId: '',
  toBase: n => n,
  addTransaction: addMock,
  updateTransaction: updateMock,
  deleteTransaction: deleteMock,
  onDone: onDoneMock,
}

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return { id: 'tx1', description: 'x', amount: 100, original_amount: 100, original_currency: 'IDR', type: 'expense', category: 'Food', date: '2026-08-31', needs_review: false, ...overrides }
}

beforeEach(() => {
  toastSuccess.mockClear()
  toastError.mockClear()
  hapticSuccess.mockClear()
  addMock.mockClear()
  updateMock.mockClear()
  deleteMock.mockClear()
  onDoneMock.mockClear()
  localStorage.clear()
})

describe('saveTransactionEntry — edit mode', () => {
  it('updates the row, preserves recurring linkage, and deletes old system rows', async () => {
    const update = vi.fn(async () => ({}))
    const del = vi.fn(async (_id: string) => ({}))
    const ok = await saveTransactionEntry({
      ...baseOptions,
      editId: 'tx1',
      editPreserve: { recurring_rule_id: 'r1', recurring_due_date: '2026-09-01' },
      editCleanup: { prevLinkedId: 'link1', linkedTxIds: ['ch1'], feeTxIds: ['fee1'] },
      updateTransaction: update,
      deleteTransaction: del,
    })

    expect(ok).toBe(true)
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      id: 'tx1',
      category: 'Food',
      recurring_rule_id: 'r1',
      recurring_due_date: '2026-09-01',
    }))
    expect(del.mock.calls.map(c => c[0])).toEqual(['link1', 'ch1', 'fee1'])
    expect(toastSuccess).toHaveBeenCalledWith('Transaction updated')
    expect(onDoneMock).toHaveBeenCalled()
  })

  it('recreates cash-change transfers and links the first one to the edited row', async () => {
    const update = vi.fn(async () => ({}))
    let n = 0
    const add = vi.fn(async () => tx({ id: `tx${++n + 1}` }))
    await saveTransactionEntry({
      ...baseOptions,
      type: 'expense',
      amount: '100',
      inputCurrency: 'TWD',
      cashEnabled: true,
      cashTendered: '500',
      showCashAssistant: true,
      changeBillsWalletId: 'bills',
      changeCoinsWalletId: 'coins',
      editId: 'tx1',
      editCleanup: { prevLinkedId: null, linkedTxIds: [], feeTxIds: [] },
      addTransaction: add,
      updateTransaction: update,
    })

    expect(add).toHaveBeenCalled()
    // First change transfer created is tx2 (n starts at 0)
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ id: 'tx1', linked_transaction_id: 'tx2' }))
  })

  it('recreates the transfer fee row on transfer edits', async () => {
    const add = vi.fn(async () => tx())
    await saveTransactionEntry({
      ...baseOptions,
      type: 'transfer',
      description: 'Move to card',
      category: 'Transfer',
      walletId: 'cash',
      transferWalletId: 'card',
      editId: 'tx1',
      editCleanup: { prevLinkedId: null, linkedTxIds: [], feeTxIds: ['oldFee'] },
      transferFeeEnabled: true,
      transferFeeAmount: '2500',
      addTransaction: add,
    })

    expect(add).toHaveBeenCalledWith(expect.objectContaining({
      type: 'expense',
      category: 'Transfer Fee',
      amount: 2500,
      is_system_generated: true,
      linked_transaction_id: 'tx1',
    }))
  })

  it('propagates the edit to the parent recurring rule when requested', async () => {
    const updateRule = vi.fn(async () => ({}))
    await saveTransactionEntry({
      ...baseOptions,
      description: 'Netflix',
      amount: '150',
      editId: 'tx1',
      editCleanup: { prevLinkedId: null, linkedTxIds: [], feeTxIds: [] },
      editRuleId: 'rule1',
      updateRule,
    })

    expect(updateRule).toHaveBeenCalledWith(expect.objectContaining({
      id: 'rule1',
      description: 'Netflix',
      category: 'Food',
      amount: 150,
      original_amount: 150,
      original_currency: 'IDR',
    }))
  })

  it('requires a merchant name on edit', async () => {
    const update = vi.fn(async () => ({}))
    const ok = await saveTransactionEntry({
      ...baseOptions,
      description: '  ',
      editId: 'tx1',
      updateTransaction: update,
    })

    expect(ok).toBe(false)
    expect(toastError).toHaveBeenCalledWith('Please enter a merchant name')
    expect(update).not.toHaveBeenCalled()
    expect(onDoneMock).not.toHaveBeenCalled()
  })
})

describe('saveTransactionEntry — add mode', () => {
  it('inserts and shows the added toast', async () => {
    const add = vi.fn(async () => tx())
    const ok = await saveTransactionEntry({ ...baseOptions, addTransaction: add })

    expect(ok).toBe(true)
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ category: 'Food', wallet_id: 'w1' }))
    expect(toastSuccess).toHaveBeenCalledWith('Transaction added')
    expect(onDoneMock).toHaveBeenCalled()
  })
})
