import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  useAddTransaction,
  useAddRecurringRule,
  useBudgetCategories,
  useTransactions,
  useWallets,
} from '@/lib/queries'
import { CURRENCIES, useMoney } from '@/lib/currency'
import { formatNumberInput, parseNumberInput } from '@/lib/numberInput'
import { getMerchantSuggestion } from '@/lib/financeOs'
import { addRecurringInterval } from '@/lib/recurring'
import { scanReceipt, getGeminiKey } from '@/lib/gemini'
import { ScanLine, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { toast } from 'sonner'
import type { RecurringFrequency } from '@/types'

const INCOME_CATEGORIES = ['Wage', 'Gift', 'Refund', 'Allowance', 'Other income']
type EntryType = 'income' | 'expense' | 'transfer'

const LAST_CATEGORY_KEY = 'finpath_last_category'
const LAST_WALLET_KEY = 'finpath_last_wallet'

export function QuickAddSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const money = useMoney()
  const { data: categories = [] } = useBudgetCategories()
  const { data: wallets = [] } = useWallets()
  const { data: transactions = [] } = useTransactions()
  const addTransaction = useAddTransaction()
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

  const amountInputRef = useRef<HTMLInputElement>(null)
  const receiptInputRef = useRef<HTMLInputElement>(null)

  // Restore last-used wallet and category
  useEffect(() => {
    if (!walletId && wallets.length > 0) {
      const last = localStorage.getItem(LAST_WALLET_KEY)
      const found = last ? wallets.find(w => w.id === last) : null
      setWalletId(found ? found.id : wallets[0].id)
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

  // Auto-focus amount when sheet opens
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => amountInputRef.current?.focus(), 120)
      return () => clearTimeout(timer)
    }
  }, [open])

  const merchantSuggestion = useMemo(
    () => getMerchantSuggestion(description, transactions),
    [description, transactions]
  )

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
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return
    if (cannotSaveTransfer) return
    const selectedCategory = type === 'income' ? (category || INCOME_CATEGORIES[0]) : category
    if (type !== 'transfer' && !walletId) return

    // Auto-generate description if user left it blank
    const safeDescription = description.trim() ||
      (type === 'transfer' ? 'Transfer' :
       type === 'income' ? `${selectedCategory || 'Income'} income` :
       `${selectedCategory || 'Expense'} expense`)

    const baseAmount = money.toBase(parsedAmount, inputCurrency)
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
    }

    try {
      await addTransaction.mutateAsync(payload)

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

      // Remember last used wallet and category
      if (walletId) localStorage.setItem(LAST_WALLET_KEY, walletId)
      if (selectedCategory) localStorage.setItem(LAST_CATEGORY_KEY, selectedCategory)

      toast.success('Transaction added')
      reset()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save transaction')
    }
  }

  const expenseCategories = type === 'income' ? [] : categories

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) handleClose() }}>
      <SheetContent
        side="bottom"
        className="max-h-[92vh] overflow-y-auto rounded-t-3xl border-border bg-background px-5 pb-10"
      >
        <SheetHeader className="mb-4 text-left">
          <SheetTitle>{showAdvanced ? 'New transaction' : 'Add expense'}</SheetTitle>
        </SheetHeader>

        <div className="space-y-4">

          {/* ── QUICK MODE ── */}
          {!showAdvanced && (
            <>
              {/* Big amount input */}
              <div className="rounded-[1.25rem] border border-border bg-card px-4 pb-4 pt-5 text-center">
                <div className="flex items-center justify-center gap-2">
                  <span className="text-xl font-bold text-muted-foreground">{money.displayCurrency}</span>
                  <Input
                    ref={amountInputRef}
                    aria-label="Amount"
                    inputMode="decimal"
                    className="h-16 w-44 border-0 bg-transparent text-center text-5xl font-extrabold shadow-none focus-visible:ring-0"
                    value={amount}
                    onChange={e => setAmount(formatNumberInput(e.target.value))}
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
              </div>

              {/* Category chips */}
              {wallets.length > 0 && (
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
                    <div className="flex flex-wrap gap-2">
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
                More options
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
                    className="h-10 rounded-full border border-border bg-secondary px-3 text-sm font-extrabold text-muted-foreground outline-none"
                    value={inputCurrency}
                    onChange={e => setInputCurrency(e.target.value)}
                  >
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <Input
                    ref={amountInputRef}
                    aria-label="Amount"
                    inputMode="decimal"
                    className="h-14 w-44 border-0 bg-transparent text-center text-4xl font-extrabold shadow-none focus-visible:ring-0"
                    value={amount}
                    onChange={e => setAmount(formatNumberInput(e.target.value))}
                    placeholder="0"
                  />
                  <button
                    type="button"
                    aria-label="Scan receipt"
                    onClick={() => receiptInputRef.current?.click()}
                    disabled={scanning}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-secondary text-muted-foreground transition-colors hover:text-primary disabled:opacity-50"
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
              </div>

              {/* Merchant name */}
              <div>
                <Label className="text-sm font-bold text-foreground">Merchant name</Label>
                <Input
                  aria-label="Description"
                  className="mt-2 bg-secondary"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Enter a merchant name (optional)"
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
                      {wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                  </div>
                </div>
              )}

              {/* Recurring */}
              <div className="rounded-[1.25rem] border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-4">
                  <span>
                    <span className="block text-sm font-extrabold text-foreground">Recurring / Cicilan</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      Rent, subscriptions, salary, or installments.
                    </span>
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isRecurring}
                    aria-label="Recurring / Cicilan"
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

          {/* ── Sticky save button ── */}
          <div className="sticky bottom-0 -mx-5 bg-background px-5 pb-4 pt-3">
            {wallets.length === 0 ? (
              <Link
                to="/settings"
                onClick={onClose}
                className="flex h-12 w-full items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary transition-colors hover:bg-primary/20"
              >
                Add a wallet to get started →
              </Link>
            ) : !showAdvanced && type === 'expense' && categories.length === 0 ? (
              <Link
                to="/budget"
                onClick={onClose}
                className="flex h-12 w-full items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary transition-colors hover:bg-primary/20"
              >
                Add a budget category first →
              </Link>
            ) : (
              <Button
                className="h-12 w-full text-base font-extrabold"
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
