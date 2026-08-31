// Shared transaction-entry save flow.
//
// QuickAddSheet, the AddTransaction page, and the Transactions add/edit sheet
// each re-implemented the same validate → payload → cash-change → toast
// sequence. This module is the single implementation they all call, so
// validation, cash routing, and edit cleanup can never drift apart again.

import { parseNumberInput } from '@/lib/numberInput'
import {
  validateSplitAmounts, validateWalletSplits,
  buildSplitPortions, buildWalletSplits,
  planCashChange, buildChangeTransferPayloads,
} from '@/lib/cashSave'
import { hapticSuccess } from '@/lib/haptics'
import { toast } from 'sonner'
import type { Transaction } from '@/types'

export type TransactionEntryInput = Omit<Transaction, 'id' | 'created_at'>
export type EntryType = 'income' | 'expense' | 'transfer'

export const LAST_CATEGORY_KEY = 'finpath_last_category'
export const LAST_WALLET_KEY = 'finpath_last_wallet'

export const INCOME_CATEGORIES = ['Wage', 'Gift', 'Refund', 'Allowance', 'Other income']

export interface SaveEntryOptions {
  type: EntryType
  amount: string
  inputCurrency: string
  date: string
  description: string
  category: string
  walletId: string
  transferWalletId: string
  cannotSaveTransfer: boolean
  cashEnabled: boolean
  cashTendered: string
  /** Cash UI is visible (cash wallet) — a stale cashEnabled on a non-cash wallet must not block save */
  showCashAssistant: boolean
  changeBillsWalletId: string
  changeCoinsWalletId: string
  splitEnabled?: boolean
  splitPortions?: { category: string; amount: string }[]
  multiWalletEnabled?: boolean
  walletSplits?: { wallet_id: string; amount: string }[]
  toBase: (amount: number, currency: string) => number
  addTransaction: (payload: TransactionEntryInput) => Promise<Transaction | undefined>
  updateTransaction: (patch: { id: string } & Partial<Transaction>) => Promise<unknown>
  deleteTransaction: (id: string) => Promise<unknown>
  /** Called after a successful save (reset + close, or navigate back) */
  onDone: () => void
  /** Edit mode: update this transaction instead of inserting a new one. */
  editId?: string
  /** Fields preserved through an edit (recurring linkage). */
  editPreserve?: { recurring_rule_id: string | null; recurring_due_date: string | null }
  /** System-generated rows linked to the edited transaction, deleted before the update. */
  editCleanup?: { prevLinkedId: string | null; linkedTxIds: string[]; feeTxIds: string[] }
  /** Transfer fee to (re)create on edit when type is 'transfer'. */
  transferFeeEnabled?: boolean
  transferFeeAmount?: string
}

