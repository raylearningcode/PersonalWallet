import { useMemo } from 'react'
import { Label } from '@/components/ui/label'
import { MoneyField } from '@/components/mobile/MoneyField'
import { useMoney } from '@/lib/currency'
import { formatNumberInput, parseNumberInput } from '@/lib/numberInput'
import { splitChangeByPolicy, getFiftyCoinRouting } from '@/lib/cashChange'
import { buildCashPaymentPreview } from '@/lib/cashPaymentPreview'
import { getTwdTenderOptions } from '@/lib/quickAdd'
import { AlertTriangle } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Transaction, Wallet } from '@/types'

export interface CashChangeAssistantProps {
  cashEnabled: boolean
  cashTendered: string
  walletId: string
  inputCurrency: string
  amount: string
  changeBillsWalletId: string
  changeCoinsWalletId: string
  wallets: Wallet[]
  walletBalances?: Map<string, number>
  previousTransactions?: Transaction[]
  category?: string
  setCashEnabled: (v: boolean | ((prev: boolean) => boolean)) => void
  setCashTendered: (v: string) => void
  setChangeBillsWalletId: (v: string) => void
  setChangeCoinsWalletId: (v: string) => void
  onClose?: () => void
}

export function CashChangeAssistant({
  cashEnabled,
  cashTendered,
  walletId,
  inputCurrency,
  amount,
  changeBillsWalletId,
  changeCoinsWalletId,
  wallets,
  walletBalances,
  previousTransactions = [],
  category,
  setCashEnabled,
  setCashTendered,
  setChangeBillsWalletId,
  setChangeCoinsWalletId,
  onClose,
}: CashChangeAssistantProps) {
  const money = useMoney()
  const effectiveWalletBalances = useMemo(() => {
    const m = new Map<string, number>()
    wallets.forEach(w => m.set(w.id, walletBalances?.get(w.id) ?? w.balance ?? 0))
    return m
  }, [walletBalances, wallets])
  const selectedWallet = wallets.find(w => w.id === walletId)
  const otherWallets = wallets.filter(w => w.id !== walletId)
  const parsedExpense = parseNumberInput(amount)
  const parsedTenderedVal = parseNumberInput(cashTendered)
  const changeAmount = cashEnabled && Number.isFinite(parsedTenderedVal) && parsedTenderedVal > parsedExpense
    ? parsedTenderedVal - parsedExpense : 0
  const isUnderpay = cashEnabled && Number.isFinite(parsedTenderedVal) && parsedTenderedVal > 0 && parsedTenderedVal < parsedExpense
  const isTWD = inputCurrency === 'TWD'
  const walletCurrentBal = effectiveWalletBalances.get(walletId) ?? 0
  const { bills: billsChange, coins: coinsChange } = isTWD
    ? splitChangeByPolicy(changeAmount, { currency: 'TWD', routeFiftyCoinTo: getFiftyCoinRouting() })
    : { bills: 0, coins: changeAmount }
  const twdChips = getTwdTenderOptions(parsedExpense)
  const hasBills = billsChange > 0
  const hasCoins = coinsChange > 0
  const showChips = isTWD
  const preview = useMemo(() => buildCashPaymentPreview({
    wallets,
    walletBalances: effectiveWalletBalances,
    walletId,
    amount: parsedExpense,
    tendered: parsedTenderedVal,
    inputCurrency,
    changeBillsWalletId,
    changeCoinsWalletId,
    previousTransactions,
    routeFiftyCoinTo: getFiftyCoinRouting(),
    toBase: money.toBase,
  }), [
    changeBillsWalletId,
    changeCoinsWalletId,
    effectiveWalletBalances,
    inputCurrency,
    money.toBase,
    parsedExpense,
    parsedTenderedVal,
    previousTransactions,
    walletId,
    wallets,
  ])
  const formatDelta = (delta: number) => {
    if (Math.abs(delta) < 0.005) return 'No change'
    const sign = delta > 0 ? '+' : '-'
    return `${sign}${money.formatDisplay(Math.abs(delta))}`
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <span>
          <span className="block text-sm font-extrabold text-foreground">Cash payment</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">Enter the cash received and where change goes.</span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={cashEnabled}
          aria-label="Enable cash change tracking"
          onClick={() => {
            const next = !cashEnabled
            setCashEnabled(next)
            if (next) {
              const coinsWallet = otherWallets.find(w => w.cash_role === 'coins')
              setChangeCoinsWalletId(coinsWallet?.id ?? otherWallets[0]?.id ?? '')
              const billsWallet = otherWallets.find(w => w.cash_role === 'notes' || w.cash_role === 'mixed')
              setChangeBillsWalletId(billsWallet?.id ?? '')
              if (!cashTendered && parsedExpense > 0 && isTWD) {
                setCashTendered(String(getTwdTenderOptions(parsedExpense)[0]))
              }
            } else {
              setCashTendered('')
            }
          }}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${cashEnabled ? 'bg-primary' : 'bg-muted'}`}
        >
          <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${cashEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
      </div>

      {cashEnabled && (
        <div className="mt-4 space-y-3">
          <div>
            <Label className="text-xs font-bold text-muted-foreground">Cash received ({inputCurrency})</Label>
            <MoneyField
              value={cashTendered}
              onChange={v => setCashTendered(formatNumberInput(v))}
              currency={inputCurrency}
              ariaLabel="Cash given"
              className="mt-2 h-12 bg-secondary text-base font-extrabold"
              placeholder="Amount received"
            />
            {showChips && (
              <div className="mt-2 grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setCashTendered(parsedExpense > 0 ? String(parsedExpense) : '')}
                  className="min-h-[46px] rounded-xl border border-border bg-secondary px-3 text-sm font-bold text-foreground transition-colors hover:border-primary hover:text-primary"
                >
                  Exact
                </button>
                {twdChips.map(chip => {
                  const selected = parsedTenderedVal === chip
                  return (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setCashTendered(String(chip))}
                      className={`min-h-[46px] rounded-xl border px-3 text-sm font-bold transition-colors ${selected ? 'border-primary bg-primary/15 text-primary' : 'border-border bg-secondary text-foreground hover:border-primary hover:text-primary'}`}
                    >
                      NT${chip.toLocaleString()}
                    </button>
                  )
                })}
                <button
                  type="button"
                  onClick={() => { setCashTendered(''); setTimeout(() => (document.querySelector('[aria-label="Cash given"]') as HTMLInputElement | null)?.focus(), 50) }}
                  className="min-h-[46px] rounded-xl border border-border bg-secondary px-3 text-sm font-bold text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                >
                  Custom
                </button>
              </div>
            )}
            {isUnderpay && (
              <p className="mt-2 flex items-center gap-1.5 text-xs font-bold text-[#FF8388]"><AlertTriangle className="h-3 w-3 shrink-0" /> Cash given must be at least the expense amount</p>
            )}
            {!isUnderpay && Number.isFinite(parsedTenderedVal) && parsedTenderedVal > 0 && walletCurrentBal < money.toBase(parsedTenderedVal, inputCurrency) && (
              <p className="mt-2 flex items-center gap-1.5 text-xs font-bold text-[#FFCF73]"><AlertTriangle className="h-3 w-3 shrink-0" /> Wallet balance {money.formatBase(walletCurrentBal)} may be lower than cash given</p>
            )}
            {Number.isFinite(parsedTenderedVal) && parsedTenderedVal >= parsedExpense && parsedTenderedVal > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-border bg-secondary px-3 py-2">
                  <p className="text-[10px] font-extrabold uppercase text-muted-foreground">Expense</p>
                  <p className="mt-1 text-sm font-extrabold text-foreground">{money.format(parsedExpense, inputCurrency)}</p>
                </div>
                <div className="rounded-xl border border-border bg-secondary px-3 py-2">
                  <p className="text-[10px] font-extrabold uppercase text-muted-foreground">Change</p>
                  <p className="mt-1 text-sm font-extrabold text-primary">{money.format(changeAmount, inputCurrency)}</p>
                </div>
              </div>
            )}
          </div>

          {changeAmount > 0 && isTWD && hasBills && hasCoins && (
            <>
              <div>
                <Label className="text-xs font-bold text-muted-foreground">
                  Bills stay in
                </Label>
                <select
                  aria-label="Bills change destination wallet"
                  className="mt-2 h-11 w-full rounded-md border border-input bg-secondary px-3 text-sm font-bold text-foreground outline-none"
                  value={changeBillsWalletId}
                  onChange={e => setChangeBillsWalletId(e.target.value)}
                >
                  <option value="">Keep in {selectedWallet?.name}</option>
                  {otherWallets.map(w => <option key={w.id} value={w.id} disabled={w.id === walletId}>{w.name}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs font-bold text-muted-foreground">
                  Coins go to
                </Label>
                <select
                  aria-label="Coins change destination wallet"
                  className="mt-2 h-11 w-full rounded-md border border-input bg-secondary px-3 text-sm font-bold text-foreground outline-none"
                  value={changeCoinsWalletId}
                  onChange={e => setChangeCoinsWalletId(e.target.value)}
                >
                  {otherWallets.map(w => (
                    <option key={w.id} value={w.id} disabled={w.id === walletId}>{w.name}{w.cash_role === 'coins' ? ' · coin pouch' : ''}</option>
                  ))}
                </select>
              </div>
            </>
          )}
          {changeAmount > 0 && isTWD && hasBills && !hasCoins && (
            <div>
              <Label className="text-xs font-bold text-muted-foreground">
                Bills stay in
              </Label>
              <select
                aria-label="Bills change destination wallet"
                className="mt-2 h-11 w-full rounded-md border border-input bg-secondary px-3 text-sm font-bold text-foreground outline-none"
                value={changeBillsWalletId}
                onChange={e => setChangeBillsWalletId(e.target.value)}
              >
                <option value="">Keep in {selectedWallet?.name}</option>
                {otherWallets.map(w => <option key={w.id} value={w.id} disabled={w.id === walletId}>{w.name}</option>)}
              </select>
            </div>
          )}
          {changeAmount > 0 && isTWD && !hasBills && hasCoins && (
            <div>
              <Label className="text-xs font-bold text-muted-foreground">
                Coins go to
              </Label>
              <select
                aria-label="Coins change destination wallet"
                className="mt-2 h-11 w-full rounded-md border border-input bg-secondary px-3 text-sm font-bold text-foreground outline-none"
                value={changeCoinsWalletId}
                onChange={e => setChangeCoinsWalletId(e.target.value)}
              >
                {otherWallets.map(w => (
                  <option key={w.id} value={w.id} disabled={w.id === walletId}>{w.name}{w.cash_role === 'coins' ? ' · coin pouch' : ''}</option>
                ))}
              </select>
            </div>
          )}
          {changeAmount > 0 && !isTWD && (
            <div>
              <Label className="text-xs font-bold text-muted-foreground">
                Change goes to
              </Label>
              <select
                aria-label="Change destination wallet"
                className="mt-2 h-11 w-full rounded-md border border-input bg-secondary px-3 text-sm font-bold text-foreground outline-none"
                value={changeCoinsWalletId}
                onChange={e => setChangeCoinsWalletId(e.target.value)}
              >
                <option value="">Keep in same wallet (no transfer)</option>
                {otherWallets.map(w => (
                  <option key={w.id} value={w.id} disabled={w.id === walletId}>{w.name}{w.cash_role === 'coins' ? ' · coin pouch' : ''}</option>
                ))}
              </select>
            </div>
          )}

          {changeAmount > 0 && otherWallets.length === 0 && (
            <Link
              to="/settings?section=wallets"
              onClick={onClose}
              className="flex items-center justify-between rounded-xl border border-[#FFCF73]/30 bg-[#FFCF73]/5 px-3 py-2.5 text-xs font-bold text-[#FFCF73] hover:bg-[#FFCF73]/10"
            >
              <span className="flex items-center gap-1.5"><AlertTriangle className="h-3 w-3 shrink-0" /> Set up a coin pouch wallet to route change automatically</span>
              <span className="ml-2 shrink-0">Settings →</span>
            </Link>
          )}

          {Number.isFinite(parsedTenderedVal) && parsedTenderedVal >= parsedExpense && parsedTenderedVal > 0 && (
            <div className="rounded-xl border border-border bg-secondary/60 p-4 space-y-3">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">After save</p>
              <div className="space-y-2 text-sm">
                {preview.rows.map(row => (
                  <div key={row.walletId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg bg-background/40 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate font-bold text-foreground">{row.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{money.formatDisplay(row.before)} → {money.formatDisplay(row.after)}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${row.delta > 0 ? 'bg-primary/10 text-primary' : row.delta < 0 ? 'bg-[#FF8388]/10 text-[#FF8388]' : 'bg-muted text-muted-foreground'}`}>
                      {formatDelta(row.delta)}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-3 border-t border-border pt-2 text-sm">
                  <span className="text-muted-foreground">{category ?? 'Expense'} recorded</span>
                  <span className="font-extrabold text-primary">{money.format(parsedExpense, inputCurrency)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
