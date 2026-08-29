import type { SplitPortion, Transaction, WalletSplit } from '@/types'
import { parseNumberInput } from '@/lib/numberInput'
import { splitChangeByPolicy, getFiftyCoinRouting } from '@/lib/cashChange'

const TOLERANCE = 0.01

function sumValidAmounts(rows: { amount: string }[]): { total: number; validCount: number } {
  let total = 0
  let validCount = 0
  for (const r of rows) {
    const n = parseNumberInput(r.amount)
    if (Number.isFinite(n) && n > 0) { total += n; validCount += 1 }
  }
  return { total, validCount }
}

function validatePortionSum(total: number, rows: { amount: string }[], currency: string, label: string): string | null {
  const { total: sum, validCount } = sumValidAmounts(rows)
  if (validCount < 2) return `Enter at least 2 ${label} amounts`
  const diff = total - sum
  const tolerance = currency === 'IDR' ? 0 : TOLERANCE
  if (Math.abs(diff) > tolerance) {
    return diff > 0
      ? `${label} amounts are ${currency} ${formatShort(diff)} short of the total`
      : `${label} amounts are ${currency} ${formatShort(Math.abs(diff))} over the total`
  }
  return null
}

function formatShort(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

/** null = valid; otherwise a user-facing error message. */
export function validateSplitAmounts(total: number, portions: { amount: string }[], currency: string): string | null {
  return validatePortionSum(total, portions, currency, 'portion')
}

/** null = valid; otherwise a user-facing error message. */
export function validateWalletSplits(total: number, splits: { amount: string }[], currency: string): string | null {
  return validatePortionSum(total, splits, currency, 'wallet')
}

export function buildSplitPortions(
  portions: { category: string; amount: string }[],
  currency: string,
  toBase: (n: number, c: string) => number,
): SplitPortion[] {
  return portions
    .map(p => ({ category: p.category, amount: toBase(parseNumberInput(p.amount), currency) }))
    .filter(p => p.amount > 0)
}

export function buildWalletSplits(
  splits: { wallet_id: string; amount: string }[],
  currency: string,
  toBase: (n: number, c: string) => number,
): WalletSplit[] {
  return splits
    .map(w => ({ wallet_id: w.wallet_id, amount: toBase(parseNumberInput(w.amount), currency) }))
    .filter(w => w.amount > 0)
}

export interface CashChangePlan { isTWD: boolean; bills: number; coins: number; change: number }

export function planCashChange(amount: number, tendered: number, currency: string): CashChangePlan {
  const change = Math.max(0, tendered - amount)
  const isTWD = currency === 'TWD'
  if (!isTWD) return { isTWD: false, bills: 0, coins: change, change }
  const { bills, coins } = splitChangeByPolicy(change, { currency: 'TWD', routeFiftyCoinTo: getFiftyCoinRouting() })
  return { isTWD: true, bills, coins, change }
}

export interface ChangeTransferParams {
  savedTxId: string
  safeDescription: string
  walletId: string | null
  changeBillsWalletId: string
  changeCoinsWalletId: string
  plan: CashChangePlan
  date: string
  inputCurrency: string
  toBase: (n: number, c: string) => number
}

/** 0–2 system-generated change-transfer payloads (self-transfers guarded out). */
export function buildChangeTransferPayloads(p: ChangeTransferParams): Partial<Transaction>[] {
  if (p.plan.change <= 0 || !p.savedTxId) return []
  const payloads: Partial<Transaction>[] = []
  const basePayload = {
    type: 'transfer' as const,
    category: 'Transfer',
    wallet_id: p.walletId,
    recurring_rule_id: null,
    recurring_due_date: null,
    date: p.date,
    needs_review: false,
    is_system_generated: true,
    linked_transaction_id: p.savedTxId,
    cash_tendered: null,
  }

  if (p.plan.isTWD && p.plan.bills > 0 && p.changeBillsWalletId && p.changeBillsWalletId !== p.walletId) {
    payloads.push({
      ...basePayload,
      description: `Change bills — ${p.safeDescription}`,
      amount: p.toBase(p.plan.bills, p.inputCurrency),
      original_amount: p.plan.bills,
      original_currency: p.inputCurrency,
      transfer_wallet_id: p.changeBillsWalletId,
    })
  }
  if (p.plan.coins > 0 && p.changeCoinsWalletId && p.changeCoinsWalletId !== p.walletId) {
    const label = p.plan.isTWD ? 'Change coins' : 'Change'
    payloads.push({
      ...basePayload,
      description: `${label} — ${p.safeDescription}`,
      amount: p.toBase(p.plan.coins, p.inputCurrency),
      original_amount: p.plan.coins,
      original_currency: p.inputCurrency,
      transfer_wallet_id: p.changeCoinsWalletId,
    })
  }
  return payloads
}
