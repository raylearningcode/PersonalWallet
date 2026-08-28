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
import { parseNumberInput } from '@/lib/numberInput'
import { getMerchantSuggestion } from '@/lib/financeOs'
import { hapticSuccess } from '@/lib/haptics'
import { pickQuickAddWallet } from '@/lib/quickAdd'
import { scanReceipt, isAiConfigured } from '@/lib/ai'
import { takePhotoWithCamera, isNativeCameraAvailable } from '@/lib/camera'
import { validateSplitAmounts, validateWalletSplits, buildSplitPortions, buildWalletSplits, planCashChange, buildChangeTransferPayloads } from '@/lib/cashSave'
import { todayLocal } from '@/lib/utils'
import { ScanLine, Loader2, ChevronDown, ChevronUp, Camera as CameraIcon } from 'lucide-react'
import { toast } from 'sonner'
import { MoneyField } from '@/components/mobile/MoneyField'
import { CashChangeAssistant } from '@/components/transactions/CashChangeAssistant'

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
  const [date, setDate] = useState(todayLocal)
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [walletId, setWalletId] = useState('')
  const [transferWalletId, setTransferWalletId] = useState('')
  const [scanning, setScanning] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [nativeCameraAvailable, setNativeCameraAvailable] = useState(false)

  // Cash-change assistant state
  const [cashEnabled, setCashEnabled] = useState(false)
  const [cashTendered, setCashTendered] = useState('')
  const [changeCoinsWalletId, setChangeCoinsWalletId] = useState('')
  const [changeBillsWalletId, setChangeBillsWalletId] = useState('')

  // Category splitting
  const [splitEnabled, setSplitEnabled] = useState(false)
  const [splitPortions, setSplitPortions] = useState<{ category: string; amount: string }[]>([])
  // Multi-wallet payment
  const [multiWalletEnabled, setMultiWalletEnabled] = useState(false)
  const [walletSplits, setWalletSplits] = useState<{ wallet_id: string; amount: string }[]>([])

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
    setInputCurrency(money.displayCurrency)
  }, [money.displayCurrency])

  useEffect(() => {
    isNativeCameraAvailable().then(setNativeCameraAvailable)
  }, [])

  // Reset type to initialType and auto-focus when sheet opens
  useEffect(() => {
    if (open) {
      if (initialType) setType(initialType)
      if (initialCash) {
        const last = localStorage.getItem(LAST_WALLET_KEY)
        const picked = pickQuickAddWallet(wallets, last, true)
        setWalletId(picked?.id ?? '')
        // Only enable cash when the picked wallet is actually a cash wallet —
        // the switch UI (showCashAssistant) requires one, so enabling cash
        // for any other wallet would trap the save behind
        // "Enter the cash amount given".
        if (picked?.type === 'cash') setCashEnabled(true)
      }
      setInputCurrency(money.displayCurrency)
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
    setDate(todayLocal())
    setDescription('')
    setCategory(categories[0]?.name ?? '')
    setWalletId(wallets[0]?.id ?? '')
    setTransferWalletId(wallets[1]?.id ?? '')
    setShowAdvanced(false)
    setCashEnabled(false)
    setCashTendered('')
    setChangeCoinsWalletId('')
    setChangeBillsWalletId('')
    setSplitEnabled(false)
    setSplitPortions([])
    setMultiWalletEnabled(false)
    setWalletSplits([])
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleReceiptImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!isAiConfigured()) {
      toast.error('Set up your AI API in Settings > AI Features to use receipt scanning')
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
      toast.success('Receipt scanned - review and confirm')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Receipt scan failed')
    } finally {
      setScanning(false)
      if (receiptInputRef.current) receiptInputRef.current.value = ''
    }
  }

  const handleNativeCamera = async () => {
    if (!isAiConfigured()) {
      toast.error('Set up your AI API in Settings > AI Features to use receipt scanning')
      return
    }
    setScanning(true)
    try {
      const base64 = await takePhotoWithCamera()
      if (!base64) {
        toast.error('Failed to capture photo')
        return
      }
      const result = await scanReceipt(base64, 'image/jpeg')
      if (result.description) setDescription(result.description)
      if (result.amount) setAmount(result.amount)
      if (result.date) setDate(result.date)
      if (result.category) {
        const matched = categories.find(c => c.name.toLowerCase() === result.category.toLowerCase())
        if (matched) setCategory(matched.name)
      }
      toast.success('Receipt scanned - review and confirm')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Receipt scan failed')
    } finally {
      setScanning(false)
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

    // Hard validation: split portions must sum to the total; cash mode requires a tendered amount
    const splitError = splitEnabled ? validateSplitAmounts(parsedAmount, splitPortions, inputCurrency) : null
    if (splitError) { toast.error(splitError); return }
    const walletSplitError = multiWalletEnabled ? validateWalletSplits(parsedAmount, walletSplits, inputCurrency) : null
    if (walletSplitError) { toast.error(walletSplitError); return }
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

    const computedSplitPortions = splitEnabled
      ? buildSplitPortions(splitPortions, inputCurrency, money.toBase)
      : null
    const computedWalletSplits = multiWalletEnabled
      ? buildWalletSplits(walletSplits, inputCurrency, money.toBase)
      : null

    const payload = {
      description: safeDescription,
      amount: baseAmount,
      original_amount: parsedAmount,
      original_currency: inputCurrency,
      type,
      category: type === 'transfer' ? 'Transfer'
        : (computedSplitPortions ? 'Split' : (selectedCategory || 'Other')),
      wallet_id: computedWalletSplits ? null : (walletId || null),
      transfer_wallet_id: type === 'transfer' ? transferWalletId : null,
      recurring_rule_id: null,
      recurring_due_date: null,
      date,
      needs_review: false,
      cash_tendered: cashEnabled && baseTendered > 0 ? baseTendered : null,
      split_portions: computedSplitPortions,
      wallet_splits: computedWalletSplits,
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
        toast.success('Cash payment saved → change routed', {
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
        className="max-h-[92vh] overflow-y-auto rounded-t-3xl border-border bg-background px-5 pb-safe-10"
      >
        <SheetHeader className="mb-4 text-left">
          <SheetTitle>{sheetTitle}</SheetTitle>
        </SheetHeader>

        <div className="space-y-4">

          {/* —— QUICK MODE —— */}
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
                        setSplitEnabled(false)
                        setMultiWalletEnabled(false)
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
                  <span className="text-xl font-bold text-muted-foreground">{inputCurrency}</span>
                  <MoneyField
                    value={amount}
                    onChange={setAmount}
                    currency={inputCurrency}
                    ariaLabel="Amount"
                    className="h-16 w-44 cursor-pointer border-0 bg-transparent text-center text-5xl font-extrabold shadow-none focus-visible:ring-0"
                    keypadDoneLabel="Confirm amount"
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
                          onClick={() => { setWalletId(w.id); setCashEnabled(false); setCashTendered(''); setSplitEnabled(false); setMultiWalletEnabled(false) }}
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
                      value={walletId || wallets[0]?.id || ''}
                      onChange={e => { setWalletId(e.target.value); setCashEnabled(false); setCashTendered(''); setSplitEnabled(false); setMultiWalletEnabled(false) }}
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
                onClick={() => {
                  setShowAdvanced(true)
                }}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold text-muted-foreground hover:text-foreground"
              >
                <ChevronDown className="h-3.5 w-3.5" />
                Advanced details
              </button>
            </>
          )}

          {/* —— ADVANCED MODE —— */}
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
                        setCashEnabled(false)
                        setCashTendered('')
                        setSplitEnabled(false)
                        setMultiWalletEnabled(false)
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
                  <MoneyField
                    value={amount}
                    onChange={setAmount}
                    currency={inputCurrency}
                    ariaLabel="Amount"
                    className="h-14 w-44 cursor-pointer border-0 bg-transparent text-center text-4xl font-extrabold shadow-none focus-visible:ring-0"
                    keypadDoneLabel="Confirm amount"
                  />
                  {nativeCameraAvailable ? (
                    <button
                      type="button"
                      aria-label="Capture receipt with camera"
                      onClick={handleNativeCamera}
                      disabled={scanning}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-secondary text-muted-foreground transition-colors hover:text-primary disabled:opacity-50"
                    >
                      {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <CameraIcon className="h-4 w-4" />}
                    </button>
                  ) : (
                    <button
                      type="button"
                      aria-label="Scan receipt"
                      onClick={() => receiptInputRef.current?.click()}
                      disabled={scanning}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-secondary text-muted-foreground transition-colors hover:text-primary disabled:opacity-50"
                    >
                      {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
                    </button>
                  )}
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
                        onChange={e => { setWalletId(e.target.value); setCashEnabled(false); setCashTendered(''); setSplitEnabled(false); setMultiWalletEnabled(false) }}
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

              {/* —— Category splitting (expense only, advanced mode) —— */}
              {type === 'expense' && categories.length >= 2 && (
                <div className="rounded-[1.25rem] border border-border bg-card p-4">
                  <div className="flex items-center justify-between gap-4">
                    <span>
                      <span className="block text-sm font-extrabold text-foreground">Split across categories</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">Divide this expense into multiple budget categories</span>
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={splitEnabled}
                      aria-label="Split across categories"
                      onClick={() => {
                        const next = !splitEnabled
                        setSplitEnabled(next)
                        if (next) {
                          // Initialize with 2 empty portions
                          setSplitPortions([
                            { category: categories[0]?.name ?? '', amount: '' },
                            { category: categories[1]?.name ?? categories[0]?.name ?? '', amount: '' },
                          ])
                        } else { setSplitPortions([]) }
                      }}
                      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${splitEnabled ? 'bg-primary' : 'bg-muted'}`}
                    >
                      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${splitEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                  {splitEnabled && (
                    <div className="mt-3 space-y-2">
                      {splitPortions.map((p, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <select
                            aria-label={`Portion ${i + 1} category`}
                            className="h-10 flex-1 rounded-lg border border-input bg-secondary px-2 text-sm font-bold text-foreground outline-none"
                            value={p.category}
                            onChange={e => {
                              const next = [...splitPortions]
                              next[i] = { ...next[i], category: e.target.value }
                              setSplitPortions(next)
                            }}
                          >
                            {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                          </select>
                          <MoneyField
                            value={p.amount}
                            onChange={v => {
                              const next = [...splitPortions]
                              next[i] = { ...next[i], amount: v }
                              setSplitPortions(next)
                            }}
                            currency={inputCurrency}
                            ariaLabel={`Portion ${i + 1} amount`}
                            className="h-10 w-28 rounded-lg bg-secondary text-sm font-extrabold"
                          />
                          <button
                            onClick={() => setSplitPortions(sp => sp.filter((_, j) => j !== i))}
                            disabled={splitPortions.length <= 2}
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm text-muted-foreground hover:text-destructive disabled:opacity-30"
                            aria-label={`Remove portion ${i + 1}`}
                          >
                            −
                          </button>
                        </div>
                      ))}
                      {(() => {
                        const total = splitPortions.reduce((s, p) => s + parseNumberInput(p.amount), 0)
                        const mainAmount = parseNumberInput(amount)
                        const remaining = mainAmount - total
                        return (
                          <div className="flex items-center justify-between gap-2 pt-1">
                            <button
                              onClick={() => setSplitPortions(sp => [...sp, { category: categories[0]?.name ?? '', amount: '' }])}
                              className="text-xs font-bold text-primary hover:underline"
                            >
                              + Add portion
                            </button>
                            <span className={`text-xs font-bold ${remaining === 0 ? 'text-primary' : remaining > 0 ? 'text-muted-foreground' : 'text-destructive'}`}>
                              {remaining === 0 ? '✓ Fully allocated' : remaining > 0 ? `${money.format(remaining, inputCurrency)} remaining` : `${money.format(Math.abs(remaining), inputCurrency)} over`}
                            </span>
                          </div>
                        )
                      })()}
                    </div>
                  )}
                </div>
              )}

              {/* —— Multi-wallet payment (expense only, advanced mode, 2+ wallets) —— */}
              {type === 'expense' && wallets.length >= 2 && (
                <div className="rounded-[1.25rem] border border-border bg-card p-4">
                  <div className="flex items-center justify-between gap-4">
                    <span>
                      <span className="block text-sm font-extrabold text-foreground">Pay from multiple wallets</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">E.g. $100 from notes + $2 from coins for a $102 expense</span>
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={multiWalletEnabled}
                      aria-label="Pay from multiple wallets"
                      onClick={() => {
                        const next = !multiWalletEnabled
                        setMultiWalletEnabled(next)
                        if (next) {
                          const notesWallet = wallets.find(w => w.cash_role === 'notes' || w.cash_role === 'mixed' || w.type === 'cash')
                          const coinsWallet = wallets.find(w => w.cash_role === 'coins' && w.id !== notesWallet?.id)
                          const initial: { wallet_id: string; amount: string }[] = []
                          if (notesWallet) initial.push({ wallet_id: notesWallet.id, amount: '' })
                          if (coinsWallet) initial.push({ wallet_id: coinsWallet.id, amount: '' })
                          if (initial.length < 2) {
                            const others = wallets.filter(w => !initial.find(i => i.wallet_id === w.id))
                            while (initial.length < 2 && others.length > 0) {
                              initial.push({ wallet_id: others.shift()!.id, amount: '' })
                            }
                          }
                          setWalletSplits(initial)
                        } else { setWalletSplits([]) }
                      }}
                      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${multiWalletEnabled ? 'bg-primary' : 'bg-muted'}`}
                    >
                      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${multiWalletEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                  {multiWalletEnabled && (
                    <div className="mt-3 space-y-2">
                      {walletSplits.map((ws, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <select
                            aria-label={`Wallet ${i + 1}`}
                            className="h-10 flex-1 rounded-lg border border-input bg-secondary px-2 text-sm font-bold text-foreground outline-none"
                            value={ws.wallet_id}
                            onChange={e => {
                              const next = [...walletSplits]
                              next[i] = { ...next[i], wallet_id: e.target.value }
                              setWalletSplits(next)
                            }}
                          >
                            {wallets.map(w => <option key={w.id} value={w.id}>{w.name}{w.cash_role === 'coins' ? ' → coins' : w.cash_role === 'notes' ? ' → notes' : ''}</option>)}
                          </select>
                          <MoneyField
                            value={ws.amount}
                            onChange={v => {
                              const next = [...walletSplits]
                              next[i] = { ...next[i], amount: v }
                              setWalletSplits(next)
                            }}
                            currency={inputCurrency}
                            ariaLabel={`Wallet ${i + 1} amount`}
                            className="h-10 w-28 rounded-lg bg-secondary text-sm font-extrabold"
                          />
                          <button
                            onClick={() => setWalletSplits(ws2 => ws2.filter((_, j) => j !== i))}
                            disabled={walletSplits.length <= 2}
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm text-muted-foreground hover:text-destructive disabled:opacity-30"
                            aria-label={`Remove wallet ${i + 1}`}
                          >
                            −
                          </button>
                        </div>
                      ))}
                      {(() => {
                        const total = walletSplits.reduce((s, ws) => s + parseNumberInput(ws.amount), 0)
                        const mainAmount = parseNumberInput(amount)
                        const remaining = mainAmount - total
                        return (
                          <div className="flex items-center justify-between gap-2 pt-1">
                            <button
                              onClick={() => {
                                const unused = wallets.find(w => !walletSplits.find(ws => ws.wallet_id === w.id))
                                setWalletSplits(ws2 => [...ws2, { wallet_id: unused?.id ?? wallets[0].id, amount: '' }])
                              }}
                              className="text-xs font-bold text-primary hover:underline"
                            >
                              + Add wallet
                            </button>
                            <span className={`text-xs font-bold ${remaining === 0 ? 'text-primary' : remaining > 0 ? 'text-muted-foreground' : 'text-destructive'}`}>
                              {remaining === 0 ? '✓ Fully allocated' : remaining > 0 ? `${money.format(remaining, inputCurrency)} remaining` : `${money.format(Math.abs(remaining), inputCurrency)} over`}
                            </span>
                          </div>
                        )
                      })()}
                    </div>
                  )}
                </div>
              )}

              {/* Back to simple mode */}
              <button
                type="button"
                onClick={() => {
                  setShowAdvanced(false)
                }}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold text-muted-foreground hover:text-foreground"
              >
                <ChevronUp className="h-3.5 w-3.5" />
                Fewer options
              </button>
            </>
          )}

          {/* -- Cash-change assistant -- expense + cash wallet -- */}
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
              onClose={handleClose}
            />
          )}

          {/* —— Sticky save button —— */}
          <div className="sticky bottom-0 -mx-5 bg-background px-5 pb-safe-4 pt-3">
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
                  parseNumberInput(amount) <= 0 ||
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
