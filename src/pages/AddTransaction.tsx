import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ScanLine, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  useAddTransaction,
  useUpdateTransaction,
  useDeleteTransaction,
  useAddRecurringRule,
  useBudgetCategories,
  useTransactions,
  useWallets,
} from '@/lib/queries'
import { CURRENCIES, useMoney } from '@/lib/currency'
import { parseNumberInput } from '@/lib/numberInput'
import { getMerchantSuggestion } from '@/lib/financeOs'
import { hapticSuccess } from '@/lib/haptics'
import { planCashChange, buildChangeTransferPayloads } from '@/lib/cashSave'
import { pickQuickAddWallet } from '@/lib/quickAdd'
import { scanReceipt, isAiConfigured } from '@/lib/ai'
import { todayLocal } from '@/lib/utils'
import { useIsDesktop } from '@/hooks/useIsDesktop'
import { MoneyField } from '@/components/mobile/MoneyField'
import { CashChangeAssistant } from '@/components/transactions/CashChangeAssistant'
import { toast } from 'sonner'

const INCOME_CATEGORIES = ['Wage', 'Gift', 'Refund', 'Allowance', 'Other income']
type EntryType = 'income' | 'expense' | 'transfer'

const LAST_CATEGORY_KEY = 'finpath_last_category'
const LAST_WALLET_KEY = 'finpath_last_wallet'

