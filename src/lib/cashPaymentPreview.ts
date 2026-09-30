import { splitChangeByPolicy, type FiftyCoinRouting } from '@/lib/cashChange'
import type { Transaction, Wallet } from '@/types'

export interface CashPreviewRow {
  walletId: string
  name: string
  before: number
  after: number
  delta: number
}

export interface CashPaymentPreview {
  changeAmount: number
  billsChange: number
  coinsChange: number
  rows: CashPreviewRow[]
  routedChangeByWallet: Map<string, number>
}

export interface BuildCashPaymentPreviewOptions {
  wallets: Wallet[]
  walletBalances?: Map<string, number>
  walletId: string
  amount: number
  tendered: number
  inputCurrency: string
  changeBillsWalletId: string
  changeCoinsWalletId: string
  previousTransactions?: Transaction[]
  routeFiftyCoinTo?: FiftyCoinRouting
  toBase: (amount: number, currency: string) => number
}

function addDelta(deltas: Map<string, number>, walletId: string | null | undefined, amount: number) {
  if (!walletId || !Number.isFinite(amount) || amount === 0) return
  deltas.set(walletId, (deltas.get(walletId) ?? 0) + amount)
}

function getTransactionDeltas(transactions: Transaction[]): Map<string, number> {
  const deltas = new Map<string, number>()

  for (const tx of transactions) {
    if (tx.type === 'income') {
      addDelta(deltas, tx.wallet_id, tx.amount)
    } else if (tx.type === 'transfer') {
      addDelta(deltas, tx.wallet_id, -tx.amount)
      addDelta(deltas, tx.transfer_wallet_id, tx.amount)
    } else if (tx.wallet_splits && tx.wallet_splits.length > 0) {
      tx.wallet_splits.forEach(split => addDelta(deltas, split.wallet_id, -split.amount))
    } else {
      addDelta(deltas, tx.wallet_id, -tx.amount)
    }
  }

  return deltas
}

export function buildCashPaymentPreview({
  wallets,
  walletBalances,
  walletId,
  amount,
  tendered,
  inputCurrency,
  changeBillsWalletId,
  changeCoinsWalletId,
  previousTransactions = [],
  routeFiftyCoinTo = 'coins',
  toBase,
}: BuildCashPaymentPreviewOptions): CashPaymentPreview {
  const isTWD = inputCurrency === 'TWD'
  const changeAmount = Number.isFinite(tendered) && tendered > amount ? tendered - amount : 0
  const { bills: billsChange, coins: coinsChange } = isTWD
    ? splitChangeByPolicy(changeAmount, { currency: 'TWD', routeFiftyCoinTo })
    : { bills: 0, coins: changeAmount }

  const beforeBalances = new Map(wallets.map(wallet => [
    wallet.id,
    walletBalances?.get(wallet.id) ?? wallet.balance ?? 0,
  ]))
  const afterBalances = new Map(beforeBalances)

  const applyDelta = (targetWalletId: string | null | undefined, delta: number) => {
    if (!targetWalletId || !Number.isFinite(delta) || delta === 0) return
    afterBalances.set(targetWalletId, (afterBalances.get(targetWalletId) ?? 0) + delta)
  }

  const previousDeltas = getTransactionDeltas(previousTransactions)
  previousDeltas.forEach((delta, previousWalletId) => applyDelta(previousWalletId, -delta))

  applyDelta(walletId, -toBase(amount, inputCurrency))

  const routedChangeByWallet = new Map<string, number>()
  const routeChange = (destinationWalletId: string, value: number) => {
    if (!destinationWalletId || destinationWalletId === walletId || value <= 0) return
    const baseValue = toBase(value, inputCurrency)
    applyDelta(walletId, -baseValue)
    applyDelta(destinationWalletId, baseValue)
    routedChangeByWallet.set(destinationWalletId, (routedChangeByWallet.get(destinationWalletId) ?? 0) + value)
  }

  if (isTWD) {
    routeChange(changeBillsWalletId, billsChange)
    routeChange(changeCoinsWalletId, coinsChange)
  } else {
    routeChange(changeCoinsWalletId, changeAmount)
  }

  const walletNames = new Map(wallets.map(wallet => [wallet.id, wallet.name]))
  const rowIds = new Set<string>([walletId, ...routedChangeByWallet.keys(), ...previousDeltas.keys()])
  const rows = Array.from(rowIds)
    .map(rowWalletId => {
      const before = beforeBalances.get(rowWalletId) ?? 0
      const after = afterBalances.get(rowWalletId) ?? before
      return {
        walletId: rowWalletId,
        name: walletNames.get(rowWalletId) ?? 'Wallet',
        before,
        after,
        delta: after - before,
      }
    })
    .filter(row => row.walletId === walletId || routedChangeByWallet.has(row.walletId) || Math.abs(row.delta) > 0.005)

  return {
    changeAmount,
    billsChange,
    coinsChange,
    rows,
    routedChangeByWallet,
  }
}
