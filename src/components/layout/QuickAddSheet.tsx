import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
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
import { formatNumberInput, parseNumberInput } from '@/lib/numberInput'
import { getMerchantSuggestion } from '@/lib/financeOs'
import { addRecurringInterval } from '@/lib/recurring'
import { splitChangeByPolicy, getFiftyCoinRouting } from '@/lib/cashChange'
import { getTwdTenderOptions, pickQuickAddWallet } from '@/lib/quickAdd'
import { scanReceipt, getGeminiKey } from '@/lib/gemini'
import { ScanLine, Loader2, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import type { RecurringFrequency } from '@/types'
import { MoneyKeypad } from '@/components/mobile/MoneyKeypad'

const INCOME_CATEGORIES = ['Wage', 'Gift', 'Refund', 'Allowance', 'Other income']
type EntryType = 'income' | 'expense' | 'transfer'

const LAST_CATEGORY_KEY = 'finpath_last_category'
const LAST_WALLET_KEY = 'finpath_last_wallet'

export function QuickAddSheet({ open, onClose, initialType, initialCash }: { open: boolean; onClose: () => void; initialType?: EntryType; initialCash?: boolean }) {
  const money = useMoney()
  const { data: categories = [] } = useBudgetCategories()
  const { data: wallets = [] } = useWallets()
  const { data: transactions = [] } = useTransactions()
  const addTransaction = useAddTransaction()
  const updateTransaction = useUpdateTransaction()
  const deleteTransaction = useDeleteTransaction()
  const addRecurringRule = useAddRecurringRule()

  const [type, setType] = useState<EntryType>('expense')
  const [amount, setAmount] = useState('')
  const [inputCurrency, setInputCurrency] = useState(money.displayCurrency)
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [walletId, setWalletId] = useState('')
  const [transferWalletId, setTransferWalletId] = useState('')
  const [isRecurring, setIsRecurring] = useState(false)
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly')
  const [installmentTotal, setInstallmentTotal] = useState('')
  const [endDate, setEndDate] = useState('')
  const [scanning, setScanning] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  // Cash-change assistant state
  const [cashEnabled, setCashEnabled] = useState(false)
  const [cashTendered, setCashTendered] = useState('')
  const [changeCoinsWalletId, setChangeCoinsWalletId] = useState('')
  const [changeBillsWalletId, setChangeBillsWalletId] = useState('')

  const amountInputRef = useRef<HTMLInputElement>(null)
  const receiptInputRef = useRef<HTMLInputElement>(null)

  // Restore last-used wallet and category
  useEffect(() => {
    if (!walletId && wallets.length > 0) {
      const last = localStorage.getItem(LAST_WALLET_KEY)
      setWalletId(pickQuickAddWallet(wallets, last, false)?.id ?? '')
    }
    if (!transferWalletId && wallets.length > 1) setTransferWalletId(wallets[1].id)
  }, [wallets, walletId, transferWalletId])

  useEffect(() => {
    if (!category && categories.length > 0) {
      const last = localStorage.getItem(LAST_CATEGORY_KEY)
      const found = last ? categories.find(c => c.name === last) : null
      setCategory(found ? found.name : categories[0].name)
    }
  }, [categories, category])

  useEffect(() => {
    setInputCurrency(cur => cur || money.displayCurrency)
  }, [money.displayCurrency])

  // Reset type to initialType and auto-focus when sheet opens
  useEffect(() => {
    if (open) {
      if (initialType) setType(initialType)
      if (initialCash) {
        setCashEnabled(true)
        const last = localStorage.getItem(LAST_WALLET_KEY)
        setWalletId(pickQuickAddWallet(wallets, last, true)?.id ?? '')
      }
      setInputCurrency(money.displayCurrency)
      amountInputRef.current?.blur()
    }
  }, [open, initialType, initialCash, money.displayCurrency, wallets])

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
    setType('expense')
    setAmount('')
    setInputCurrency(money.displayCurrency)
    setDate(new Date().toISOString().slice(0, 10))
    setDescription('')
    setCategory(categories[0]?.name ?? '')
    setWalletId(wallets[0]?.id ?? '')
    setTransferWalletId(wallets[1]?.id ?? '')
    setIsRecurring(false)
    setFrequency('monthly')
    setInstallmentTotal('')
    setEndDate('')
    setShowAdvanced(false)
    setCashEnabled(false)
    setCashTendered('')
    setChangeCoinsWalletId('')
    setChangeBillsWalletId('')
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleReceiptImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!getGeminiKey()) {
      toast.error('Add a Gemini API key in Settings → AI Features to use receipt scanning')
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

    // Cash validation
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
    const parsedInstallments = parseInt(installmentTotal.replace(/[^\d]/g, ''), 10)

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
        const isTWD = inputCurrency === 'TWD'
        const rawChange = parsedTendered - parsedAmount
        const { bills: billsChangeAmt, coins: coinsChangeAmt } = isTWD
          ? splitChangeByPolicy(rawChange, { currency: 'TWD', routeFiftyCoinTo: getFiftyCoinRouting() })
          : { bills: 0, coins: rawChange }

        if (isTWD && billsChangeAmt > 0 && changeBillsWalletId && changeBillsWalletId !== walletId) {
          const ct = await addTransaction.mutateAsync({
            description: `Change bills — ${safeDescription}`,
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
            description: `Change coins — ${safeDescription}`,
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
            description: `Change — ${safeDescription}`,
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

      if (isRecurring) {
        const completedAtStart = Number.isFinite(parsedInstallments) && parsedInstallments <= 1
        await addRecurringRule.mutateAsync({
          description: safeDescription,
          amount: baseAmount,
          original_amount: parsedAmount,
          original_currency: inputCurrency,
          type,
          category: type === 'transfer' ? 'Transfer' : (selectedCategory || 'Other'),
          wallet_id: walletId || null,
          transfer_wallet_id: type === 'transfer' ? transferWalletId : null,
          start_date: date,
          next_due_date: addRecurringInterval(date, frequency),
          frequency,
          end_date: endDate || null,
          installment_total: Number.isFinite(parsedInstallments) ? parsedInstallments : null,
          installment_paid: Number.isFinite(parsedInstallments) ? 1 : 0,
          active: !completedAtStart,
        })
      }

      if (walletId) localStorage.setItem(LAST_WALLET_KEY, walletId)
      if (selectedCategory) localStorage.setItem(LAST_CATEGORY_KEY, selectedCategory)

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
      reset()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save transaction')
    }
  }

  const sheetTitle = showAdvanced
    ? 'New transaction'
    : type === 'transfer' ? 'Transfer money'
    : type === 'income' ? 'Add income'
    : cashEnabled ? 'Cash payment'
    : 'Add expense'

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) handleClose() }}>
      <SheetContent
        side="bottom"
        className="max-h-[92vh] overflow-y-auto rounded-t-3xl border-border bg-background px-5 pb-10"
      >
        <SheetHeader className="mb-4 text-left">
          <SheetTitle>{sheetTitle}</SheetTitle>
        </SheetHeader>

        <div className="space-y-4">

          {/* ── QUICK MODE ── */}
          {!showAdvanced && (
            <>
              {/* Type segmented control */}
              <div className="flex justify-center">
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

              {/* Big amount input */}
              <div className="rounded-[1.25rem] border border-border bg-card px-4 pb-4 pt-5 text-center">
                <div className="flex items-center justify-center gap-2">
                  <span className="text-xl font-bold text-muted-foreground">{money.displayCurrency}</span>
                  <Input
                    ref={amountInputRef}
                    aria-label="Amount"
                    readOnly
                    className="h-16 w-44 border-0 bg-transparent text-center text-5xl font-extrabold shadow-none focus-visible:ring-0"
                    value={amount}
                    placeholder="0"
                  />
                </div>
                <Input
                  aria-label="Date"
                  className="mx-auto mt-3 max-w-[190px] rounded-full bg-secondary text-center text-sm"
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                />
                <div className="mt-4">
                  <MoneyKeypad
                    value={amount}
                    onChange={setAmount}
                    currency={inputCurrency}
                    allowDecimal={inputCurrency !== 'IDR'}
                    quickAmounts={inputCurrency === 'TWD' ? [50, 100, 500, 1000] : []}
                  />
                </div>
              </div>

              {/* Category chips — expense */}
              {type === 'expense' && wallets.length > 0 && (
                <div>
                  <p className="mb-2 text-sm font-bold text-foreground">Category</p>
                  {categories.length === 0 ? (
                    <Link
                      to="/budget"
                      onClick={handleClose}
                      className="flex h-11 items-center justify-between rounded-md border border-primary/30 bg-primary/5 px-3 text-sm font-bold text-primary hover:bg-primary/10"
                    >
                      <span>No categories yet</span>
                      <span>Set up now →</span>
                    </Link>
                  ) : (
                    <div className={`flex flex-wrap gap-2 ${categories.length > 10 ? 'max-h-28 overflow-y-auto' : ''}`}>
                      {categories.map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setCategory(c.name)}
                          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold transition-colors ${
                            category === c.name
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-secondary text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          <span
                            className="inline-block h-2 w-2 shrink-0 rounded-full"
                            style={{ background: category === c.name ? 'currentColor' : c.color }}
                          />
                          {c.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Category chips — income */}
              {type === 'income' && (
                <div>
                  <p className="mb-2 text-sm font-bold text-foreground">Category</p>
                  <div className="flex flex-wrap gap-2">
                    {INCOME_CATEGORIES.map(c => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setCategory(c)}
                        className={`rounded-full px-3 py-1.5 text-sm font-bold transition-colors ${
                          category === c
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-secondary text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Wallet chips — expense/income */}
              {type !== 'transfer' && wallets.length > 0 && (
                <div>
                  <p className="mb-2 text-sm font-bold text-foreground">Wallet</p>
                  {wallets.length <= 5 ? (
                    <div className="flex flex-wrap gap-2">
                      {wallets.map(w => (
                        <button
                          key={w.id}
                          type="button"
                          onClick={() => { setWalletId(w.id); setCashEnabled(false); setCashTendered('') }}
                          className={`rounded-full px-3 py-1.5 text-sm font-bold transition-colors ${
                            walletId === w.id
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-secondary text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {w.name}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <select
                      aria-label="Wallet"
                      className="h-11 w-full rounded-md border border-input bg-secondary px-3 text-sm font-bold text-foreground outline-none"
                      value={walletId}
                      onChange={e => { setWalletId(e.target.value); setCashEnabled(false); setCashTendered('') }}
                    >
                      {wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                  )}
                </div>
              )}

              {/* Transfer — from/to wallet */}
              {type === 'transfer' && (
                wallets.length < 2 ? (
                  <Link to="/settings" onClick={handleClose} className="flex h-11 items-center justify-between rounded-md border border-primary/30 bg-primary/5 px-3 text-sm font-bold text-primary">
                    <span>Add at least 2 wallets for transfer</span>
                    <span>Settings →</span>
                  </Link>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="mb-2 text-sm font-bold text-foreground">From</p>
                      <select
                        aria-label="From wallet"
                        className="h-11 w-full rounded-md border border-input bg-secondary px-3 text-sm font-bold text-foreground outline-none"
                        value={walletId}
                        onChange={e => setWalletId(e.target.value)}
                      >
                        {wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <p className="mb-2 text-sm font-bold text-foreground">To</p>
                      <select
                        aria-label="To wallet"
                        className="h-11 w-full rounded-md border border-input bg-secondary px-3 text-sm font-bold text-foreground outline-none"
                        value={transferWalletId}
                        onChange={e => setTransferWalletId(e.target.value)}
                      >
                        {wallets.map(w => <option key={w.id} value={w.id} disabled={w.id === walletId}>{w.name}</option>)}
                      </select>
                    </div>
                  </div>
                )
              )}

              {/* Optional note */}
              <Input
                aria-label="Description"
                className="bg-secondary"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Note (optional)"
              />

              {/* Toggle to advanced */}
              <button
                type="button"
                onClick={() => setShowAdvanced(true)}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold text-muted-foreground hover:text-foreground"
              >
                <ChevronDown className="h-3.5 w-3.5" />
                Advanced details
              </button>
            </>
          )}

          {/* ── ADVANCED MODE ── */}
          {showAdvanced && (
            <>
              {/* Type + Amount + Scan */}
              <div className="rounded-[1.25rem] border border-border bg-card p-4 text-center">
                <div className="mx-auto mb-3 inline-flex rounded-full border border-border bg-secondary p-1">
                  {(['income', 'expense', 'transfer'] as const).map(t => (
                    <button
                      key={t}
                      type="button"
                      aria-label={t[0].toUpperCase() + t.slice(1)}
                      className={`rounded-full px-5 py-2 text-sm font-extrabold capitalize transition-colors ${
                        type === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                      }`}
                      onClick={() => {
                        setType(t)
                        setCategory(t === 'income' ? INCOME_CATEGORIES[0] : categories[0]?.name ?? '')
                      }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-center gap-2">
                  <select
                    aria-label="Input currency"
                    className="h-11 rounded-full border border-border bg-secondary px-3 text-sm font-extrabold text-muted-foreground outline-none"
                    value={inputCurrency}
                    onChange={e => setInputCurrency(e.target.value)}
                  >
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <Input
                    ref={amountInputRef}
                    aria-label="Amount"
                    readOnly
                    className="h-14 w-44 border-0 bg-transparent text-center text-4xl font-extrabold shadow-none focus-visible:ring-0"
                    value={amount}
                    placeholder="0"
                  />
                  <button
                    type="button"
                    aria-label="Scan receipt"
                    onClick={() => receiptInputRef.current?.click()}
                    disabled={scanning}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-secondary text-muted-foreground transition-colors hover:text-primary disabled:opacity-50"
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
                <Input
                  aria-label="Date"
                  className="mx-auto mt-4 max-w-[190px] rounded-full bg-secondary text-center"
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                />
                <div className="mt-4">
                  <MoneyKeypad
                    value={amount}
                    onChange={setAmount}
                    currency={inputCurrency}
                    allowDecimal={inputCurrency !== 'IDR'}
                    quickAmounts={inputCurrency === 'TWD' ? [50, 100, 500, 1000] : []}
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <Label className="text-sm font-bold text-foreground">
                  {type === 'transfer' ? 'Transfer note' : 'Merchant name'}
                </Label>
                <Input
                  aria-label={type === 'transfer' ? 'Transfer note' : 'Description'}
                  className="mt-2 bg-secondary"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder={type === 'transfer' ? 'Optional note' : 'Enter a merchant name (optional)'}
                />
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

              {/* Category & Wallet */}
              {type !== 'transfer' ? (
                <>
                  <div>
                    <Label className="text-sm font-bold text-foreground">Category</Label>
                    {type !== 'income' && categories.length === 0 ? (
                      <Link
                        to="/budget"
                        onClick={handleClose}
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
                  <div>
                    <Label className="text-sm font-bold text-foreground">Wallet</Label>
                    {wallets.length === 0 ? (
                      <Link
                        to="/settings"
                        onClick={handleClose}
                        className="mt-2 flex h-11 items-center justify-between rounded-md border border-primary/30 bg-primary/5 px-3 text-sm font-bold text-primary hover:bg-primary/10"
                      >
                        <span>No wallets yet</span>
                        <span>Add one →</span>
                      </Link>
                    ) : (
                      <select
                        aria-label="Wallet"
                        className="mt-2 h-11 w-full rounded-md border border-input bg-secondary px-3 text-sm font-bold text-foreground outline-none"
                        value={walletId}
                        onChange={e => setWalletId(e.target.value)}
                      >
                        {wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                      </select>
                    )}
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-bold text-foreground">From wallet</Label>
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
                    <Label className="text-sm font-bold text-foreground">To wallet</Label>
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
              )}

              {/* Recurring */}
              <div className="rounded-[1.25rem] border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-4">
                  <span>
                    <span className="block text-sm font-extrabold text-foreground">Recurring / Installment</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      Rent, subscriptions, salary, or installments.
                    </span>
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isRecurring}
                    aria-label="Recurring / Installment"
                    onClick={() => setIsRecurring(!isRecurring)}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 ${isRecurring ? 'bg-primary' : 'bg-muted'}`}
                  >
                    <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${isRecurring ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
                {isRecurring && (
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs font-bold text-muted-foreground">Repeat</Label>
                      <select
                        aria-label="Recurring frequency"
                        className="mt-2 h-11 w-full rounded-md border border-input bg-secondary px-3 text-sm font-bold text-foreground outline-none"
                        value={frequency}
                        onChange={e => setFrequency(e.target.value as RecurringFrequency)}
                      >
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                        <option value="yearly">Yearly</option>
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs font-bold text-muted-foreground">Installments</Label>
                      <Input
                        aria-label="Installment count"
                        className="mt-2 bg-secondary"
                        inputMode="numeric"
                        value={installmentTotal}
                        onChange={e => setInstallmentTotal(formatNumberInput(e.target.value))}
                        placeholder="No limit"
                      />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs font-bold text-muted-foreground">End date</Label>
                      <Input
                        aria-label="Recurring end date"
                        className="mt-2 bg-secondary"
                        type="date"
                        value={endDate}
                        onChange={e => setEndDate(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Back to simple mode */}
              <button
                type="button"
                onClick={() => setShowAdvanced(false)}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold text-muted-foreground hover:text-foreground"
              >
                <ChevronUp className="h-3.5 w-3.5" />
                Fewer options
              </button>
            </>
          )}

          {/* ── Cash-change assistant — shown in both modes when expense + cash wallet ── */}
          {showCashAssistant && (() => {
            const otherWallets = wallets.filter(w => w.id !== walletId)
            const parsedExpense = parseNumberInput(amount)
            const parsedTenderedVal = parseNumberInput(cashTendered)
            const changeAmount = cashEnabled && Number.isFinite(parsedTenderedVal) && parsedTenderedVal > parsedExpense
              ? parsedTenderedVal - parsedExpense : 0
            const isUnderpay = cashEnabled && Number.isFinite(parsedTenderedVal) && parsedTenderedVal > 0 && parsedTenderedVal < parsedExpense
            const isTWD = inputCurrency === 'TWD' || selectedWallet?.currency === 'TWD'
            const { bills: billsChange, coins: coinsChange } = isTWD
              ? splitChangeByPolicy(changeAmount, { currency: 'TWD', routeFiftyCoinTo: getFiftyCoinRouting() })
              : { bills: 0, coins: changeAmount }
            const twdChips = getTwdTenderOptions(parsedExpense)

            return (
              <div className="rounded-[1.25rem] border border-primary/20 bg-primary/5 p-4">
                <div className="flex items-center justify-between gap-4">
                  <span>
                    <span className="block text-sm font-extrabold text-foreground">Cash payment</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">Track bill given and route change</span>
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
                        const parsedExp = parseNumberInput(amount)
                        if (!cashTendered && parsedExp > 0 && isTWD) {
                          setCashTendered(String(getTwdTenderOptions(parsedExp)[0]))
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
                      <Label className="text-xs font-bold text-muted-foreground">Cash given ({isTWD ? 'TWD' : inputCurrency})</Label>
                      <Input
                        aria-label="Cash given"
                        className="mt-2 bg-secondary"
                        readOnly
                        value={cashTendered}
                        placeholder="Amount you handed over"
                      />
                      {isTWD && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => { const e = parseNumberInput(amount); if (e > 0) setCashTendered(String(e)) }}
                            className={`min-h-[44px] rounded-xl border px-4 text-sm font-bold transition-colors ${parsedTenderedVal === parsedExpense && parsedExpense > 0 ? 'border-primary bg-primary/15 text-primary' : 'border-border bg-secondary text-foreground hover:border-primary hover:text-primary'}`}
                          >
                            {parsedExpense > 0 ? `Exact NT$${parsedExpense.toLocaleString()}` : 'Exact'}
                          </button>
                          {twdChips.map(chip => (
                            <button
                              key={chip}
                              type="button"
                              onClick={() => setCashTendered(String(chip))}
                              className={`min-h-[44px] rounded-xl border px-4 text-sm font-bold transition-colors ${parsedTenderedVal === chip ? 'border-primary bg-primary/15 text-primary' : 'border-border bg-secondary text-foreground hover:border-primary hover:text-primary'}`}
                            >
                              NT${chip.toLocaleString()}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => { setCashTendered(''); setTimeout(() => (document.querySelector('[aria-label="Cash given"]') as HTMLInputElement | null)?.focus(), 50) }}
                            className="min-h-[44px] rounded-xl border border-border bg-secondary px-4 text-sm font-bold text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                          >
                            Custom
                          </button>
                        </div>
                      )}
                      {isUnderpay && (
                        <p className="mt-1.5 flex items-center gap-1.5 text-xs font-bold text-[#FF8388]"><AlertTriangle className="h-3 w-3 shrink-0" /> Cash given must be at least the expense amount</p>
                      )}
                      <div className="mt-3">
                        <MoneyKeypad
                          value={cashTendered}
                          onChange={setCashTendered}
                          currency={inputCurrency}
                          allowDecimal={inputCurrency !== 'IDR'}
                          quickAmounts={isTWD ? twdChips : []}
                        />
                      </div>
                    </div>

                    {changeAmount > 0 && (
                      <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
                        <p className="text-xs font-extrabold uppercase tracking-wide text-primary">Cash preview</p>
                        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                          <div className="rounded-lg bg-background/70 px-2 py-2">
                            <p className="text-[10px] text-muted-foreground">You pay</p>
                            <p className="text-sm font-extrabold text-foreground">{money.format(parsedExpense, inputCurrency)}</p>
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
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            NT${billsChange.toLocaleString()} bills + NT${coinsChange.toLocaleString()} coins
                          </p>
                        )}
                      </div>
                    )}

                    {changeAmount > 0 && otherWallets.length > 0 && (
                      <>
                        {isTWD && billsChange > 0 && (
                          <div>
                            <Label className="text-xs font-bold text-muted-foreground">
                              Bills change (NT${billsChange.toLocaleString()}) → wallet
                            </Label>
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
                            <Label className="text-xs font-bold text-muted-foreground">
                              Coins change (NT${coinsChange.toLocaleString()}) → wallet
                            </Label>
                            <select
                              aria-label="Coins change destination wallet"
                              className="mt-1.5 h-11 w-full rounded-md border border-input bg-secondary px-3 text-sm font-bold text-foreground outline-none"
                              value={changeCoinsWalletId}
                              onChange={e => setChangeCoinsWalletId(e.target.value)}
                            >
                              {otherWallets.map(w => (
                                <option key={w.id} value={w.id}>
                                  {w.name}{w.cash_role === 'coins' ? ' · coin pouch' : ''}
                                </option>
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
                        onClick={handleClose}
                        className="flex items-center justify-between rounded-xl border border-[#FFCF73]/30 bg-[#FFCF73]/5 px-3 py-2.5 text-xs font-bold text-[#FFCF73] hover:bg-[#FFCF73]/10"
                      >
                        <span className="flex items-center gap-1.5"><AlertTriangle className="h-3 w-3 shrink-0" /> Set up a coin pouch wallet to route change automatically</span>
                        <span className="ml-2 shrink-0">Settings →</span>
                      </Link>
                    )}

                    {/* Transaction summary preview */}
                    {changeAmount > 0 && parsedTenderedVal > 0 && (
                      <div className="rounded-xl border border-border bg-secondary/60 px-4 py-3">
                        <p className="mb-2 text-[11px] font-extrabold uppercase tracking-widest text-muted-foreground">Summary</p>
                        <div className="space-y-1.5 text-sm">
                          <div className="flex justify-between gap-2">
                            <span className="text-muted-foreground truncate">{selectedWallet?.name ?? 'Wallet'}</span>
                            <span className="shrink-0 font-bold text-[#FF8388]">
                              −{isTWD ? `NT$${parsedTenderedVal.toLocaleString()}` : money.format(parsedTenderedVal, inputCurrency)}
                            </span>
                          </div>
                          {isTWD && billsChange > 0 && changeBillsWalletId && (
                            <div className="flex justify-between gap-2">
                              <span className="text-muted-foreground truncate">{otherWallets.find(w => w.id === changeBillsWalletId)?.name ?? 'Bills wallet'}</span>
                              <span className="shrink-0 font-bold text-primary">+NT${billsChange.toLocaleString()}</span>
                            </div>
                          )}
                          {isTWD && coinsChange > 0 && changeCoinsWalletId && (
                            <div className="flex justify-between gap-2">
                              <span className="text-muted-foreground truncate">{otherWallets.find(w => w.id === changeCoinsWalletId)?.name ?? 'Coin pouch'}</span>
                              <span className="shrink-0 font-bold text-primary">+NT${coinsChange.toLocaleString()}</span>
                            </div>
                          )}
                          {!isTWD && changeAmount > 0 && changeCoinsWalletId && (
                            <div className="flex justify-between gap-2">
                              <span className="text-muted-foreground truncate">{otherWallets.find(w => w.id === changeCoinsWalletId)?.name ?? 'Change wallet'}</span>
                              <span className="shrink-0 font-bold text-primary">+{money.format(changeAmount, inputCurrency)}</span>
                            </div>
                          )}
                          <div className="flex justify-between gap-2 border-t border-border pt-1.5">
                            <span className="text-muted-foreground truncate">{category || 'Expense'} recorded</span>
                            <span className="shrink-0 font-bold text-[#FF8388]">
                              −{isTWD ? `NT$${parsedExpense.toLocaleString()}` : money.format(parsedExpense, inputCurrency)}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })()}

          {/* ── Sticky save button ── */}
          <div className="sticky bottom-0 -mx-5 bg-background px-5 pb-4 pt-3">
            {wallets.length === 0 ? (
              <Link
                to="/settings"
                onClick={onClose}
                className="flex h-14 w-full items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary transition-colors hover:bg-primary/20"
              >
                Add a wallet to get started →
              </Link>
            ) : !showAdvanced && type === 'expense' && categories.length === 0 ? (
              <Link
                to="/budget"
                onClick={onClose}
                className="flex h-14 w-full items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary transition-colors hover:bg-primary/20"
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
                  !amount ||
                  cannotSaveTransfer
                }
              >
                {addTransaction.isPending ? 'Saving…' : `Add ${type}`}
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