export function AddTransaction() {
  const navigate = useNavigate()
  const isDesktop = useIsDesktop()
  const [searchParams] = useSearchParams()
  const money = useMoney()
  const { data: categories = [] } = useBudgetCategories()
  const { data: wallets = [] } = useWallets()
  const { data: transactions = [] } = useTransactions()
  const addTransaction = useAddTransaction()
  const updateTransaction = useUpdateTransaction()
  const deleteTransaction = useDeleteTransaction()
  const addRecurringRule = useAddRecurringRule()

  const redirectedRef = useRef(false)
  useEffect(() => {
    if (isDesktop && !redirectedRef.current) {
      redirectedRef.current = true
      navigate('/transactions', { replace: true })
    }
  }, [isDesktop, navigate])

  const paramType = searchParams.get('type') as EntryType | null
  const paramCash = searchParams.get('cash') === 'true'

  const [type, setType] = useState<EntryType>(paramType ?? 'expense')
  const [amount, setAmount] = useState('')
  const [inputCurrency, setInputCurrency] = useState(money.displayCurrency)
  const [date, setDate] = useState(todayLocal)
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [walletId, setWalletId] = useState('')
  const [transferWalletId, setTransferWalletId] = useState('')
  const [scanning, setScanning] = useState(false)

  // Cash-change assistant state
  const [cashEnabled, setCashEnabled] = useState(paramCash)
  const [cashTendered, setCashTendered] = useState('')
  const [changeCoinsWalletId, setChangeCoinsWalletId] = useState('')
  const [changeBillsWalletId, setChangeBillsWalletId] = useState('')

  // Whether the ?cash=true initial cash state has already been applied (open-once
  // semantics, like QuickAddSheet's initialCash) — wallet changes must never
  // force cash back on and fight the user's manual toggle.
  const initialCashAppliedRef = useRef(false)

  const receiptInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setInputCurrency(money.displayCurrency)
  }, [money.displayCurrency])

  useEffect(() => {
    if (!walletId && wallets.length > 0) {
      const last = localStorage.getItem(LAST_WALLET_KEY)
      setWalletId(pickQuickAddWallet(wallets, last, paramCash)?.id ?? '')
    }
    if (!transferWalletId && wallets.length > 1) setTransferWalletId(wallets[1].id)
  }, [wallets, walletId, transferWalletId, paramCash])

  useEffect(() => {
    if (!category && categories.length > 0) {
      const last = localStorage.getItem(LAST_CATEGORY_KEY)
      const found = last ? categories.find(c => c.name === last) : null
      setCategory(found ? found.name : categories[0].name)
    }
  }, [categories, category])

  useEffect(() => {
    if (!paramCash || wallets.length === 0) return
    // Apply the ?cash=true enablement only once (open semantics) and only for
    // a cash wallet — the switch UI (showCashAssistant) requires a cash
    // wallet, so forcing cashEnabled on for any other wallet would trap every
    // save behind "Enter the cash amount given" with no way to turn it off.
    const selected = wallets.find(w => w.id === walletId)
    if (!initialCashAppliedRef.current && selected?.type === 'cash') {
      initialCashAppliedRef.current = true
      setCashEnabled(true)
    }
    const coinsWallet = wallets.find(w => w.cash_role === 'coins')
    const billsWallet = wallets.find(w => w.cash_role === 'notes' || w.cash_role === 'mixed')
    const otherWallets = wallets.filter(w => w.id !== walletId)
    setChangeCoinsWalletId(coinsWallet?.id ?? otherWallets[0]?.id ?? '')
    setChangeBillsWalletId(billsWallet?.id ?? '')
  }, [paramCash, wallets, walletId])

  const merchantSuggestion = useMemo(
    () => type === 'transfer' ? null : getMerchantSuggestion(description, transactions),
    [description, transactions, type]
  )

  const selectedWallet = wallets.find(w => w.id === walletId) ?? null
  const showCashAssistant = type === 'expense' && selectedWallet?.type === 'cash'

  const cannotSaveTransfer =
    type === 'transfer' &&
    (wallets.length < 2 || !walletId || !transferWalletId || walletId === transferWalletId)

  const reset = () => {
    setAmount('')
    setInputCurrency(money.displayCurrency)
    setDate(todayLocal())
    setDescription('')
    setCategory(categories[0]?.name ?? '')
    setWalletId(wallets[0]?.id ?? '')
    setTransferWalletId(wallets[1]?.id ?? '')
    setCashEnabled(false)
    setCashTendered('')
    setChangeCoinsWalletId('')
    setChangeBillsWalletId('')
  }

  const handleReceiptImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!isAiConfigured()) {
      toast.error('Set up your AI API in Settings → AI Features to use receipt scanning')
      return
    }
    setScanning(true)
    try {
      const reader = new FileReader()
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const result = await scanReceipt(base64, file.type)
      if (result.description) setDescription(result.description)
      if (result.amount) setAmount(result.amount)
      if (result.date) setDate(result.date)
      if (result.category) {
        const matched = categories.find(c => c.name.toLowerCase() === result.category.toLowerCase())
        if (matched) setCategory(matched.name)
      }
      toast.success('Receipt scanned — review and confirm')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Receipt scan failed')
    } finally {
      setScanning(false)
      if (receiptInputRef.current) receiptInputRef.current.value = ''
    }
  }

  const handleSave = async () => {
    const parsedAmount = parseNumberInput(amount)
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error('Please enter a valid amount')
      return
    }
    if (cannotSaveTransfer) {
      toast.error('Select two different wallets for a transfer')
      return
    }
    const selectedCategory = type === 'income' ? (category || INCOME_CATEGORIES[0]) : category
    if (type !== 'transfer' && !walletId) {
      toast.error('Please select a wallet')
      return
    }

    // Cash validation — only when the cash UI is actually shown (cash wallet):
    // a cash-enabled state with a non-cash wallet has no switch to turn it
    // off, so it must never block the save.
    const parsedTendered = cashEnabled ? parseNumberInput(cashTendered) : 0
    if (cashEnabled && showCashAssistant && Number.isFinite(parsedTendered) && parsedTendered > 0 && parsedTendered < parsedAmount) {
      toast.error('Cash given must be at least the expense amount')
      return
    }
    if (cashEnabled && showCashAssistant && (!Number.isFinite(parseNumberInput(cashTendered)) || parseNumberInput(cashTendered) <= 0)) {
      toast.error('Enter the cash amount given'); return
    }

    const safeDescription = description.trim() ||
      (type === 'transfer' ? 'Transfer' :
       type === 'income' ? `${selectedCategory || 'Income'} income` :
       `${selectedCategory || 'Expense'} expense`)

    const baseAmount = money.toBase(parsedAmount, inputCurrency)
    const baseTendered = cashEnabled ? money.toBase(parsedTendered, inputCurrency) : 0
    const baseChange = Math.max(0, baseTendered - baseAmount)

    const payload = {
      description: safeDescription,
      amount: baseAmount,
      original_amount: parsedAmount,
      original_currency: inputCurrency,
      type,
      category: type === 'transfer' ? 'Transfer' : (selectedCategory || 'Other'),
      wallet_id: walletId || null,
      transfer_wallet_id: type === 'transfer' ? transferWalletId : null,
      recurring_rule_id: null,
      recurring_due_date: null,
      date,
      needs_review: false,
      cash_tendered: cashEnabled && baseTendered > 0 ? baseTendered : null,
    }

    try {
      const savedTx = await addTransaction.mutateAsync(payload)

      // Create cash-change transfer(s)
      const changeTxIds: string[] = []
      if (cashEnabled && baseChange > 0 && savedTx?.id) {
        const plan = planCashChange(parsedAmount, parsedTendered, inputCurrency)
        const changePayloads = buildChangeTransferPayloads({
          savedTxId: savedTx.id, safeDescription, walletId,
          changeBillsWalletId, changeCoinsWalletId,
          plan, date, inputCurrency,
          toBase: money.toBase,
        })
        for (const p of changePayloads) {
          try {
            const created = await addTransaction.mutateAsync(p as Parameters<typeof addTransaction.mutateAsync>[0])
            if (created?.id) changeTxIds.push(created.id)
          } catch (err) {
            console.error('Failed to create change transfer:', err)
            toast.error('Failed to route change')
          }
        }
        if (changeTxIds.length > 0) {
          try { await updateTransaction.mutateAsync({ id: savedTx.id, linked_transaction_id: changeTxIds[0] }) }
          catch { /* link failure is non-fatal */ }
        }
      }

      if (walletId) localStorage.setItem(LAST_WALLET_KEY, walletId)
      if (selectedCategory) localStorage.setItem(LAST_CATEGORY_KEY, selectedCategory)

      hapticSuccess()
      if (cashEnabled && changeTxIds.length > 0 && savedTx?.id) {
        const allIds = [savedTx.id, ...changeTxIds]
        toast.success('Cash payment saved · change routed', {
          duration: 8000,
          action: {
            label: 'Undo',
            onClick: async () => {
              for (const id of allIds) await deleteTransaction.mutateAsync(id)
              toast.success('Cash payment undone')
            },
          },
        })
      } else {
        toast.success('Transaction added')
      }
      // Go back to where the user came from; fall back to history if opened directly.
      if (window.history.length > 1) navigate(-1)
      else navigate('/transactions', { replace: true })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save transaction')
    }
  }

  if (isDesktop) return null

  return (
    <div>
      {/* ── Page header — bleed full width past AppLayout padding ── */}
      <div className="-mx-4 -mt-6 mb-5 flex items-center gap-2 border-b border-border bg-background px-4 py-3 sm:-mx-6 sm:px-6">
        <button
          type="button"
          aria-label="Go back"
          onClick={() => navigate(-1)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors active:bg-muted/40 hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>

        {/* Type toggle */}
        <div className="flex flex-1 justify-center">
          <div className="inline-flex rounded-full border border-border bg-secondary p-1">
            {(['expense', 'income', 'transfer'] as const).map(t => (
              <button
                key={t}
                type="button"
                aria-label={t[0].toUpperCase() + t.slice(1)}
                onClick={() => {
                  setType(t)
                  setCategory(t === 'income' ? INCOME_CATEGORIES[0] : categories[0]?.name ?? '')
                  setCashEnabled(false)
                  setCashTendered('')
                }}
                className={`rounded-full px-4 py-1.5 text-sm font-extrabold capitalize transition-colors ${
                  type === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={reset}
          className="shrink-0 rounded-full px-3 py-1.5 text-xs font-bold text-muted-foreground transition-colors active:bg-muted/40 hover:text-foreground"
        >
          Clear all
        </button>
      </div>

      {/* ── Amount section ── */}
      <div className="mb-5 rounded-2xl border border-border bg-card px-4 pb-5 pt-6 text-center">
        <div className="mb-1 flex items-center justify-center gap-2">
          <select
            aria-label="Input currency"
            className="cursor-pointer rounded-full border-0 bg-transparent text-lg font-bold text-muted-foreground outline-none"
            value={inputCurrency}
            onChange={e => { e.stopPropagation(); setInputCurrency(e.target.value) }}
            onClick={e => e.stopPropagation()}
          >
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <MoneyField
            value={amount}
            onChange={setAmount}
            currency={inputCurrency}
            ariaLabel="Amount"
            className="h-16 w-48 cursor-pointer border-0 bg-transparent text-center text-5xl font-extrabold shadow-none focus-visible:ring-0"
            keypadDoneLabel="Confirm amount"
          />
        </div>

        <Input
          aria-label="Date"
          className="mx-auto mt-2 max-w-[190px] rounded-full bg-secondary text-center text-sm"
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          onClick={e => e.stopPropagation()}
        />
      </div>

      {/* ── Form fields ── */}
      <div className="space-y-4 pb-28">

        {/* Merchant / description */}
        <div>
          <Label className="text-sm font-bold text-foreground">
            {type === 'transfer' ? 'Transfer note' : 'Merchant / note'}
          </Label>
          <div className="mt-2 flex items-center gap-2">
            <Input
              aria-label={type === 'transfer' ? 'Transfer note' : 'Merchant name'}
              className="flex-1 bg-secondary"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder={type === 'transfer' ? 'Optional note' : 'Merchant name (optional)'}
            />
            <button
              type="button"
              aria-label="Scan receipt"
              onClick={() => receiptInputRef.current?.click()}
              disabled={scanning}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-secondary text-muted-foreground transition-colors hover:text-primary disabled:opacity-50"
            >
              {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
            </button>
            <input
              ref={receiptInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleReceiptImage}
            />
          </div>
          {merchantSuggestion && (
            <button
              type="button"
              className="mt-2 rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-bold text-primary"
              onClick={() => {
                setCategory(merchantSuggestion.category)
                if (merchantSuggestion.wallet_id) setWalletId(merchantSuggestion.wallet_id)
                setType(
                  merchantSuggestion.type === 'income' || merchantSuggestion.type === 'transfer'
                    ? merchantSuggestion.type
                    : 'expense'
                )
              }}
            >
              Use suggestion: {merchantSuggestion.category}
            </button>
          )}
        </div>

        {/* Category */}
        {type !== 'transfer' && (
          <div>
            <Label className="text-sm font-bold text-foreground">Category</Label>
            {type !== 'income' && categories.length === 0 ? (
              <Link
                to="/budget"
                className="mt-2 flex h-11 items-center justify-between rounded-md border border-primary/30 bg-primary/5 px-3 text-sm font-bold text-primary hover:bg-primary/10"
              >
                <span>No categories yet</span>
                <span>Set up now →</span>
              </Link>
            ) : type === 'income' ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {INCOME_CATEGORIES.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    className={`rounded-full px-3.5 py-2 text-sm font-bold transition-colors ${category === c ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {categories.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCategory(c.name)}
                    className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-bold transition-colors ${category === c.name ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}
                  >
                    {c.icon
                      ? <span className="leading-none">{c.icon}</span>
                      : <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />}
                    {c.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Wallet(s) */}
        {type !== 'transfer' ? (
          <div>
            <Label className="text-sm font-bold text-foreground">Wallet</Label>
            {wallets.length === 0 ? (
              <Link
                to="/settings"
                className="mt-2 flex h-11 items-center justify-between rounded-md border border-primary/30 bg-primary/5 px-3 text-sm font-bold text-primary hover:bg-primary/10"
              >
                <span>No wallets yet</span>
                <span>Add one →</span>
              </Link>
            ) : wallets.length <= 5 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {wallets.map(w => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => { setWalletId(w.id); setCashEnabled(false); setCashTendered('') }}
                    className={`rounded-full px-3 py-1.5 text-sm font-bold transition-colors ${
                      walletId === w.id ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {w.name}
                  </button>
                ))}
              </div>
            ) : (
              <select
                aria-label="Wallet"
                className="mt-2 h-11 w-full rounded-md border border-input bg-secondary px-3 text-sm font-bold text-foreground outline-none"
                value={walletId || wallets[0]?.id || ''}
                onChange={e => { setWalletId(e.target.value); setCashEnabled(false); setCashTendered('') }}
              >
                {wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            )}
          </div>
        ) : (
          wallets.length < 2 ? (
            <Link to="/settings" className="flex h-11 items-center justify-between rounded-md border border-primary/30 bg-primary/5 px-3 text-sm font-bold text-primary">
              <span>Add at least 2 wallets for transfer</span>
              <span>Settings →</span>
            </Link>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm font-bold text-foreground">From</Label>
                <select
                  aria-label="From wallet"
                  className="mt-2 h-11 w-full rounded-md border border-input bg-secondary px-3 text-sm font-bold text-foreground outline-none"
                  value={walletId}
                  onChange={e => setWalletId(e.target.value)}
                >
                  {wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-sm font-bold text-foreground">To</Label>
                <select
                  aria-label="To wallet"
                  className="mt-2 h-11 w-full rounded-md border border-input bg-secondary px-3 text-sm font-bold text-foreground outline-none"
                  value={transferWalletId}
                  onChange={e => setTransferWalletId(e.target.value)}
                >
                  {wallets.map(w => <option key={w.id} value={w.id} disabled={w.id === walletId}>{w.name}</option>)}
                </select>
              </div>
            </div>
          )
        )}

        {/* ── Cash change assistant ── */}
        {showCashAssistant && (
          <CashChangeAssistant
            cashEnabled={cashEnabled}
            cashTendered={cashTendered}
            walletId={walletId}
            inputCurrency={inputCurrency}
            amount={amount}
            changeBillsWalletId={changeBillsWalletId}
            changeCoinsWalletId={changeCoinsWalletId}
            wallets={wallets}
            setCashEnabled={setCashEnabled}
            setCashTendered={setCashTendered}
            setChangeBillsWalletId={setChangeBillsWalletId}
            setChangeCoinsWalletId={setChangeCoinsWalletId}
          />
        )}

      </div>

      {/* ── Fixed: Save button ── */}
      <div
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background px-4 pt-3 lg:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 12px)' }}
      >
        {wallets.length === 0 ? (
          <Link
            to="/settings"
            className="flex h-14 w-full items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary transition-colors hover:bg-primary/20"
          >
            Add a wallet to get started →
          </Link>
        ) : type === 'expense' && categories.length === 0 ? (
          <Link
            to="/budget"
            className="flex h-14 w-full items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary transition-colors hover:bg-primary/20"
          >
            Add a budget category first →
          </Link>
        ) : (
          <Button
            className="h-14 w-full text-base font-extrabold"
            onClick={handleSave}
            disabled={
              addTransaction.isPending ||
              addRecurringRule.isPending ||
              parseNumberInput(amount) <= 0 ||
              cannotSaveTransfer
            }
          >
            {addTransaction.isPending ? 'Saving…' : 'Save transaction'}
          </Button>
        )}
      </div>
    </div>
  )
}
