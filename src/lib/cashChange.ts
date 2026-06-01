export interface CashChangeResult {
  valid: boolean
  change: number
}

export interface TwdChangeSplit {
  bills: number
  coins: number
}

export function calculateCashChange(amount: number, tendered: number): CashChangeResult {
  if (tendered < amount) return { valid: false, change: 0 }
  return { valid: true, change: tendered - amount }
}

/**
 * Split TWD change into NT$100+ bills and sub-NT$100 coins.
 * For other currencies, returns entire amount as coins.
 */
export function splitTwdChange(change: number): TwdChangeSplit {
  const bills = Math.floor(change / 100) * 100
  const coins = change - bills
  return { bills, coins }
}
