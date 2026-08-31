import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SheetHeader, SheetTitle } from '@/components/ui/sheet'
import {
  useAddTransaction,
  useUpdateTransaction,
  useDeleteTransaction,
  useAddRecurringRule,
  useBudgetCategories,
  useTransactions,
  useWallets,
  useMarkReviewed,
  useUpdateRecurringRule,
} from '@/lib/queries'
import { CURRENCIES, useMoney } from '@/lib/currency'
import { formatNumberInput, parseNumberInput } from '@/lib/numberInput'
import { getMerchantSuggestion } from '@/lib/financeOs'
import { pickQuickAddWallet } from '@/lib/quickAdd'
import { scanReceipt, isAiConfigured } from '@/lib/ai'
import { takePhotoWithCamera, isNativeCameraAvailable } from '@/lib/camera'
import { saveTransactionEntry, LAST_CATEGORY_KEY, LAST_WALLET_KEY, INCOME_CATEGORIES } from '@/lib/saveTransaction'
import { todayLocal } from '@/lib/utils'
import { ArrowLeft, ScanLine, Loader2, ChevronDown, ChevronUp, Camera as CameraIcon, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'
import { MoneyField } from '@/components/mobile/MoneyField'
import { CashChangeAssistant } from '@/components/transactions/CashChangeAssistant'
import type { Transaction } from '@/types'

export type EntryType = 'income' | 'expense' | 'transfer'

interface TransactionFormProps {
  /** Type the form opens with. */
  initialType?: EntryType
  /** Open in cash mode (?cash=true) — applies once, only for a cash wallet. */
  initialCash?: boolean
  /** 'sheet' = inside QuickAddSheet (bottom sheet, sticky save bar); 'page' = mobile full page (header + fixed save bar). */
  variant?: 'sheet' | 'page'
  /** Edit mode: prefills from this transaction and updates it on save. */
  editTransaction?: Transaction | null
  /** Called after a successful save. */
  onDone: () => void
  /** Page variant: back arrow handler. */
  onBack?: () => void
  /** Called before internal links (Set up now / Add one) navigate — the sheet uses it to close itself. */
  onNavigate?: () => void
}

export function TransactionForm({ initialType = 'expense', initialCash = false, variant = 'sheet', editTransaction = null, onDone, onBack, onNavigate }: TransactionFormProps) {
  const money = useMoney()
  const { data: categories = [] } = useBudgetCategories()
  const { data: wallets = [] } = useWallets()
  const { data: transactions = [] } = useTransactions()
  const addTransaction = useAddTransaction()
  const updateTransaction = useUpdateTransaction()
  const deleteTransaction = useDeleteTransaction()
  const addRecurringRule = useAddRecurringRule()
  const markReviewed = useMarkReviewed()
  const updateRule = useUpdateRecurringRule()

  const [type, setType] = useState<EntryType>(initialType)
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
  // Transfer fee (edit mode, transfer type)
  const [transferFeeEnabled, setTransferFeeEnabled] = useState(false)
  const [transferFeeAmount, setTransferFeeAmount] = useState('')
  // Propagate edits to the parent recurring rule
  const [applyToRule, setApplyToRule] = useState(false)

  // Whether the initialCash enablement has already been applied (open-once
  // semantics) — wallet changes must never force cash back on and fight the
  // user's manual toggle.
  const initialCashAppliedRef = useRef(false)

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
    isNativeCameraAvailable().then(setNativeCameraAvailable).catch(() => setNativeCameraAvailable(false))
  }, [])

  // One-shot: when opened in cash mode, pick a cash wallet and enable cash
  // tracking only if the picked wallet is actually a cash wallet — the switch
  // UI (showCashAssistant) requires one, so enabling cash for any other wallet
  // would trap every save behind "Enter the cash amount given".
  useEffect(() => {
    if (!initialCash || wallets.length === 0) return
    const last = localStorage.getItem(LAST_WALLET_KEY)
    const picked = pickQuickAddWallet(wallets, last, true)
    if (!walletId) setWalletId(picked?.id ?? '')
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
  }, [initialCash, wallets, walletId])

  // One-shot edit prefill: runs after the restore effects so the transaction's
  // own values win over last-used defaults.
  const prefillAppliedRef = useRef(false)
  useEffect(() => {
    if (!editTransaction || prefillAppliedRef.current) return
    prefillAppliedRef.current = true
    const t = editTransaction
    const origCurrency = t.original_currency ?? money.displayCurrency
    setType(t.type === 'income' || t.type === 'transfer' ? t.type : 'expense')
    setDescription(t.description)
    setAmount(String(t.original_amount ?? t.amount))
    setInputCurrency(origCurrency)
    setDate(t.date)
    setCategory(t.category)
    setWalletId(t.wallet_id ?? wallets[0]?.id ?? '')
    setTransferWalletId(t.transfer_wallet_id ?? wallets.find(w => w.id !== t.wallet_id)?.id ?? '')
    if (t.cash_tendered && t.cash_tendered > 0) {
      setCashEnabled(true)
      setCashTendered(formatNumberInput(Math.round(money.fromBase(t.cash_tendered, origCurrency))))
      const linked = transactions.filter(tx => tx.linked_transaction_id === t.id && tx.is_system_generated)
      setChangeBillsWalletId(linked.find(tx => tx.description?.startsWith('Change bills'))?.transfer_wallet_id ?? '')
      setChangeCoinsWalletId(
        linked.find(tx => tx.description?.startsWith('Change coins'))?.transfer_wallet_id
        ?? linked.find(tx => tx.description?.startsWith('Change'))?.transfer_wallet_id
        ?? ''
      )
    }
    if (t.split_portions && t.split_portions.length > 0) {
      setSplitEnabled(true)
      setSplitPortions(t.split_portions.map(p => ({ category: p.category, amount: formatNumberInput(money.fromBase(p.amount, origCurrency)) })))
    }
    if (t.wallet_splits && t.wallet_splits.length > 0) {
      setMultiWalletEnabled(true)
      setWalletSplits(t.wallet_splits.map(w => ({ wallet_id: w.wallet_id, amount: formatNumberInput(money.fromBase(w.amount, origCurrency)) })))
    }
    const fee = transactions.find(tx => tx.linked_transaction_id === t.id && tx.category === 'Transfer Fee' && tx.is_system_generated)
    if (fee) {
      setTransferFeeEnabled(true)
      setTransferFeeAmount(String(fee.original_amount ?? fee.amount))
    }
  }, [editTransaction, money, transactions, wallets])

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
    setTransferFeeEnabled(false)
    setTransferFeeAmount('')
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

  const handleSave = async (): Promise<boolean> => {
    return saveTransactionEntry({
      type, amount, inputCurrency, date, description, category, walletId, transferWalletId,
      cannotSaveTransfer,
      cashEnabled, cashTendered, showCashAssistant,
      changeBillsWalletId, changeCoinsWalletId,
      splitEnabled, splitPortions,
      multiWalletEnabled, walletSplits,
      toBase: money.toBase,
      addTransaction: addTransaction.mutateAsync,
      updateTransaction: updateTransaction.mutateAsync,
      deleteTransaction: deleteTransaction.mutateAsync,
      editId: editTransaction?.id,
      editPreserve: editTransaction ? {
        recurring_rule_id: editTransaction.recurring_rule_id ?? null,
        recurring_due_date: editTransaction.recurring_due_date ?? null,
      } : undefined,
      editCleanup: editTransaction ? {
        prevLinkedId: editTransaction.linked_transaction_id ?? null,
        linkedTxIds: transactions.filter(tx => tx.linked_transaction_id === editTransaction.id && tx.is_system_generated).map(tx => tx.id),
        feeTxIds: transactions.filter(tx => tx.linked_transaction_id === editTransaction.id && tx.category === 'Transfer Fee' && tx.is_system_generated).map(tx => tx.id),
      } : undefined,
      transferFeeEnabled, transferFeeAmount,
      editRuleId: applyToRule && editTransaction?.recurring_rule_id ? editTransaction.recurring_rule_id : undefined,
      updateRule: applyToRule ? updateRule.mutateAsync : undefined,
      onDone,
    })
  }

  const changeType = (t: EntryType) => {
    setType(t)
    setCategory(t === 'income' ? INCOME_CATEGORIES[0] : categories[0]?.name ?? '')
    setCashEnabled(false)
    setCashTendered('')
    setSplitEnabled(false)
    setMultiWalletEnabled(false)
  }

  const changeWallet = (id: string) => {
    setWalletId(id)
    setCashEnabled(false)
    setCashTendered('')
    setSplitEnabled(false)
    setMultiWalletEnabled(false)
  }

  const title = editTransaction
    ? 'Edit transaction'
    : showAdvanced
      ? 'New transaction'
      : type === 'transfer' ? 'Transfer money'
      : type === 'income' ? 'Add income'
      : cashEnabled ? 'Cash payment'
      : 'Add expense'

  const typeToggle = (compact: boolean) => (
    <div className={compact ? 'inline-flex rounded-full border border-border bg-secondary p-1' : 'mx-auto mb-3 inline-flex rounded-full border border-border bg-secondary p-1'}>
      {(['expense', 'income', 'transfer'] as const).map(t => (
        <button
          key={t}
          type="button"
          aria-label={t[0].toUpperCase() + t.slice(1)}
          onClick={() => changeType(t)}
          className={`rounded-full ${compact ? 'px-4 py-1.5 text-sm' : 'px-5 py-2 text-sm'} font-extrabold capitalize transition-colors ${
            type === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  )

  const categoryChips = () => {
    if (type === 'transfer') return null
    const chips = type === 'income'
      ? INCOME_CATEGORIES.map(c => ({ key: c, name: c, icon: null, color: '' }))
      : categories.map(c => ({ key: c.id, name: c.name, icon: c.icon, color: c.color }))
    return (
      <div>
        <p className="mb-2 text-sm font-bold text-foreground">Category</p>
        {type === 'expense' && categories.length === 0 ? (
          <Link
            to="/budget"
            onClick={onNavigate}
            className="flex h-11 items-center justify-between rounded-md border border-primary/30 bg-primary/5 px-3 text-sm font-bold text-primary hover:bg-primary/10"
          >
            <span>No categories yet</span>
            <span>Set up now →</span>
          </Link>
        ) : (
          <div className={`flex flex-wrap gap-2 ${chips.length > 10 ? 'max-h-28 overflow-y-auto' : ''}`}>
            {chips.map(c => (
              <button
                key={c.key}
                type="button"
                onClick={() => setCategory(c.name)}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-bold transition-colors ${
                  category === c.name
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-muted-foreground hover:text-foreground'
                }`}
              >
                {c.icon ? (
                  <span className="leading-none">{c.icon}</span>
                ) : c.color ? (
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{ background: category === c.name ? 'currentColor' : c.color }}
                  />
                ) : null}
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  const walletSection = () => {
    if (type === 'transfer') {
      return wallets.length < 2 ? (
        <Link to="/settings" onClick={onNavigate} className="flex h-11 items-center justify-between rounded-md border border-primary/30 bg-primary/5 px-3 text-sm font-bold text-primary">
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
    }
    return (
      <div>
        <p className="mb-2 text-sm font-bold text-foreground">Wallet</p>
        {wallets.length === 0 ? (
          <Link
            to="/settings"
            onClick={onNavigate}
            className="flex h-11 items-center justify-between rounded-md border border-primary/30 bg-primary/5 px-3 text-sm font-bold text-primary hover:bg-primary/10"
          >
            <span>No wallets yet</span>
            <span>Add one →</span>
          </Link>
        ) : wallets.length <= 5 ? (
          <div className="flex flex-wrap gap-2">
            {wallets.map(w => (
              <button
                key={w.id}
                type="button"
                onClick={() => changeWallet(w.id)}
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
            className="h-11 w-full rounded-md border border-input bg-secondary px-3 text-sm font-bold text-foreground outline-none"
            value={walletId || wallets[0]?.id || ''}
            onChange={e => changeWallet(e.target.value)}
          >
            {wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        )}
      </div>
    )
  }

  const saveBar = () => {
    const needsWallet = wallets.length === 0
    const needsCategory = type === 'expense' && categories.length === 0 && (variant === 'page' || !showAdvanced)
    return (
      <div
        className={
          variant === 'page'
            ? 'fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background px-4 pt-3 lg:hidden'
            : 'sticky bottom-0 -mx-5 bg-background px-5 pb-safe-4 pt-3'
        }
        style={variant === 'page' ? { paddingBottom: 'env(safe-area-inset-bottom, 12px)' } : undefined}
      >
        {needsWallet ? (
          <Link
            to="/settings"
            onClick={onNavigate}
            className="flex h-14 w-full items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary transition-colors hover:bg-primary/20"
          >
            Add a wallet to get started →
          </Link>
        ) : needsCategory ? (
          <Link
            to="/budget"
            onClick={onNavigate}
            className="flex h-14 w-full items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary transition-colors hover:bg-primary/20"
          >
            Add a budget category first →
          </Link>
        ) : (
          <>
            {editTransaction?.needs_review && (
              <Button
                className="mb-2 w-full gap-2 bg-[#FFCF73] font-extrabold text-background hover:bg-[#FFCF73]/90"
                onClick={async () => {
                  const ok = await handleSave()
                  if (ok) await markReviewed.mutateAsync(editTransaction.id)
                }}
              >
                <CheckCircle className="h-4 w-4" />
                Mark reviewed & save
              </Button>
            )}
            <Button
              className="h-14 w-full text-base font-extrabold"
              onClick={handleSave}
              disabled={
                addTransaction.isPending ||
                updateTransaction.isPending ||
                addRecurringRule.isPending ||
                parseNumberInput(amount) <= 0 ||
                cannotSaveTransfer
              }
            >
              {addTransaction.isPending || updateTransaction.isPending ? 'Saving…' : editTransaction ? `Save ${type}` : variant === 'page' ? 'Save transaction' : `Add ${type}`}
            </Button>
          </>
        )}
      </div>
    )
  }

  // —— Quick mode ——
  const quickSections = (
    <>
      {variant === 'sheet' && <div className="flex justify-center">{typeToggle(true)}</div>}

      {/* Big amount card */}
      <div className="rounded-[1.4rem] border border-border bg-card px-4 pb-4 pt-5 text-center">
        <div className="flex items-center justify-center gap-2">
          {variant === 'page' ? (
            <select
              aria-label="Input currency"
              className="cursor-pointer rounded-full border-0 bg-transparent text-lg font-bold text-muted-foreground outline-none"
              value={inputCurrency}
              onChange={e => { e.stopPropagation(); setInputCurrency(e.target.value) }}
              onClick={e => e.stopPropagation()}
            >
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          ) : (
            <span className="text-xl font-bold text-muted-foreground">{inputCurrency}</span>
          )}
          <MoneyField
            value={amount}
            onChange={setAmount}
            currency={inputCurrency}
            ariaLabel="Amount"
            className={`h-16 cursor-pointer border-0 bg-transparent text-center text-5xl font-extrabold shadow-none focus-visible:ring-0 ${variant === 'page' ? 'w-48' : 'w-44'}`}
            keypadDoneLabel="Confirm amount"
          />
        </div>
        <Input
          aria-label="Date"
          className="mx-auto mt-3 max-w-[190px] rounded-full bg-secondary text-center text-sm"
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          onClick={variant === 'page' ? e => e.stopPropagation() : undefined}
        />
      </div>

      {/* Page: merchant + scan row (sheet has this in advanced mode only) */}
      {variant === 'page' && (
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
      )}

      {categoryChips()}
      {walletSection()}

      {/* Sheet: plain note input */}
      {variant === 'sheet' && (
        <Input
          aria-label="Description"
          className="bg-secondary"
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Note (optional)"
        />
      )}

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
  )

  // —— Advanced mode ——
  const advancedSections = (
    <>
      {/* Type + Amount + Scan */}
      <div className="rounded-[1.4rem] border border-border bg-card p-4 text-center">
        <div className="flex justify-center">{typeToggle(false)}</div>
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
                onClick={onNavigate}
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
                  : categories.map(c => <option key={c.id} value={c.name}>{c.icon ? `${c.icon} ${c.name}` : c.name}</option>)
                }
              </select>
            )}
          </div>
          <div>
            <Label className="text-sm font-bold text-foreground">Wallet</Label>
            {wallets.length === 0 ? (
              <Link
                to="/settings"
                onClick={onNavigate}
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
                onChange={e => changeWallet(e.target.value)}
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
        <div className="rounded-[1.4rem] border border-border bg-card p-4">
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
                    {categories.map(c => <option key={c.id} value={c.name}>{c.icon ? `${c.icon} ${c.name}` : c.name}</option>)}
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
        <div className="rounded-[1.4rem] border border-border bg-card p-4">
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

      {/* —— Apply to recurring rule (edits of rule-generated payments) —— */}
      {editTransaction?.recurring_rule_id && (
        <div className="rounded-[1.4rem] border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-4">
            <span>
              <span className="block text-sm font-extrabold text-foreground">Apply to recurring rule</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">Update the rule so future due payments match this edit</span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={applyToRule}
              aria-label="Apply to recurring rule"
              onClick={() => setApplyToRule(v => !v)}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${applyToRule ? 'bg-primary' : 'bg-muted'}`}
            >
              <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${applyToRule ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
        </div>
      )}

      {/* —— Transfer fee (transfer edits only) —— */}
      {type === 'transfer' && editTransaction && (
        <div className="rounded-[1.4rem] border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-4">
            <span>
              <span className="block text-sm font-extrabold text-foreground">Transfer fee</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">Add the fee this transfer cost, tracked as its own expense</span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={transferFeeEnabled}
              aria-label="Add transfer fee"
              onClick={() => {
                setTransferFeeEnabled(!transferFeeEnabled)
                if (transferFeeEnabled) setTransferFeeAmount('')
              }}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${transferFeeEnabled ? 'bg-primary' : 'bg-muted'}`}
            >
              <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${transferFeeEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
          {transferFeeEnabled && (
            <div className="mt-3">
              <MoneyField
                value={transferFeeAmount}
                onChange={setTransferFeeAmount}
                currency={inputCurrency}
                ariaLabel="Transfer fee amount"
                className="h-11 w-full rounded-lg bg-secondary text-sm font-extrabold"
              />
            </div>
          )}
        </div>
      )}

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
  )

  if (variant === 'page') {
    return (
      <div>
        {/* ── Page header — bleed full width past AppLayout padding ── */}
        <div className="-mx-4 -mt-6 mb-5 flex items-center gap-2 border-b border-border bg-background px-4 py-3 sm:-mx-6 sm:px-6">
          <button
            type="button"
            aria-label="Go back"
            onClick={onBack}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors active:bg-muted/40 hover:text-foreground"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          {/* Type toggle (hidden in advanced mode — the advanced card has one) */}
          <div className="flex flex-1 justify-center">
            {showAdvanced ? null : typeToggle(true)}
          </div>

          <button
            type="button"
            onClick={reset}
            className="shrink-0 rounded-full px-3 py-1.5 text-xs font-bold text-muted-foreground transition-colors active:bg-muted/40 hover:text-foreground"
          >
            Clear all
          </button>
        </div>

        {/* ── Form fields ── */}
        <div className="space-y-4 pb-28">
          {showAdvanced ? advancedSections : quickSections}
        </div>

        {/* ── Cash-change assistant ── */}
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

        {/* ── Fixed save button ── */}
        {saveBar()}
      </div>
    )
  }

  return (
    <>
      <SheetHeader className="mb-4 text-left">
        <SheetTitle>{title}</SheetTitle>
      </SheetHeader>

      <div className="space-y-4">
        {showAdvanced ? advancedSections : quickSections}

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
            onClose={onNavigate}
          />
        )}

        {/* —— Sticky save button —— */}
        {saveBar()}
      </div>
    </>
  )
}
