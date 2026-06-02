import type { Wallet } from '@/types'

const TWD_TENDER_DENOMINATIONS = [50, 100, 200, 500, 1000]

export function pickQuickAddWallet(wallets: Wallet[], lastWalletId: string | null, preferCash: boolean): Wallet | null {
  if (wallets.length === 0) return null

  if (preferCash) {
    const rolePreferred = wallets.find(wallet =>
      wallet.type === 'cash' && (wallet.cash_role === 'notes' || wallet.cash_role === 'mixed')
    )
    if (rolePreferred) return rolePreferred

    const anyCash = wallets.find(wallet => wallet.type === 'cash')
    if (anyCash) return anyCash
  }

  const saved = lastWalletId ? wallets.find(wallet => wallet.id === lastWalletId) : null
  return saved ?? wallets[0]
}

export function getTwdTenderOptions(amount: number): number[] {
  if (!Number.isFinite(amount) || amount <= 0) return TWD_TENDER_DENOMINATIONS

  const options = TWD_TENDER_DENOMINATIONS.filter(denomination => denomination >= amount)
  if (options.length > 0) return options

  return [Math.ceil(amount / 1000) * 1000]
}
