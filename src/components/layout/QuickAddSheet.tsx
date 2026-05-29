import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Numpad } from '@/components/ui/numpad'
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
import { ScanLine, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { RecurringFrequency } from '@/types'

const INCOME_CATEGORIES = ['Wage', 'Gift', 'Refund', 'Allowance', 'Other income']
type EntryType = 'income' | 'expense' | 'transfer'

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
  const receiptInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!walletId && wallets.length > 0) setWalletId(wallets[0].id)
    if (!transferWalletId && wallets.length > 1) setTransferWalletId(wallets[1].id)
  }, [wallets, walletId, transferWalletId])

  useEffect(() => {
    setInputCurrency(cur => cur || money.displayCurrency)
  }, [money.displayCurrency])

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
    if (!description.trim() || !Number.isFinite(parsedAmount) || parsedAmount <= 0) return
    if (cannotSaveTransfer) return
    const selectedCategory = type === 'income' ? (category || INCOME_CATEGORIES[0]) : category
    if (type !== 'transfer' && (!selectedCategory || !walletId)) return

    const baseAmount = money.toBase(parsedAmount, inputCurrency)
    const parsedInstallments = parseInt(installmentTotal.replace(/[^\d]/g, ''), 10)
    const payload = {
      description: description.trim(),
      amount: baseAmount,
      original_amount: parsedAmount,
      original_currency: inputCurrency,
      type,
      category: type === 'transfer' ? 'Transfer' : selectedCategory,
      wallet_id: walletId || null,
      transfer_wallet_id: type === 'transfer' ? transferWalletId : null,
      recurring_rule_id: null,
      recurring_due_date: null,
      date,
      needs_review: false,
    }

    await addTransaction.mutateAsync(payload)

    if (isRecurring) {
      const completedAtStart = Number.isFinite(parsedInstallments) && parsedInstallments <= 1
      await addRecurringRule.mutateAsync({
        description: description.trim(),
        amount: baseAmount,
        original_amount: parsedAmount,
        original_currency: inputCurrency,
        type,
        category: type === 'transfer' ? 'Transfer' : selectedCategory,
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

    toast.success('Transaction added')
    reset()
    onClose()
  }

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) handleClose() }}>
      <SheetContent
        side="bottom"
        className="max-h-[92vh] overflow-y-auto rounded-t-3xl border-border bg-background px-5 pb-10"
      >
        <SheetHeader className="mb-5 text-left">
          <SheetTitle>New transaction</SheetTitle>
        </SheetHeader>

        <div className="space-y-5">
          {/* Type + Amount + Date */}
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
              <span className="flex h-14 w-44 items-center justify-center text-4xl font-extrabold">
                {amount ? formatNumberInput(amount) : <span className="text-muted-foreground/40">0</span>}
              </span>
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
            <Numpad value={amount} onChange={setAmount} />
          </div>

          {/* Merchant name */}
          <div>
            <Label className="text-sm font-bold text-foreground">Merchant name</Label>
            <Input
              aria-label="Description"
              className="mt-2 bg-secondary"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Enter a merchant name"
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

          {wallets.length === 0 ? (
            <Link
              to="/settings"
              onClick={onClose}
              className="mt-2 flex h-12 w-full items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary transition-colors hover:bg-primary/20"
            >
              Add a wallet to get started →
            </Link>
          ) : type === 'expense' && categories.length === 0 ? (
            <Link
              to="/budget"
              onClick={onClose}
              className="mt-2 flex h-12 w-full items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary transition-colors hover:bg-primary/20"
            >
              Add a budget category first →
            </Link>
          ) : (
            <Button
              className="mt-2 h-12 w-full text-base font-extrabold"
              onClick={handleSave}
              disabled={
                addTransaction.isPending ||
                addRecurringRule.isPending ||
                !amount ||
                cannotSaveTransfer
              }
            >
              Add transaction
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
