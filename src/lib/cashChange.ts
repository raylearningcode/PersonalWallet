export interface CashChangeResult {
  valid: boolean
  change: number
}

export interface TwdChangeSplit {
  bills: number
  coins: number
}

export type FiftyCoinRouting = 'coins' | 'notes'

export function calculateCashChange(amount: number, tendered: number): CashChangeResult {
  if (tendered < amount) return { valid: false, change: 0 }
  return { valid: true, change: tendered - amount }
}

/**
 * Split TWD change into NT$100+ bills and sub-NT$100 coins.
 * routeFiftyCoin: whether NT$50 goes to the coin pouch ('coins') or main wallet ('notes').
 * For other currencies, returns entire amount as coins.
 */
export function splitTwdChange(change: number, routeFiftyCoin: FiftyCoinRouting = 'coins'): TwdChangeSplit {
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

const FIFTY_ROUTING_KEY = 'finpath_cash_fifty_routing'

export function getFiftyCoinRouting(): FiftyCoinRouting {
  const stored = localStorage.getItem(FIFTY_ROUTING_KEY)
  return stored === 'notes' ? 'notes' : 'coins'
}

export function setFiftyCoinRouting(value: FiftyCoinRouting): void {
  localStorage.setItem(FIFTY_ROUTING_KEY, value)
}