/** Validates, persists the transaction, routes cash change, shows the undo toast. Returns success. */
export async function saveTransactionEntry(o: SaveEntryOptions): Promise<boolean> {
  const parsedAmount = parseNumberInput(o.amount)
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    toast.error('Please enter a valid amount')
    return false
  }
  if (o.cannotSaveTransfer) {
    toast.error('Select two different wallets for a transfer')
    return false
  }
  if (o.editId && o.type !== 'transfer' && !o.description.trim()) {
    toast.error('Please enter a merchant name')
    return false
  }
  const selectedCategory = o.type === 'income' ? (o.category || INCOME_CATEGORIES[0]) : o.category
  if (o.type !== 'transfer' && !o.walletId) {
    toast.error('Please select a wallet')
    return false
  }

  // Cash validation — only when the cash UI is actually shown (cash wallet):
  // a cash-enabled state with a non-cash wallet has no switch to turn it
  // off, so it must never block the save.
  const parsedTendered = o.cashEnabled ? parseNumberInput(o.cashTendered) : 0
  if (o.cashEnabled && o.showCashAssistant && Number.isFinite(parsedTendered) && parsedTendered > 0 && parsedTendered < parsedAmount) {
    toast.error('Cash given must be at least the expense amount')
    return false
  }

  // Hard validation: split portions must sum to the total; cash mode requires a tendered amount
  const splitError = o.splitEnabled ? validateSplitAmounts(parsedAmount, o.splitPortions ?? [], o.inputCurrency) : null
  if (splitError) { toast.error(splitError); return false }
  const walletSplitError = o.multiWalletEnabled ? validateWalletSplits(parsedAmount, o.walletSplits ?? [], o.inputCurrency) : null
  if (walletSplitError) { toast.error(walletSplitError); return false }
  if (o.cashEnabled && o.showCashAssistant && (!Number.isFinite(parseNumberInput(o.cashTendered)) || parseNumberInput(o.cashTendered) <= 0)) {
    toast.error('Enter the cash amount given'); return false
  }

  const safeDescription = o.description.trim() ||
    (o.type === 'transfer' ? 'Transfer' :
     o.type === 'income' ? `${selectedCategory || 'Income'} income` :
     `${selectedCategory || 'Expense'} expense`)

  const baseAmount = o.toBase(parsedAmount, o.inputCurrency)
  const baseTendered = o.cashEnabled ? o.toBase(parsedTendered, o.inputCurrency) : 0
  const baseChange = Math.max(0, baseTendered - baseAmount)

  const computedSplitPortions = o.splitEnabled
    ? buildSplitPortions(o.splitPortions ?? [], o.inputCurrency, o.toBase)
    : null
  const computedWalletSplits = o.multiWalletEnabled
    ? buildWalletSplits(o.walletSplits ?? [], o.inputCurrency, o.toBase)
    : null

  const payload: TransactionEntryInput = {
    description: safeDescription,
    amount: baseAmount,
    original_amount: parsedAmount,
    original_currency: o.inputCurrency,
    type: o.type,
    category: o.type === 'transfer' ? 'Transfer'
      : (computedSplitPortions ? 'Split' : (selectedCategory || 'Other')),
    wallet_id: computedWalletSplits ? null : (o.walletId || null),
    transfer_wallet_id: o.type === 'transfer' ? o.transferWalletId : null,
    recurring_rule_id: o.editPreserve?.recurring_rule_id ?? null,
    recurring_due_date: o.editPreserve?.recurring_due_date ?? null,
    date: o.date,
    needs_review: false,
    cash_tendered: o.cashEnabled && baseTendered > 0 ? baseTendered : null,
    split_portions: computedSplitPortions,
    wallet_splits: computedWalletSplits,
  }

  try {
    let savedTxId: string | undefined

    if (o.editId) {
      // Edit mode: drop the previous system-generated rows, then update in place.
      if (o.editCleanup) {
        const { prevLinkedId, linkedTxIds, feeTxIds } = o.editCleanup
        if (prevLinkedId && !linkedTxIds.includes(prevLinkedId)) {
          await o.deleteTransaction(prevLinkedId)
        }
        for (const id of linkedTxIds) await o.deleteTransaction(id)
        for (const id of feeTxIds) await o.deleteTransaction(id)
      }
      await o.updateTransaction({ id: o.editId, ...payload })
      savedTxId = o.editId
    } else {
      const savedTx = await o.addTransaction(payload)
      savedTxId = savedTx?.id
    }

    // Create cash-change transfer(s)
    const changeTxIds: string[] = []
    if (o.cashEnabled && baseChange > 0 && savedTxId) {
      const plan = planCashChange(parsedAmount, parsedTendered, o.inputCurrency)
      const changePayloads = buildChangeTransferPayloads({
        savedTxId, safeDescription, walletId: o.walletId,
        changeBillsWalletId: o.changeBillsWalletId, changeCoinsWalletId: o.changeCoinsWalletId,
        plan, date: o.date, inputCurrency: o.inputCurrency,
        toBase: o.toBase,
      })
      for (const p of changePayloads) {
        try {
          const created = await o.addTransaction(p as TransactionEntryInput)
          if (created?.id) changeTxIds.push(created.id)
        } catch (err) {
          console.error('Failed to create change transfer:', err)
          toast.error('Failed to route change')
        }
      }
      if (changeTxIds.length > 0) {
        try { await o.updateTransaction({ id: savedTxId, linked_transaction_id: changeTxIds[0] }) }
        catch { /* link failure is non-fatal */ }
      }
    }

    // Recreate the transfer fee row on edit
    if (o.editId && o.type === 'transfer' && o.transferFeeEnabled && parseNumberInput(o.transferFeeAmount ?? '') > 0) {
      const parsedFee = parseNumberInput(o.transferFeeAmount!)
      await o.addTransaction({
        description: `Transfer fee${safeDescription !== 'Transfer' ? ` — ${safeDescription}` : ''}`,
        amount: o.toBase(parsedFee, o.inputCurrency),
        original_amount: parsedFee,
        original_currency: o.inputCurrency,
        type: 'expense',
        category: 'Transfer Fee',
        wallet_id: o.walletId || null,
        transfer_wallet_id: null,
        recurring_rule_id: null,
        recurring_due_date: null,
        date: o.date,
        needs_review: false,
        is_system_generated: true,
        linked_transaction_id: o.editId,
        cash_tendered: null,
      })
    }

    if (o.walletId) localStorage.setItem(LAST_WALLET_KEY, o.walletId)
    if (selectedCategory) localStorage.setItem(LAST_CATEGORY_KEY, selectedCategory)

    hapticSuccess()
    if (o.editId) {
      toast.success('Transaction updated')
    } else if (o.cashEnabled && changeTxIds.length > 0 && savedTxId) {
      const allIds = [savedTxId, ...changeTxIds]
      toast.success('Cash payment saved · change routed', {
        duration: 8000,
        action: {
          label: 'Undo',
          onClick: async () => {
            for (const id of allIds) await o.deleteTransaction(id)
            toast.success('Cash payment undone')
          },
        },
      })
    } else {
      toast.success('Transaction added')
    }
    o.onDone()
    return true
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Failed to save transaction')
    return false
  }
}
