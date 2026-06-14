import { isInBudgetPeriod } from './budget'
import type { BudgetCategory, Transaction, Wallet } from '@/types'

export function getSafeToSpend(remainingBudget: number, spentSoFar: number, daysRemaining: number) {
  const remaining = Math.max(0, remainingBudget - spentSoFar)
  return Math.floor(remaining / Math.max(1, daysRemaining))
}

export function getDaysRemainingInMonth(date = new Date()) {
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0)
  return Math.max(1, end.getDate() - date.getDate() + 1)
}

export function getWalletBalances(wallets: Wallet[], transactions: Transaction[]) {
  const balances = new Map(wallets.map(wallet => [wallet.id, wallet.balance ?? 0]))
  transactions.forEach(tx => {
    // Income
    if (tx.type === 'income' && tx.wallet_id) {
      balances.set(tx.wallet_id, (balances.get(tx.wallet_id) ?? 0) + tx.amount)
    }
    // Expense — with wallet splits support
    if (tx.type !== 'income' && tx.type !== 'transfer') {
      if (tx.wallet_splits && tx.wallet_splits.length > 0) {
        // Multi-wallet: deduct from each wallet according to its split portion
        tx.wallet_splits.forEach(ws => {
          balances.set(ws.wallet_id, (balances.get(ws.wallet_id) ?? 0) - ws.amount)
        })
      } else if (tx.wallet_id) {
        // Single wallet: deduct full amount
        balances.set(tx.wallet_id, (balances.get(tx.wallet_id) ?? 0) - tx.amount)
      }
    }
    // Transfer
    if (tx.type === 'transfer') {
      if (tx.wallet_id) balances.set(tx.wallet_id, (balances.get(tx.wallet_id) ?? 0) - tx.amount)
      if (tx.transfer_wallet_id) balances.set(tx.transfer_wallet_id, (balances.get(tx.transfer_wallet_id) ?? 0) + tx.amount)
    }
  })
  return balances
}

export function getMerchantSuggestion(description: string, transactions: Transaction[]) {
  const query = description.trim().toLowerCase()
  if (query.length < 3) return null
  const matches = transactions.filter(tx =>
    tx.type !== 'transfer' &&
    (tx.description.toLowerCase().includes(query) || query.includes(tx.description.toLowerCase()))
  )
  if (!matches.length) return null
  const ranked = matches.reduce((map, tx) => {
    const key = `${tx.type}|${tx.category}|${tx.wallet_id ?? ''}`
    const current = map.get(key) ?? { tx, score: 0 }
    map.set(key, { tx, score: current.score + 1 })
    return map
  }, new Map<string, { tx: Transaction; score: number }>())
  const best = [...ranked.values()].sort((a, b) => b.score - a.score)[0].tx
  return { category: best.category, wallet_id: best.wallet_id ?? undefined, type: best.type }
}

export function getRecurringCandidates(transactions: Transaction[]) {
  const grouped = new Map<string, Transaction[]>()
  transactions
    .filter(tx => tx.type !== 'income' && tx.type !== 'transfer')
    .forEach(tx => grouped.set(tx.description.toLowerCase(), [...(grouped.get(tx.description.toLowerCase()) ?? []), tx]))

  return [...grouped.entries()]
    .map(([, rows]) => {
      const average = rows.reduce((sum, tx) => sum + tx.amount, 0) / rows.length
      const stable = rows.filter(tx => Math.abs(tx.amount - average) / Math.max(1, average) <= 0.18)
      return {
        description: rows[0].description,
        category: rows[0].category,
        amount: Math.round(average),
        count: rows.length,
        stableCount: stable.length,
      }
    })
    .filter(item => item.count >= 3 && item.stableCount >= 2)
    .sort((a, b) => b.count - a.count)
}

export function getCategoryInsights(transactions: Transaction[], categories: BudgetCategory[], today = new Date()) {
  const expenses = transactions.filter(tx => tx.type !== 'income' && tx.type !== 'transfer')
  return categories
    .map(category => {
      const periodExpenses = expenses
        .filter(tx => tx.category === category.name && isInBudgetPeriod(tx.date, category.budget_period ?? 'monthly'))
        .reduce((sum, tx) => sum + tx.amount, 0)
      const limit = category.yearly_allocated
      const usedPct = limit > 0 ? Math.round((periodExpenses / limit) * 100) : 0
      const dayOfMonth = today.getDate()
      const expectedMonthlyPct = Math.round((dayOfMonth / new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()) * 100)
      const overPace = category.budget_period === 'monthly' && usedPct > expectedMonthlyPct + 15
      const paceGap = overPace ? usedPct - expectedMonthlyPct : 0
      const message = (() => {
        if (limit <= 0) return `${category.name} has spending but no budget set — consider adding a limit.`
        if (category.budget_period === 'monthly') {
          if (overPace) return `${category.name} is at ${usedPct}% of its monthly limit but you're only ${expectedMonthlyPct}% through the month — ${paceGap}% over pace.`
          return `${category.name} is at ${usedPct}% of its monthly limit with ${100 - expectedMonthlyPct}% of the month still ahead.`
        }
        return `${category.name} is at ${usedPct}% of its yearly limit.`
      })()
      return {
        category: category.name,
        spent: periodExpenses,
        limit,
        usedPct,
        overPace,
        message,
      }
    })
    .filter(item => item.spent > 0 || item.limit > 0)
    .sort((a, b) => Number(b.overPace) - Number(a.overPace) || b.spent - a.spent)
}
