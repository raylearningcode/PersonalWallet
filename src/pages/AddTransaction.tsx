import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ScanLine, Loader2, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'
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
import { splitChangeByPolicy, getFiftyCoinRouting } from '@/lib/cashChange'
import { getTwdTenderOptions, pickQuickAddWallet } from '@/lib/quickAdd'
import { scanReceipt, isAiConfigured } from '@/lib/ai'
import { MoneyKeypad } from '@/components/mobile/MoneyKeypad'
import { useIsDesktop } from '@/hooks/useIsDesktop'
import { toast } from 'sonner'

const INCOME_CATEGORIES = ['Wage', 'Gift', 'Refund', 'Allowance', 'Other income']
type EntryType = 'income' | 'expense' | 'transfer'
type ActiveKeypad = 'amount' | 'cash' | null

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
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [walletId, setWalletId] = useState('')
  const [transferWalletId, setTransferWalletId] = useState('')
  const [scanning, setScanning] = useState(false)
  const [showCashSection, setShowCashSection] = useState(paramCash)
  const [activeKeypad, setActiveKeypadRaw] = useState<ActiveKeypad>(null)

  const setActiveKeypad = (next: ActiveKeypad) => {
    setActiveKeypadRaw(next)
    window.dispatchEvent(new CustomEvent('finpath-keypad-change', { detail: { active: next !== null } }))
  }

  useEffect(() => {
    const handler = () => setActiveKeypad(null)
    window.addEventListener('finpath-close-keypad', handler)
    return () => window.removeEventListener('finpath-close-keypad', handler)
  }, [])

  const [cashEnabled, setCashEnabled] = useState(paramCash)
  const [cashTendered, setCashTendered] = useState('')
  const [changeCoinsWalletId, setChangeCoinsWalletId] = useState('')
  const [changeBillsWalletId, setChangeBillsWalletId] = useState('')

  const amountInputRef = useRef<HTMLInputElement>(null)
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
    if (paramCash && wallets.length > 0) {
      setCashEnabled(true)
      setShowCashSection(true)
      const coinsWallet = wallets.find(w => w.cash_role === 'coins')
      const billsWallet = wallets.find(w => w.cash_role === 'notes' || w.cash_role === 'mixed')
      const otherWallets = wallets.filter(w => w.id !== walletId)
      setChangeCoinsWalletId(coinsWallet?.id ?? otherWallets[0]?.id ?? '')
      setChangeBillsWalletId(billsWallet?.id ?? '')
    }
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
    setDate(new Date().toISOString().slice(0, 10))
    setDescription('')
    setCategory(categories[0]?.name ?? '')
    setWalletId(wallets[0]?.id ?? '')
    setTransferWalletId(wallets[1]?.id ?? '')
    setShowCashSection(false)
    setActiveKeypad(null)
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
      toast.success('Receipt scanned – review and confirm')
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
    if (type === 'expense' && !selectedCategory) {
      toast.error('Please select a category')
      return
    }

    const parsedTendered = cashEnabled ? parseNumberInput(cashTendered) : 0
    if (cashEnabled && type === 'expense' && Number.isFinite(parsedTendered) && parsedTendered > 0 && parsedTendered < parsedAmount) {
      toast.error('Cash given must be at least the expense amount')
      return
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
      const changeTxIds: string[] = []

      if (cashEnabled && baseChange > 0 && savedTx?.id) {
        const isTWD = inputCurrency === 'TWD'
        const rawChange = parsedTendered - parsedAmount
        const { bills: billsChangeAmt, coins: coinsChangeAmt } = isTWD
          ? splitChangeByPolicy(rawChange, { currency: 'TWD', routeFiftyCoinTo: getFiftyCoinRouting() })
          : { bills: 0, coins: rawChange }

        if (isTWD && billsChangeAmt > 0 && changeBillsWalletId && changeBillsWalletId !== walletId) {
          const ct = await addTransaction.mutateAsync({
            description: `Change bills – ${safeDescription}`,
            amount: money.toBase(billsChangeAmt, inputCurrency),
            original_amount: billsChangeAmt,
            original_currency: inputCurrency,
            type: 'transfer', category: 'Transfer',
            wallet_id: walletId || null,
            transfer_wallet_id: changeBillsWalletId,
            recurring_rule_id: null, recurring_due_date: null, date,
            needs_review: false, is_system_generated: true,
            linked_transaction_id: savedTx.id, cash_tendered: null,
          })
          if (ct?.id) changeTxIds.push(ct.id)
        }

        if (isTWD && coinsChangeAmt > 0 && changeCoinsWalletId) {
          const ct = await addTransaction.mutateAsync({
            description: `Change coins – ${safeDescription}`,
            amount: money.toBase(coinsChangeAmt, inputCurrency),
            original_amount: coinsChangeAmt,
            original_currency: inputCurrency,
            type: 'transfer', category: 'Transfer',
            wallet_id: walletId || null,
            transfer_wallet_id: changeCoinsWalletId,
            recurring_rule_id: null, recurring_due_date: null, date,
            needs_review: false, is_system_generated: true,
            linked_transaction_id: savedTx.id, cash_tendered: null,
          })
          if (ct?.id) changeTxIds.push(ct.id)
        }

        if (!isTWD && changeCoinsWalletId) {
          const ct = await addTransaction.mutateAsync({
            description: `Change – ${safeDescription}`,
            amount: baseChange,
            original_amount: rawChange,
            original_currency: inputCurrency,
            type: 'transfer', category: 'Transfer',
            wallet_id: walletId || null,
            transfer_wallet_id: changeCoinsWalletId,
            recurring_rule_id: null, recurring_due_date: null, date,
            needs_review: false, is_system_generated: true,
            linked_transaction_id: savedTx.id, cash_tendered: null,
          })
          if (ct?.id) changeTxIds.push(ct.id)
        }

        if (changeTxIds.length > 0) {
          await updateTransaction.mutateAsync({ id: savedTx.id, linked_transaction_id: changeTxIds[0] })
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
      navigate('/transactions', { replace: true })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save transaction')
    }
  }

  const parsedAmount = parseNumberInput(amount)
  const parsedTenderedVal = cashEnabled ? parseNumberInput(cashTendered) : 0
  const changeAmount = cashEnabled && Number.isFinite(parsedTenderedVal) && parsedTenderedVal > parsedAmount
    ? parsedTenderedVal - parsedAmount : 0
  const isUnderpay = cashEnabled && Number.isFinite(parsedTenderedVal) && parsedTenderedVal > 0 && parsedTenderedVal < parsedAmount
  const isTWD = inputCurrency === 'TWD' || selectedWallet?.currency === 'TWD'
  const { bills: billsChange, coins: coinsChange } = isTWD
    ? splitChangeByPolicy(changeAmount, { currency: 'TWD', routeFiftyCoinTo: getFiftyCoinRouting() })
    : { bills: 0, coins: changeAmount }
  const twdChips = getTwdTenderOptions(parsedAmount)
  const otherWallets = wallets.filter(w => w.id !== walletId)

  if (isDesktop) return null

  return (
    <div>
      {/* ── Page header – bleed full width past AppLayout padding ── */}
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
                  setShowCashSection(false)
                  setActiveKeypad(null)
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
      <div
        className="mb-5 cursor-pointer rounded-2xl border border-border bg-card px-4 pb-5 pt-6 text-center"
        onClick={() => setActiveKeypad('amount')}
        aria-label="Tap to enter amount"
      >
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
          <Input
            ref={amountInputRef}
            aria-label="Amount"
            readOnly={!isDesktop}
            className="h-16 w-48 cursor-pointer border-0 bg-transparent text-center text-5xl font-extrabold shadow-none focus-visible:ring-0"
            value={amount}
            placeholder="0"
            data-keypad-trigger="amount"
            onClick={() => setActiveKeypad('amount')}
            onFocus={() => setActiveKeypad('amount')}
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
            ) : (
              <select
                aria-label="Category"
                className="mt-2 h-11 w-full rounded-md border border-input bg-secondary px-3 text-sm font-bold text-foreground outline-none"
                value={category}
                onChange={e => setCategory(e.target.value)}
              >
                {type === 'income'
                  ? INCOME_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)
                  : categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)
                }
              </select>
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
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-4"
              onClick={() => setShowCashSection(v => !v)}
            >
              <span>
                <span className="block text-sm font-extrabold text-foreground">Cash payment</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">Track bill given and route change</span>
              </span>
              <div className="flex items-center gap-2">
                <span
                  role="switch"
                  aria-checked={cashEnabled}
                  aria-label="Enable cash change tracking"
                  onClick={e => {
                    e.stopPropagation()
                    const next = !cashEnabled
                    setCashEnabled(next)
                    setShowCashSection(next)
                    if (next) {
                      const coinsWallet = otherWallets.find(w => w.cash_role === 'coins')
                      setChangeCoinsWalletId(coinsWallet?.id ?? otherWallets[0]?.id ?? '')
                      const billsWallet = otherWallets.find(w => w.cash_role === 'notes' || w.cash_role === 'mixed')
                      setChangeBillsWalletId(billsWallet?.id ?? '')
                      const parsedExp = parseNumberInput(amount)
                      if (!cashTendered && parsedExp > 0 && isTWD) {
                        setCashTendered(String(getTwdTenderOptions(parsedExp)[0]))
                      }
                    } else {
                      setCashTendered('')
                    }
                    setActiveKeypad(null)
                  }}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors ${cashEnabled ? 'bg-primary' : 'bg-muted'}`}
                >
                  <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${cashEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </span>
                {showCashSection ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </div>
            </button>

            {cashEnabled && showCashSection && (
              <div className="mt-4 space-y-3">
                <div>
                  <Label className="text-xs font-bold text-muted-foreground">Cash given ({isTWD ? 'TWD' : inputCurrency})</Label>
                  <Input
                    aria-label="Cash given"
                    className="mt-2 cursor-pointer bg-secondary"
                    readOnly={!isDesktop}
                    value={cashTendered}
                    placeholder="Amount you handed over"
                    data-keypad-trigger="cash"
                    onClick={() => setActiveKeypad('cash')}
                    onFocus={() => setActiveKeypad('cash')}
                  />
                  {isTWD && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => { const e = parseNumberInput(amount); if (e > 0) setCashTendered(String(e)); setActiveKeypad('cash') }}
                        className={`min-h-[44px] rounded-xl border px-4 text-sm font-bold transition-colors ${parsedTenderedVal === parsedAmount && parsedAmount > 0 ? 'border-primary bg-primary/15 text-primary' : 'border-border bg-secondary text-foreground hover:border-primary hover:text-primary'}`}
                      >
                        {parsedAmount > 0 ? `Exact NT$${parsedAmount.toLocaleString()}` : 'Exact'}
                      </button>
                      {twdChips.map(chip => (
                        <button
                          key={chip}
                          type="button"
                          onClick={() => { setCashTendered(String(chip)); setActiveKeypad('cash') }}
                          className={`min-h-[44px] rounded-xl border px-4 text-sm font-bold transition-colors ${parsedTenderedVal === chip ? 'border-primary bg-primary/15 text-primary' : 'border-border bg-secondary text-foreground hover:border-primary hover:text-primary'}`}
                        >
                          NT${chip.toLocaleString()}
                        </button>
                      ))}
                    </div>
                  )}
                  {isUnderpay && (
                    <p className="mt-1.5 flex items-center gap-1.5 text-xs font-bold text-[#FF8388]">
                      <AlertTriangle className="h-3 w-3 shrink-0" /> Cash given must be at least the expense amount
                    </p>
                  )}
                </div>

                {changeAmount > 0 && (
                  <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
                    <p className="text-xs font-extrabold uppercase tracking-wide text-primary">Cash preview</p>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg bg-background/70 px-2 py-2">
                        <p className="text-[10px] text-muted-foreground">You pay</p>
                        <p className="text-sm font-extrabold text-foreground">{money.format(parsedAmount, inputCurrency)}</p>
                      </div>
                      <div className="rounded-lg bg-background/70 px-2 py-2">
                        <p className="text-[10px] text-muted-foreground">Cash given</p>
                        <p className="text-sm font-extrabold text-foreground">{money.format(parsedTenderedVal, inputCurrency)}</p>
                      </div>
                      <div className="rounded-lg bg-background/70 px-2 py-2">
                        <p className="text-[10px] text-muted-foreground">Change</p>
                        <p className="text-sm font-extrabold text-primary">{money.format(changeAmount, inputCurrency)}</p>
                      </div>
                    </div>
                    {isTWD && billsChange > 0 && coinsChange > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        NT${billsChange.toLocaleString()} bills + NT${coinsChange.toLocaleString()} coins
                      </p>
                    )}
                  </div>
                )}

                {changeAmount > 0 && otherWallets.length > 0 && (
                  <>
                    {isTWD && billsChange > 0 && (
                      <div>
                        <Label className="text-xs font-bold text-muted-foreground">Bills change (NT${billsChange.toLocaleString()}) → wallet</Label>
                        <select
                          aria-label="Bills change destination wallet"
                          className="mt-1.5 h-11 w-full rounded-md border border-input bg-secondary px-3 text-sm font-bold text-foreground outline-none"
                          value={changeBillsWalletId}
                          onChange={e => setChangeBillsWalletId(e.target.value)}
                        >
                          <option value="">Keep in {selectedWallet?.name}</option>
                          {otherWallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                        </select>
                      </div>
                    )}
                    {isTWD && coinsChange > 0 && (
                      <div>
                        <Label className="text-xs font-bold text-muted-foreground">Coins change (NT${coinsChange.toLocaleString()}) → wallet</Label>
                        <select
                          aria-label="Coins change destination wallet"
                          className="mt-1.5 h-11 w-full rounded-md border border-input bg-secondary px-3 text-sm font-bold text-foreground outline-none"
                          value={changeCoinsWalletId}
                          onChange={e => setChangeCoinsWalletId(e.target.value)}
                        >
                          {otherWallets.map(w => (
                            <option key={w.id} value={w.id}>{w.name}{w.cash_role === 'coins' ? ' · coin pouch' : ''}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    {!isTWD && (
                      <div>
                        <Label className="text-xs font-bold text-muted-foreground">Change goes to</Label>
                        <select
                          aria-label="Change destination wallet"
                          className="mt-1.5 h-11 w-full rounded-md border border-input bg-secondary px-3 text-sm font-bold text-foreground outline-none"
                          value={changeCoinsWalletId}
                          onChange={e => setChangeCoinsWalletId(e.target.value)}
                        >
                          <option value="">Keep in same wallet</option>
                          {otherWallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                        </select>
                      </div>
                    )}
                  </>
                )}

                {changeAmount > 0 && otherWallets.length === 0 && (
                  <Link
                    to="/settings?section=wallets"
                    className="flex items-center justify-between rounded-xl border border-[#FFCF73]/30 bg-[#FFCF73]/5 px-3 py-2.5 text-xs font-bold text-[#FFCF73] hover:bg-[#FFCF73]/10"
                  >
                    <span className="flex items-center gap-1.5">
                      <AlertTriangle className="h-3 w-3 shrink-0" /> Set up a coin pouch wallet to route change
                    </span>
                    <span className="ml-2 shrink-0">Settings →</span>
                  </Link>
                )}

                {changeAmount > 0 && parsedTenderedVal > 0 && (
                  <div className="rounded-xl border border-border bg-secondary/60 px-4 py-3">
                    <p className="mb-2 text-[11px] font-extrabold uppercase tracking-widest text-muted-foreground">Summary</p>
                    <div className="space-y-1.5 text-sm">
                      <div className="flex justify-between gap-2">
                        <span className="truncate text-muted-foreground">{selectedWallet?.name ?? 'Wallet'}</span>
                        <span className="shrink-0 font-bold text-[#FF8388]">
                          −{isTWD ? `NT$${parsedTenderedVal.toLocaleString()}` : money.format(parsedTenderedVal, inputCurrency)}
                        </span>
                      </div>
                      {isTWD && billsChange > 0 && changeBillsWalletId && (
                        <div className="flex justify-between gap-2">
                          <span className="truncate text-muted-foreground">{otherWallets.find(w => w.id === changeBillsWalletId)?.name ?? 'Bills wallet'}</span>
                          <span className="shrink-0 font-bold text-primary">+NT${billsChange.toLocaleString()}</span>
                        </div>
                      )}
                      {isTWD && coinsChange > 0 && changeCoinsWalletId && (
                        <div className="flex justify-between gap-2">
                          <span className="truncate text-muted-foreground">{otherWallets.find(w => w.id === changeCoinsWalletId)?.name ?? 'Coin pouch'}</span>
                          <span className="shrink-0 font-bold text-primary">+NT${coinsChange.toLocaleString()}</span>
                        </div>
                      )}
                      {!isTWD && changeAmount > 0 && changeCoinsWalletId && (
                        <div className="flex justify-between gap-2">
                          <span className="truncate text-muted-foreground">{otherWallets.find(w => w.id === changeCoinsWalletId)?.name ?? 'Change wallet'}</span>
                          <span className="shrink-0 font-bold text-primary">+{money.format(changeAmount, inputCurrency)}</span>
                        </div>
                      )}
                      <div className="flex justify-between gap-2 border-t border-border pt-1.5">
                        <span className="truncate text-muted-foreground">{category || 'Expense'} recorded</span>
                        <span className="shrink-0 font-bold text-[#FF8388]">
                          −{isTWD ? `NT$${parsedAmount.toLocaleString()}` : money.format(parsedAmount, inputCurrency)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      </div>

      {/* ── Fixed: MoneyKeypad ── */}
      {activeKeypad && (
        <div className="fixed bottom-0 left-0 right-0 z-50 lg:hidden" data-money-keypad-panel>
          <MoneyKeypad
            value={activeKeypad === 'cash' ? cashTendered : amount}
            onChange={activeKeypad === 'cash' ? setCashTendered : setAmount}
            currency={inputCurrency}
            allowDecimal={inputCurrency !== 'IDR'}
            quickAmounts={activeKeypad === 'cash' && isTWD ? twdChips : (inputCurrency === 'TWD' ? [50, 100, 500, 1000] : [])}
            onDone={() => setActiveKeypad(null)}
            variant="panel"
            doneLabel={activeKeypad === 'cash' ? 'Confirm cash given' : 'Confirm amount'}
          />
        </div>
      )}

      {/* ── Fixed: Save button ── */}
      {!activeKeypad && (
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
      )}
    </div>
  )
}
