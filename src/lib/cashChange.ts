export interface CashChangeResult {
  valid: boolean
  change: number
}

export interface TwdChangeSplit {
  bills: number
  coins: number
}

export type FiftyCoinRouting = 'coins' | 'notes' | 'all-coins'

export interface CashPolicy {
  currency: string
  routeFiftyCoinTo: FiftyCoinRouting
}

export function calculateCashChange(amount: number, tendered: number): CashChangeResult {
  if (!Number.isFinite(amount) || !Number.isFinite(tendered)) return { valid: false, change: 0 }
  if (tendered < amount) return { valid: false, change: 0 }
  return { valid: true, change: tendered - amount }
}

/**
 * Split TWD change into NT$100+ bills and sub-NT$100 coins.
 * routeFiftyCoin: whether NT$50 goes to the coin pouch ('coins') or main wallet ('notes').
 * For other currencies, returns entire amount as coins.
 */
export function splitTwdChange(change: number, routeFiftyCoin: FiftyCoinRouting = 'coins'): TwdChangeSplit {
  if (!Number.isFinite(change) || change <= 0) return { bills: 0, coins: 0 }
  if (routeFiftyCoin === 'all-coins') return { bills: 0, coins: change }
  if (routeFiftyCoin === 'notes') {
    const fifties = Math.floor((change % 100) / 50) * 50
    const bills = Math.floor(change / 100) * 100 + fifties
    const coins = change - bills
    return { bills, coins }
  }
  const bills = Math.floor(change / 100) * 100
  const coins = change - bills
  return { bills, coins }
}

export function splitChangeByPolicy(change: number, policy: CashPolicy): TwdChangeSplit {
  if (!Number.isFinite(change) || change <= 0) return { bills: 0, coins: 0 }
  if (policy.currency.toUpperCase() !== 'TWD') return { bills: 0, coins: change }
  return splitTwdChange(change, policy.routeFiftyCoinTo)
}

const FIFTY_ROUTING_KEY = 'finpath_cash_fifty_routing'

export function getFiftyCoinRouting(): FiftyCoinRouting {
  if (typeof localStorage === 'undefined') return 'coins'
  const stored = localStorage.getItem(FIFTY_ROUTING_KEY)
  return stored === 'notes' || stored === 'all-coins' ? stored : 'coins'
}

export function setFiftyCoinRouting(value: FiftyCoinRouting): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(FIFTY_ROUTING_KEY, value)
}
