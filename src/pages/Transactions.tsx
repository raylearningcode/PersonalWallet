import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  useTransactions,
  useDeleteTransaction,
  useAddTransaction,
  useUpdateTransaction,
  useBudgetCategories,
  useWallets,
  useRecurringRules,
  useAddRecurringRule,
  useUpdateRecurringRule,
  useRunDueRecurringRules,
  useMarkReviewed,
} from '@/lib/queries'
import { PageHeader } from '@/components/shared/PageHeader'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { Trash2, Pencil, Plus, Copy, CheckCircle, X, ReceiptText, CheckSquare, Square, ChevronLeft, ChevronRight, Wallet as WalletIcon, ArrowRightLeft, Banknote, Tag, FileDown, SlidersHorizontal, AlertTriangle, CalendarDays } from 'lucide-react'
import { toast } from 'sonner'
import { CURRENCIES, useMoney, txAmountColor, txAmountSign } from '@/lib/currency'
import { formatNumberInput, parseNumberInput } from '@/lib/numberInput'
import { formatDate } from '@/lib/utils'
import { getMerchantSuggestion, getRecurringCandidates } from '@/lib/financeOs'
import { addRecurringInterval } from '@/lib/recurring'
import { MoneyKeypad } from '@/components/mobile/MoneyKeypad'
import { splitChangeByPolicy, getFiftyCoinRouting } from '@/lib/cashChange'
import { CashChangeAssistant } from '@/components/transactions/CashChangeAssistant'
import type { RecurringFrequency, RecurringRule, Transaction } from '@/types'
import { Skeleton } from '@/components/ui/skeleton'
import { useIsDesktop } from '@/hooks/useIsDesktop'

type Filter = 'all' | 'income' | 'expense' | 'transfer' | 'needs_review'
type EntryType = 'income' | 'expense' | 'transfer'
const INCOME_CATEGORIES = ['Wage', 'Gift', 'Refund', 'Allowance', 'Other income']

function getMonthStart() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function getLastDay(year: number, month: number) {
  return new Date(year, month, 0).toISOString().slice(0, 10)
}

export function Transactions() {
  const money = useMoney()
  const [searchParams] = useSearchParams()
  const [filter, setFilter] = useState<Filter>(() => {
    const param = new URLSearchParams(window.location.search).get('filter')
    if (param === 'needs_review' || param === 'income' || param === 'expense' || param === 'transfer') return param
    return 'all'
  })
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('q') ?? '')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(() => {
    const action = new URLSearchParams(window.location.search).get('action')
    return action === 'expense' || action === 'income'
  })
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Transaction | null>(null)
  const [editingRule, setEditingRule] = useState<RecurringRule | null>(null)
  const [dateFrom, setDateFrom] = useState(getMonthStart)
  const [dateTo, setDateTo] = useState(() => { const d = new Date(); return getLastDay(d.getFullYear(), d.getMonth() + 1) })
  const [ruleDescription, setRuleDescription] = useState('')
  const [ruleAmount, setRuleAmount] = useState('')
  const [ruleInputCurrency, setRuleInputCurrency] = useState(money.displayCurrency)
  const [ruleFrequency, setRuleFrequency] = useState<RecurringFrequency>('monthly')
  const [ruleNextDueDate, setRuleNextDueDate] = useState('')
  const [ruleEndDate, setRuleEndDate] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [inputCurrency, setInputCurrency] = useState(money.displayCurrency)
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [category, setCategory] = useState('')
  const [walletId, setWalletId] = useState('')
  const [transferWalletId, setTransferWalletId] = useState('')
  const [type, setType] = useState<EntryType>(() => {
    const action = new URLSearchParams(window.location.search).get('action')
    return (action === 'income' ? 'income' : 'expense') as EntryType
  })
  const [cashEnabled, setCashEnabled] = useState(false)
  const [cashTendered, setCashTendered] = useState('')
  const [changeBillsWalletId, setChangeBillsWalletId] = useState('')
  const [changeCoinsWalletId, setChangeCoinsWalletId] = useState('')
  const [splitEnabled, setSplitEnabled] = useState(false)
  const [splitPortions, setSplitPortions] = useState<{ category: string; amount: string }[]>([])
  const [multiWalletEnabled, setMultiWalletEnabled] = useState(false)
  const [walletSplits, setWalletSplits] = useState<{ wallet_id: string; amount: string }[]>([])
  const [transferFeeEnabled, setTransferFeeEnabled] = useState(false)
  const [transferFeeAmount, setTransferFeeAmount] = useState('')
  const [feeKeypad, setFeeKeypad] = useState(false)
  const [formActiveKeypad, setFormActiveKeypad] = useState<'amount' | null>(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false)
  const [bulkCategorySheet, setBulkCategorySheet] = useState(false)
  const [bulkCategoryTarget, setBulkCategoryTarget] = useState('')
  const [bulkDateSheet, setBulkDateSheet] = useState(false)
  const [bulkDate, setBulkDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [detailTx, setDetailTx] = useState<Transaction | null>(null)
  const [filterWalletId, setFilterWalletId] = useState('')
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [showCategories, setShowCategories] = useState(true)
  const [showRecurring, setShowRecurring] = useState(true)
  const [swipeOpenId, setSwipeOpenId] = useState<string | null>(null)
  const isDesktop = useIsDesktop()
  const generatedDueRef = useRef(false)
  const longPressRef = useRef(false)
  const longPressTimer = useRef<ReturnType<typeof setTimeout>>(null)
  const swipeRef = useRef<{ activeId: string | null; startX: number; startY: number; dx: number; isSwipe: boolean; wasSwipe: boolean }>({ activeId: null, startX: 0, startY: 0, dx: 0, isSwipe: false, wasSwipe: false })
  const { data: transactions = [], isPending: txPending, isError: txError, refetch: txRefetch } = useTransactions(filter)
  const { data: allTransactions = [] } = useTransactions()
  const { data: categories = [] } = useBudgetCategories()
  const { data: wallets = [] } = useWallets()
  const { data: recurringRules = [] } = useRecurringRules()
  const addTransaction = useAddTransaction()
  const updateTransaction = useUpdateTransaction()
  const del = useDeleteTransaction()
  const addRecurringRule = useAddRecurringRule()
  const updateRecurringRule = useUpdateRecurringRule()
  const runDueRecurringRules = useRunDueRecurringRules()
  const markReviewed = useMarkReviewed()

  useEffect(() => {
    return () => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current)
    }
  }, [])

  useEffect(() => {
    if (!category && categories.length > 0) setCategory(categories[0].name)
  }, [categories, category])

  useEffect(() => {
    if (!walletId && wallets.length > 0) setWalletId(wallets[0].id)
    if (!transferWalletId && wallets.length > 1) setTransferWalletId(wallets[1].id)
  }, [walletId, transferWalletId, wallets])

  useEffect(() => {
    setInputCurrency(money.displayCurrency)
  }, [money.displayCurrency])

  useEffect(() => {
    if (!editingRule) setRuleInputCurrency(money.displayCurrency)
  }, [money.displayCurrency, editingRule])

  useEffect(() => {
    if (selectMode) setSwipeOpenId(null)
  }, [selectMode])

  useEffect(() => {
    if (generatedDueRef.current || recurringRules.length === 0) return
    const today = new Date().toISOString().slice(0, 10)
    if (!recurringRules.some(rule => rule.active && rule.next_due_date <= today)) return
    generatedDueRef.current = true
    runDueRecurringRules.mutate(undefined, {
      onSuccess: count => {
        if (count > 0) toast.success(`${count} recurring payment${count === 1 ? '' : 's'} added`)
      },
    })
  }, [recurringRules, runDueRecurringRules])

  useEffect(() => {
    if (!editingRule) return
    setRuleDescription(editingRule.description)
    setRuleAmount(String(editingRule.original_amount ?? editingRule.amount))
    setRuleInputCurrency(editingRule.original_currency ?? money.displayCurrency)
    setRuleFrequency(editingRule.frequency)
    setRuleNextDueDate(editingRule.next_due_date)
    setRuleEndDate(editingRule.end_date ?? '')
  }, [editingRule, money.baseCurrency])

  const moneyIn = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const moneyOut = transactions.filter(t => t.type !== 'income' && t.type !== 'transfer').reduce((s, t) => s + t.amount, 0)
  const cannotSaveTransfer = type === 'transfer' && (wallets.length < 2 || !walletId || !transferWalletId || walletId === transferWalletId)
  const sortedTransactions = useMemo(
    () => {
      // Hide system-generated change transfers from the main list
      let visibleTransactions = transactions.filter(tx => !tx.is_system_generated)
      if (selectedCategory) visibleTransactions = visibleTransactions.filter(tx => tx.category === selectedCategory && tx.type !== 'income' && tx.type !== 'transfer')
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        visibleTransactions = visibleTransactions.filter(tx => {
          if (tx.description.toLowerCase().includes(q)) return true
          if (tx.category.toLowerCase().includes(q)) return true
          if (tx.date.includes(q)) return true
          const displayAmt = String(tx.original_amount ?? tx.amount)
          if (displayAmt.includes(q)) return true
          const wallet = wallets.find(w => w.id === tx.wallet_id)
          if (wallet?.name.toLowerCase().includes(q)) return true
          return false
        })
      }
      if (dateFrom) visibleTransactions = visibleTransactions.filter(tx => tx.date >= dateFrom)
      if (dateTo) visibleTransactions = visibleTransactions.filter(tx => tx.date <= dateTo)
      if (filterWalletId) visibleTransactions = visibleTransactions.filter(tx => tx.wallet_id === filterWalletId || tx.transfer_wallet_id === filterWalletId)
      return [...visibleTransactions].sort((a, b) => `${b.date}-${b.created_at ?? ''}`.localeCompare(`${a.date}-${a.created_at ?? ''}`))
    },
    [selectedCategory, transactions, searchQuery, dateFrom, dateTo, filterWalletId]
  )
  const expenseCategoryTotals = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>()
    transactions.filter(tx => tx.type !== 'income' && tx.type !== 'transfer').forEach(tx => {
      const current = map.get(tx.category) ?? { total: 0, count: 0 }
      map.set(tx.category, { total: current.total + tx.amount, count: current.count + 1 })
    })
    return [...map.entries()].sort((a, b) => b[1].total - a[1].total)
  }, [transactions])
  const groupedTransactions = useMemo(() => {
    const groups = new Map<string, Transaction[]>()
    sortedTransactions.forEach(tx => {
      groups.set(tx.date, [...(groups.get(tx.date) ?? []), tx])
    })
    return [...groups.entries()]
  }, [sortedTransactions])
  const categoryColorMap = useMemo(() => {
    const map = new Map<string, string>()
    categories.forEach(c => map.set(c.name, c.color))
    return map
  }, [categories])

  const selectedCategoryTotal = selectedCategory
    ? expenseCategoryTotals.find(([name]) => name === selectedCategory)?.[1].total ?? 0
    : 0
  const selectedCategoryBudget = selectedCategory
    ? categories.find(item => item.name === selectedCategory)?.yearly_allocated ?? 0
    : 0
  const selectedCategoryUsedPct = selectedCategoryBudget > 0
    ? Math.round((selectedCategoryTotal / selectedCategoryBudget) * 100)
    : 0
  const merchantSuggestion = useMemo(
    () => type === 'transfer' ? null : getMerchantSuggestion(description, transactions),
    [description, transactions, type]
  )
  const upcomingRecurringRules = useMemo(
    () => [...recurringRules].sort((a, b) => a.next_due_date.localeCompare(b.next_due_date)).slice(0, 6),
    [recurringRules]
  )

  const recurringCandidates = useMemo(() => {
    const ruleDescriptions = new Set(recurringRules.map(r => r.description.toLowerCase()))
    return getRecurringCandidates(transactions).filter(
      c => !ruleDescriptions.has(c.description.toLowerCase())
    ).slice(0, 4)
  }, [transactions, recurringRules])

  const potentialDuplicates = useMemo(() => {
    const candidates: { a: Transaction; b: Transaction }[] = []
    // Use allTransactions (unfiltered) so duplicates are caught regardless of which tab is active
    const sorted = allTransactions
      .filter(t => !t.is_system_generated)
      .sort((a, b) => a.date.localeCompare(b.date))
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i]; const b = sorted[j]
        const dayDiff = Math.abs(new Date(a.date).getTime() - new Date(b.date).getTime()) / 86400000
        if (dayDiff > 2) break // sorted by date â€” once gap > 2 days, no need to scan further
        if (a.type !== b.type) continue
        const descMatch = a.description.toLowerCase() === b.description.toLowerCase()
        const maxAmt = Math.max(a.amount, b.amount)
        const amtMatch = maxAmt === 0 ? true : Math.abs(a.amount - b.amount) / maxAmt < 0.01
        if (descMatch && amtMatch) {
          candidates.push({ a, b })
          if (candidates.length >= 10) return candidates
        }
      }
    }
    return candidates
  }, [allTransactions])

  const resetForm = () => {
    setEditingTransaction(null)
    setDescription('')
    setAmount('')
    setInputCurrency(money.displayCurrency)
    setDate(new Date().toISOString().slice(0, 10))
    setType('expense')
    setCategory(categories[0]?.name ?? '')
    setCashEnabled(false)
    setCashTendered('')
    setChangeBillsWalletId('')
    setChangeCoinsWalletId('')
    setTransferFeeEnabled(false)
    setTransferFeeAmount('')
    setFeeKeypad(false)
    setSplitEnabled(false)
    setSplitPortions([])
    setMultiWalletEnabled(false)
    setWalletSplits([])
    if (wallets[0]) setWalletId(wallets[0].id)
    if (wallets[1]) setTransferWalletId(wallets[1].id)
  }

  const openAddForm = () => {
    resetForm()
    setIsFormOpen(true)
  }

  const openEditForm = (transaction: Transaction) => {
    setEditingTransaction(transaction)
    setDescription(transaction.description)
    setAmount(String(transaction.original_amount ?? transaction.amount))
    setInputCurrency(transaction.original_currency ?? money.displayCurrency)
    setDate(transaction.date)
    setCategory(transaction.category)
    setWalletId(transaction.wallet_id ?? wallets[0]?.id ?? '')
    setTransferWalletId(transaction.transfer_wallet_id ?? wallets.find(wallet => wallet.id !== transaction.wallet_id)?.id ?? '')
    setType(transaction.type === 'income' || transaction.type === 'transfer' ? transaction.type : 'expense')
    if (transaction.cash_tendered && transaction.cash_tendered > 0) {
      const origCurrency = transaction.original_currency ?? money.displayCurrency
      const tenderedInOrig = money.fromBase(transaction.cash_tendered, origCurrency)
      setCashEnabled(true)
      setCashTendered(formatNumberInput(Math.round(tenderedInOrig)))
      const linkedChangeTxs = transactions.filter(tx => tx.linked_transaction_id === transaction.id && tx.is_system_generated)
      setChangeBillsWalletId(linkedChangeTxs.find(tx => tx.description?.startsWith('Change bills'))?.transfer_wallet_id ?? '')
      setChangeCoinsWalletId(
        linkedChangeTxs.find(tx => tx.description?.startsWith('Change coins'))?.transfer_wallet_id
        ?? linkedChangeTxs.find(tx => tx.description?.startsWith('Change'))?.transfer_wallet_id
        ?? ''
      )
    } else {
      setCashEnabled(false)
      setCashTendered('')
      setChangeBillsWalletId('')
      setChangeCoinsWalletId('')
    }
    const existingFee = transactions.find(tx => tx.linked_transaction_id === transaction.id && tx.category === 'Transfer Fee' && tx.is_system_generated)
    if (existingFee) {
      setTransferFeeEnabled(true)
      setTransferFeeAmount(String(existingFee.original_amount ?? existingFee.amount))
    } else {
      setTransferFeeEnabled(false)
      setTransferFeeAmount('')
    }
    // Load split data from existing transaction
    if (transaction.split_portions && transaction.split_portions.length > 0) {
      setSplitEnabled(true)
      const origCurrency = transaction.original_currency ?? money.displayCurrency
      setSplitPortions(transaction.split_portions.map(p => ({
        category: p.category,
        amount: formatNumberInput(money.fromBase(p.amount, origCurrency)),
      })))
    } else { setSplitEnabled(false); setSplitPortions([]) }
    if (transaction.wallet_splits && transaction.wallet_splits.length > 0) {
      setMultiWalletEnabled(true)
      const origCurrency = transaction.original_currency ?? money.displayCurrency
      setWalletSplits(transaction.wallet_splits.map(w => ({
        wallet_id: w.wallet_id,
        amount: formatNumberInput(money.fromBase(w.amount, origCurrency)),
      })))
    } else { setMultiWalletEnabled(false); setWalletSplits([]) }
    setFeeKeypad(false)
    setIsFormOpen(true)
  }

  const handleSaveTransaction = async () => {
    const parsedAmount = parseNumberInput(amount)
    if (!description.trim() && type !== 'transfer') { toast.error('Please enter a merchant name'); return }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) { toast.error('Please enter a valid amount'); return }
    if (type === 'transfer' && (!walletId || !transferWalletId || walletId === transferWalletId)) { toast.error('Select two different wallets for a transfer'); return }
    const txCategory = type === 'income' ? (category || INCOME_CATEGORIES[0]) : category
    if (type !== 'transfer' && (!txCategory || !walletId)) return

    // Cash change validation
    const parsedTendered = cashEnabled ? parseNumberInput(cashTendered) : 0
    if (cashEnabled && type === 'expense' && (!Number.isFinite(parsedTendered) || parsedTendered < parsedAmount)) {
      toast.error('Cash given must be at least the expense amount')
      return
    }

    const baseAmount = money.toBase(parsedAmount, inputCurrency)
    const baseTendered = cashEnabled ? money.toBase(parsedTendered, inputCurrency) : 0
    const baseChange = Math.max(0, baseTendered - baseAmount)

    // Compute split data
    const computedSplitPortions = splitEnabled && splitPortions.length >= 2
      ? splitPortions.map(p => ({ category: p.category, amount: money.toBase(parseNumberInput(p.amount), inputCurrency) })).filter(p => p.amount > 0)
      : null
    const computedWalletSplits = multiWalletEnabled && walletSplits.length >= 2
      ? walletSplits.map(w => ({ wallet_id: w.wallet_id, amount: money.toBase(parseNumberInput(w.amount), inputCurrency) })).filter(w => w.amount > 0)
      : null

    const payload = {
      description: description.trim() || (type === 'transfer' ? 'Transfer' : ''),
      amount: baseAmount,
      original_amount: parsedAmount,
      original_currency: inputCurrency,
      type,
      category: type === 'transfer' ? 'Transfer' : (computedSplitPortions ? 'Split' : txCategory),
      wallet_id: computedWalletSplits ? null : (walletId || null),
      transfer_wallet_id: type === 'transfer' ? transferWalletId : null,
      recurring_rule_id: editingTransaction?.recurring_rule_id ?? null,
      recurring_due_date: editingTransaction?.recurring_due_date ?? null,
      date,
      needs_review: false,
      cash_tendered: cashEnabled && baseTendered > 0 ? baseTendered : null,
      split_portions: computedSplitPortions,
      wallet_splits: computedWalletSplits,
    }

    const editingTx = editingTransaction
    setIsFormOpen(false)
    resetForm()
    try {
      if (editingTx) {
        await updateTransaction.mutateAsync({ id: editingTx.id, ...payload })
        // For edit: delete any previous linked change transfers and recreate with split logic
        const prevLinkedId = editingTx.linked_transaction_id
        const allPrevLinked = transactions.filter(tx => tx.linked_transaction_id === editingTx.id && tx.is_system_generated)
        if (prevLinkedId && !allPrevLinked.find(tx => tx.id === prevLinkedId)) await del.mutateAsync(prevLinkedId)
        for (const tx of allPrevLinked) await del.mutateAsync(tx.id)
        if (cashEnabled && baseChange > 0) {
          const isTWDEdit = inputCurrency === 'TWD'
          const rawChangeEdit = parsedTendered - parsedAmount
          const { bills: billsChangeEdit, coins: coinsChangeEdit } = isTWDEdit
            ? splitChangeByPolicy(rawChangeEdit, { currency: 'TWD', routeFiftyCoinTo: getFiftyCoinRouting() })
            : { bills: 0, coins: rawChangeEdit }
          let firstEditChangeTxId: string | undefined
          if (isTWDEdit && billsChangeEdit > 0 && changeBillsWalletId && changeBillsWalletId !== walletId) {
            const ct = await addTransaction.mutateAsync({
              description: `Change bills â€” ${description.trim()}`,
              amount: money.toBase(billsChangeEdit, inputCurrency),
              original_amount: billsChangeEdit,
              original_currency: inputCurrency,
              type: 'transfer', category: 'Transfer',
              wallet_id: walletId || null,
              transfer_wallet_id: changeBillsWalletId,
              recurring_rule_id: null, recurring_due_date: null, date,
              needs_review: false, is_system_generated: true,
              linked_transaction_id: editingTx.id, cash_tendered: null,
            })
            firstEditChangeTxId = ct?.id
          }
          if (isTWDEdit && coinsChangeEdit > 0 && changeCoinsWalletId) {
            const ct = await addTransaction.mutateAsync({
              description: `Change coins â€” ${description.trim()}`,
              amount: money.toBase(coinsChangeEdit, inputCurrency),
              original_amount: coinsChangeEdit,
              original_currency: inputCurrency,
              type: 'transfer', category: 'Transfer',
              wallet_id: walletId || null,
              transfer_wallet_id: changeCoinsWalletId,
              recurring_rule_id: null, recurring_due_date: null, date,
              needs_review: false, is_system_generated: true,
              linked_transaction_id: editingTx.id, cash_tendered: null,
            })
            if (!firstEditChangeTxId) firstEditChangeTxId = ct?.id
          }
          if (!isTWDEdit && changeCoinsWalletId) {
            const ct = await addTransaction.mutateAsync({
              description: `Change â€” ${description.trim()}`,
              amount: baseChange,
              original_amount: rawChangeEdit,
              original_currency: inputCurrency,
              type: 'transfer', category: 'Transfer',
              wallet_id: walletId || null,
              transfer_wallet_id: changeCoinsWalletId,
              recurring_rule_id: null, recurring_due_date: null, date,
              needs_review: false, is_system_generated: true,
              linked_transaction_id: editingTx.id, cash_tendered: null,
            })
            firstEditChangeTxId = ct?.id
          }
          if (firstEditChangeTxId) {
            await updateTransaction.mutateAsync({ id: editingTx.id, linked_transaction_id: firstEditChangeTxId })
          }
        }
        if (type === 'transfer') {
          const oldFees = transactions.filter(tx => tx.linked_transaction_id === editingTx.id && tx.category === 'Transfer Fee' && tx.is_system_generated)
          for (const fee of oldFees) await del.mutateAsync(fee.id)
          if (transferFeeEnabled && parseNumberInput(transferFeeAmount) > 0) {
            const parsedFee = parseNumberInput(transferFeeAmount)
            await addTransaction.mutateAsync({
              description: `Transfer fee${description.trim() ? ` â€” ${description.trim()}` : ''}`,
              amount: money.toBase(parsedFee, inputCurrency),
              original_amount: parsedFee,
              original_currency: inputCurrency,
              type: 'expense', category: 'Transfer Fee',
              wallet_id: walletId || null,
              transfer_wallet_id: null,
              recurring_rule_id: null, recurring_due_date: null, date,
              needs_review: false, is_system_generated: true,
              linked_transaction_id: editingTx.id, cash_tendered: null,
            })
          }
        }
        toast.success('Transaction updated')
      } else {
        const savedTx = await addTransaction.mutateAsync(payload)
        // Create system-generated change transfer(s) when cash given > expense
        if (cashEnabled && baseChange > 0 && savedTx?.id) {
          const isTWD = inputCurrency === 'TWD'
          const rawChange = parsedTendered - parsedAmount
          const { bills: billsChangeAmt, coins: coinsChangeAmt } = isTWD
            ? splitChangeByPolicy(rawChange, { currency: 'TWD', routeFiftyCoinTo: getFiftyCoinRouting() })
            : { bills: 0, coins: rawChange }
          let firstChangeTxId: string | undefined

          // Bills transfer (only if destination != spending wallet and there are bills)
          if (isTWD && billsChangeAmt > 0 && changeBillsWalletId && changeBillsWalletId !== walletId) {
            const ct = await addTransaction.mutateAsync({
              description: `Change bills â€” ${description.trim()}`,
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
            firstChangeTxId = ct?.id
          }

          // Coins transfer
          if (isTWD && coinsChangeAmt > 0 && changeCoinsWalletId) {
            const ct2 = await addTransaction.mutateAsync({
              description: `Change coins â€” ${description.trim()}`,
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
            if (!firstChangeTxId) firstChangeTxId = ct2?.id
          }

          // Non-TWD: single change transfer to coinsWallet
          if (!isTWD && changeCoinsWalletId) {
            const ct3 = await addTransaction.mutateAsync({
              description: `Change â€” ${description.trim()}`,
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
            firstChangeTxId = ct3?.id
          }

          if (firstChangeTxId) {
            await updateTransaction.mutateAsync({ id: savedTx.id, linked_transaction_id: firstChangeTxId })
          }
        }
        if (type === 'transfer' && transferFeeEnabled && parseNumberInput(transferFeeAmount) > 0 && savedTx?.id) {
          const parsedFee = parseNumberInput(transferFeeAmount)
          await addTransaction.mutateAsync({
            description: `Transfer fee${description.trim() ? ` â€” ${description.trim()}` : ''}`,
            amount: money.toBase(parsedFee, inputCurrency),
            original_amount: parsedFee,
            original_currency: inputCurrency,
            type: 'expense', category: 'Transfer Fee',
            wallet_id: walletId || null,
            transfer_wallet_id: null,
            recurring_rule_id: null, recurring_due_date: null, date,
            needs_review: false, is_system_generated: true,
            linked_transaction_id: savedTx.id, cash_tendered: null,
          })
        }
        toast.success(cashEnabled && baseChange > 0 ? `Cash payment added Â· change routed to wallet` : 'Transaction added')
      }
    } catch {
      toast.error('Failed to save transaction')
    }
  }

  const handleDeleteTransaction = (tx: Transaction) => {
    setDeleteTarget(tx)
  }

  const confirmDeleteTransaction = async () => {
    if (!deleteTarget) return
    const linkedId = deleteTarget.linked_transaction_id
    // Find ALL system-generated transfers linked to this expense
    const allLinked = transactions.filter(tx => tx.linked_transaction_id === deleteTarget.id && tx.is_system_generated)
    setDeleteTarget(null)
    try {
      await del.mutateAsync(deleteTarget.id)
      if (linkedId && !allLinked.find(tx => tx.id === linkedId)) await del.mutateAsync(linkedId)
      for (const tx of allLinked) await del.mutateAsync(tx.id)
      toast.success('Transaction deleted')
    } catch {
      toast.error('Failed to delete transaction')
    }
  }

  const handleGenerateDue = () => {
    runDueRecurringRules.mutate(undefined, {
      onSuccess: count => toast.success(count > 0 ? `${count} recurring payment${count === 1 ? '' : 's'} added` : 'No recurring payment is due yet'),
    })
  }

  const handleDuplicateTransaction = async (tx: Transaction) => {
    await addTransaction.mutateAsync({
      description: tx.description,
      amount: tx.amount,
      original_amount: tx.original_amount ?? tx.amount,
      original_currency: tx.original_currency ?? money.baseCurrency,
      type: tx.type,
      category: tx.category,
      wallet_id: tx.wallet_id,
      transfer_wallet_id: tx.transfer_wallet_id,
      recurring_rule_id: null,
      recurring_due_date: null,
      date: new Date().toISOString().slice(0, 10),
      needs_review: false,
    })
    toast.success('Transaction duplicated')
  }

  const handleMarkReviewed = (id: string) => {
    markReviewed.mutate(id)
    toast.success('Marked as reviewed')
  }

  const handleAddCandidateAsRule = async (candidate: ReturnType<typeof getRecurringCandidates>[0]) => {
    if (!wallets[0]?.id) { toast.error('Add a wallet first'); return }
    const today = new Date().toISOString().slice(0, 10)
    await addRecurringRule.mutateAsync({
      description: candidate.description,
      amount: candidate.amount,
      original_amount: candidate.amount,
      original_currency: money.baseCurrency,
      type: 'expense',
      category: candidate.category,
      wallet_id: wallets[0].id,
      transfer_wallet_id: null,
      start_date: today,
      next_due_date: addRecurringInterval(today, 'monthly'),
      frequency: 'monthly',
      end_date: null,
      installment_total: null,
      installment_paid: 0,
      active: true,
    })
    toast.success(`${candidate.description} added as recurring rule`)
  }

  const toggleSelectMode = () => {
    setSelectMode(v => !v)
    setSelectedIds(new Set())
  }

  const toggleSelectId = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const selectAll = () => setSelectedIds(new Set(sortedTransactions.map(tx => tx.id)))

  const confirmBulkDelete = async () => {
    setBulkDeleteConfirm(false)
    const toDelete = sortedTransactions.filter(tx => selectedIds.has(tx.id))
    // Collect linked system-generated transfers to also remove
    const linkedIds = new Set<string>()
    toDelete.forEach(tx => {
      if (tx.linked_transaction_id) linkedIds.add(tx.linked_transaction_id)
      transactions.filter(t => t.linked_transaction_id === tx.id && t.is_system_generated).forEach(t => linkedIds.add(t.id))
    })
    const deleteSet = new Set([...toDelete.map(t => t.id), ...linkedIds])
    try {
      for (const id of deleteSet) await del.mutateAsync(id)
      toast.success(`${toDelete.length} transaction${toDelete.length === 1 ? '' : 's'} deleted`)
    } catch {
      toast.error('Failed to delete some transactions')
    }
    setSelectMode(false)
    setSelectedIds(new Set())
  }

  const bulkMarkReviewed = async () => {
    const toReview = sortedTransactions.filter(tx => selectedIds.has(tx.id) && tx.needs_review)
    for (const tx of toReview) markReviewed.mutate(tx.id)
    if (toReview.length > 0) toast.success(`${toReview.length} marked as reviewed`)
    setSelectMode(false)
    setSelectedIds(new Set())
  }

  const bulkExportCSV = () => {
    const selected = sortedTransactions.filter(tx => selectedIds.has(tx.id))
    if (selected.length === 0) return
    const headers = ['Date', 'Description', 'Category', 'Type', 'Amount', 'Currency', 'Wallet']
    const rows = selected.map(tx => {
      const w = wallets.find(wl => wl.id === tx.wallet_id)
      return [
        tx.date,
        `"${(tx.description ?? '').replace(/"/g, '""')}"`,
        tx.category,
        tx.type,
        money.fromBase(tx.amount, tx.original_currency ?? money.baseCurrency).toFixed(2),
        tx.original_currency ?? money.baseCurrency,
        w?.name ?? '',
      ]
    })
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `finpath-selected-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    toast.success(`${selected.length} transaction${selected.length !== 1 ? 's' : ''} exported`)
    setSelectMode(false)
    setSelectedIds(new Set())
  }

  const bulkRetime = async () => {
    if (!bulkDate) return
    const toUpdate = sortedTransactions.filter(tx => selectedIds.has(tx.id))
    try {
      for (const tx of toUpdate) await updateTransaction.mutateAsync({ id: tx.id, date: bulkDate })
      toast.success(`Date updated on ${toUpdate.length} transaction${toUpdate.length !== 1 ? 's' : ''}`)
    } catch {
      toast.error('Failed to update some dates')
    }
    setBulkDateSheet(false)
    setSelectMode(false)
    setSelectedIds(new Set())
  }

  const bulkChangeCategory = async () => {
    if (!bulkCategoryTarget) return
    const toUpdate = sortedTransactions.filter(tx => selectedIds.has(tx.id))
    for (const tx of toUpdate) await updateTransaction.mutateAsync({ id: tx.id, category: bulkCategoryTarget })
    toast.success(`Category updated on ${toUpdate.length} transaction${toUpdate.length !== 1 ? 's' : ''}`)
    setBulkCategorySheet(false)
    setBulkCategoryTarget('')
    setSelectMode(false)
    setSelectedIds(new Set())
  }

  const handleSaveRule = async () => {
    if (!editingRule) return
    const amount = parseNumberInput(ruleAmount)
    if (!ruleDescription.trim() || amount <= 0) { toast.error('Description and amount are required'); return }
    try {
      await updateRecurringRule.mutateAsync({
        id: editingRule.id,
        description: ruleDescription.trim(),
        amount: money.toBase(amount, ruleInputCurrency),
        original_amount: amount,
        original_currency: ruleInputCurrency,
        frequency: ruleFrequency,
        next_due_date: ruleNextDueDate || editingRule.next_due_date,
        end_date: ruleEndDate || null,
      })
      setEditingRule(null)
      toast.success('Rule updated')
    } catch {
      toast.error('Failed to update rule')
    }
  }

  // Month navigator
  const _today = new Date()
  const navYear = dateFrom ? parseInt(dateFrom.slice(0, 4)) : _today.getFullYear()
  const navMonth = dateFrom ? parseInt(dateFrom.slice(5, 7)) : _today.getMonth() + 1
  const isAllTime = !dateFrom && !dateTo
  const isOnCurrentMonth = navYear === _today.getFullYear() && navMonth === _today.getMonth() + 1
  const monthLabel = new Date(navYear, navMonth - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const activeFilterCount = (filterWalletId ? 1 : 0) + (isAllTime ? 1 : 0)

  const applyDatePreset = (preset: string) => {
    const d = new Date()
    const y = d.getFullYear(), m = d.getMonth() + 1
    if (preset === 'this-week') {
      const day = d.getDay()
      const mon = new Date(d); mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
      setDateFrom(mon.toISOString().slice(0, 10)); setDateTo(d.toISOString().slice(0, 10))
    } else if (preset === 'this-month') {
      setDateFrom(`${y}-${String(m).padStart(2, '0')}-01`); setDateTo(getLastDay(y, m))
    } else if (preset === 'last-month') {
      const lm = new Date(y, m - 2, 1); const ly = lm.getFullYear(), lmo = lm.getMonth() + 1
      setDateFrom(`${ly}-${String(lmo).padStart(2, '0')}-01`); setDateTo(getLastDay(ly, lmo))
    } else if (preset === 'last-3-months') {
      const start = new Date(y, m - 4, 1)
      setDateFrom(start.toISOString().slice(0, 10)); setDateTo(getLastDay(y, m))
    } else if (preset === 'this-year') {
      setDateFrom(`${y}-01-01`); setDateTo(`${y}-12-31`)
    } else if (preset === 'all-time') {
      setDateFrom(''); setDateTo('')
    }
  }

  const resetFilters = () => {
    const d = new Date()
    setDateFrom(getMonthStart()); setDateTo(getLastDay(d.getFullYear(), d.getMonth() + 1))
    setFilterWalletId('')
  }

  const goToPrevMonth = () => {
    const d = new Date(navYear, navMonth - 2, 1)
    const y = d.getFullYear(), m = d.getMonth() + 1
    setDateFrom(`${y}-${String(m).padStart(2, '0')}-01`)
    setDateTo(getLastDay(y, m))
  }

  const goToNextMonth = () => {
    const d = new Date(navYear, navMonth, 1)
    const y = d.getFullYear(), m = d.getMonth() + 1
    setDateFrom(`${y}-${String(m).padStart(2, '0')}-01`)
    setDateTo(getLastDay(y, m))
  }

  return (
    <div>
      <PageHeader
        title="Transactions"
        subtitle={<><span className="hidden sm:inline">Track every cashflow with clean filters, wallet routing, and category breakdowns.</span><span className="sm:hidden">Track spending and income.</span></>}
        searchValue={searchQuery}
        onSearchChange={q => { setSearchQuery(q); setSelectedCategory(null) }}
        action={(
          <Button onClick={openAddForm} className="hidden gap-2 lg:inline-flex">
            <Plus className="h-4 w-4" />
            New transaction
          </Button>
        )}
      />
      <div className="relative mb-8">
        <Tabs value={filter} onValueChange={v => { setFilter(v as Filter); setSelectedCategory(null); setSearchQuery(''); const d = new Date(); setDateFrom(getMonthStart()); setDateTo(getLastDay(d.getFullYear(), d.getMonth() + 1)) }} className="overflow-x-auto rounded-[1.4rem] border border-border bg-card p-4 sm:p-7">
          <TabsList className="min-w-max gap-3 bg-transparent p-0 sm:gap-5">
            {(['all', 'income', 'expense', 'transfer', 'needs_review'] as Filter[]).map(f => (
              <TabsTrigger
                key={f}
                value={f}
                className="h-11 min-w-24 rounded-full border border-border bg-transparent px-4 text-sm font-bold capitalize text-muted-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground sm:min-w-28 sm:px-6"
              >
                {f.replace('_', ' ')}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="pointer-events-none absolute inset-y-0 right-0 w-12 rounded-r-[1.4rem] bg-gradient-to-l from-card to-transparent sm:hidden" />
      </div>
      <div className="mb-9 grid grid-cols-2 gap-4 lg:grid-cols-3 lg:gap-6">
        {[
          { label: 'Money in', value: money.formatDisplay(moneyIn), dot: 'bg-primary', sub: money.formatRef(moneyIn) ?? 'Income received' },
          { label: 'Money out', value: money.formatDisplay(moneyOut), dot: 'bg-[#FF8388]', sub: money.formatRef(moneyOut) ?? `Across ${transactions.length} transactions` },
        ].map(({ label, value, dot, sub }) => (
          <div key={label} className="relative rounded-[1.4rem] border border-border bg-card px-6 py-5">
            <span className={`absolute right-7 top-7 h-4 w-4 rounded-full ${dot}`} />
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-4 break-words text-[1.35rem] font-extrabold leading-tight text-foreground sm:text-[2rem]">{value}</p>
            <p className="mt-6 text-sm text-muted-foreground">{sub}</p>
          </div>
        ))}
      </div>

      <Sheet open={isFormOpen} onOpenChange={v => { setIsFormOpen(v); if (!v) { setFormActiveKeypad(null); setFeeKeypad(false) } }}>
        <SheetContent className="w-full overflow-y-auto border-border bg-background p-5 pb-safe-10 sm:max-w-md sm:p-6 sm:pb-safe-10">
          <SheetHeader className="mb-6 text-left">
            <SheetTitle>{editingTransaction ? 'Edit transaction' : 'New transaction'}</SheetTitle>
            <SheetDescription>Fill the amount in the currency you actually paid or received.</SheetDescription>
          </SheetHeader>
          {editingTransaction?.cash_tendered && editingTransaction.cash_tendered > 0 && (() => {
            const origCurrency = editingTransaction.original_currency ?? money.displayCurrency
            const tenderedDisplay = money.format(money.fromBase(editingTransaction.cash_tendered, origCurrency), origCurrency)
            const changeDisplay = money.format(money.fromBase(editingTransaction.cash_tendered - (editingTransaction.original_amount ?? editingTransaction.amount), origCurrency), origCurrency)
            return (
              <div className="mb-4 flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
                <Banknote className="h-4 w-4 shrink-0 text-primary" />
                <span className="text-muted-foreground">Cash given</span>
                <span className="font-extrabold text-foreground">{tenderedDisplay}</span>
                <span className="text-muted-foreground">Â· change</span>
                <span className="font-extrabold text-primary">{changeDisplay}</span>
              </div>
            )
          })()}
          <div className="space-y-5">
            {/* Type selector + big amount â€” always visible */}
            <div className="rounded-[1.25rem] border border-border bg-card p-4 text-center">
              <div className="mx-auto mb-3 inline-flex rounded-full border border-border bg-secondary p-1">
                {(['expense', 'income', 'transfer'] as const).map(item => (
                  <button
                    key={item}
                    type="button"
                    aria-label={item[0].toUpperCase() + item.slice(1)}
                    className={`rounded-full px-6 py-2 text-sm font-extrabold capitalize transition-colors ${type === item ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                    onClick={() => {
                      setType(item)
                      if (item === 'income') setCategory(INCOME_CATEGORIES[0])
                      if (item === 'expense') setCategory(categories[0]?.name ?? '')
                    }}
                  >
                    {item}
                  </button>
                ))}
              </div>
              <Input
                aria-label="Amount"
                readOnly={!isDesktop}
                data-keypad-trigger="amount"
                className="mx-auto h-16 w-full cursor-pointer border-0 bg-transparent text-center text-4xl font-extrabold shadow-none focus-visible:ring-0"
                value={amount}
                placeholder="0"
                onChange={e => setAmount(formatNumberInput(e.target.value))}
                onClick={() => setFormActiveKeypad('amount')}
                onFocus={() => setFormActiveKeypad('amount')}
              />
              <p className="mt-1 text-xs text-muted-foreground">{inputCurrency}</p>
            </div>
            {!isDesktop && formActiveKeypad === 'amount' && (
              <MoneyKeypad
                value={amount}
                onChange={setAmount}
                currency={inputCurrency}
                allowDecimal
                onDone={() => setFormActiveKeypad(null)}
                doneLabel="Done"
              />
            )}

            {/* Description */}
            <div>
              <Label className="text-sm font-bold text-foreground">
                {type === 'transfer' ? 'Transfer note' : 'Merchant name'}
              </Label>
              <Input
                aria-label={type === 'transfer' ? 'Transfer note' : 'Description'}
                className="mt-2 bg-secondary"
                value={description}
                onChange={event => setDescription(event.target.value)}
                placeholder={type === 'transfer' ? 'Optional note' : 'Enter a merchant name'}
              />
              {merchantSuggestion && !editingTransaction && (
                <button
                  type="button"
                  className="mt-2 rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-bold text-primary"
                  onClick={() => {
                    setCategory(merchantSuggestion.category)
                    if (merchantSuggestion.wallet_id) setWalletId(merchantSuggestion.wallet_id)
                    setType(merchantSuggestion.type === 'income' || merchantSuggestion.type === 'transfer' ? merchantSuggestion.type : 'expense')
                  }}
                  aria-label="Use last merchant suggestion â€” fills in category, wallet, and type"
                >
                  Last time: {merchantSuggestion.category}
                  {merchantSuggestion.wallet_id && wallets.find(w => w.id === merchantSuggestion.wallet_id) && (
                    <span className="ml-1.5 opacity-70">Â· {wallets.find(w => w.id === merchantSuggestion.wallet_id)!.name}</span>
                  )}
                </button>
              )}
            </div>

            {/* Category â€” always visible (except transfer) */}
            {type !== 'transfer' && (
              <div>
                <Label className="text-sm font-bold text-foreground">Category</Label>
                <select
                  aria-label="Category"
                  className="mt-2 h-11 w-full rounded-md border border-input bg-secondary px-3 text-sm font-bold text-foreground outline-none"
                  value={category}
                  onChange={event => setCategory(event.target.value)}
                >
                  {type === 'income' ? (
                    INCOME_CATEGORIES.map(item => <option key={item} value={item}>{item}</option>)
                  ) : (
                    <>
                      {categories.length === 0 && <option value="">Add categories in Settings</option>}
                      {categories.map(item => <option key={item.id} value={item.name}>{item.name}</option>)}
                    </>
                  )}
                </select>
              </div>
            )}

            {/* Wallet(s) */}
            {type !== 'transfer' ? (
              <div>
                <Label className="text-sm font-bold text-foreground">Wallet</Label>
                <select aria-label="Wallet" className="mt-2 h-11 w-full rounded-md border border-input bg-secondary px-3 text-sm font-bold text-foreground outline-none" value={walletId} onChange={event => { setWalletId(event.target.value); setCashEnabled(false); setCashTendered(''); setChangeBillsWalletId(''); setChangeCoinsWalletId('') }}>
                  {wallets.length === 0 && <option value="">Add wallets in Settings</option>}
                  {wallets.map(wallet => <option key={wallet.id} value={wallet.id}>{wallet.name}</option>)}
                </select>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label className="text-sm font-bold text-foreground">From wallet</Label>
                  <select aria-label="From wallet" className="mt-2 h-11 w-full rounded-md border border-input bg-secondary px-3 text-sm font-bold text-foreground outline-none" value={walletId} onChange={event => setWalletId(event.target.value)}>
                    {wallets.map(wallet => <option key={wallet.id} value={wallet.id}>{wallet.name}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-sm font-bold text-foreground">To wallet</Label>
                  <select aria-label="To wallet" className="mt-2 h-11 w-full rounded-md border border-input bg-secondary px-3 text-sm font-bold text-foreground outline-none" value={transferWalletId} onChange={event => setTransferWalletId(event.target.value)}>
                    {wallets.map(wallet => <option key={wallet.id} value={wallet.id}>{wallet.name}</option>)}
                  </select>
                </div>
              </div>
            )}

            {/* â”€â”€ Category splitting (expense only) â”€â”€ */}
            {type === 'expense' && categories.length >= 2 && (
              <div className="rounded-[1.25rem] border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-4">
                  <span>
                    <span className="block text-sm font-extrabold text-foreground">Split across categories</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">Divide this expense into multiple budget categories</span>
                  </span>
                  <button type="button" role="switch" aria-checked={splitEnabled} aria-label="Split across categories"
                    onClick={() => {
                      const next = !splitEnabled; setSplitEnabled(next)
                      if (next) setSplitPortions([{ category: categories[0]?.name ?? '', amount: '' }, { category: categories[1]?.name ?? categories[0]?.name ?? '', amount: '' }])
                      else setSplitPortions([])
                    }}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${splitEnabled ? 'bg-primary' : 'bg-muted'}`}>
                    <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${splitEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
                {splitEnabled && (
                  <div className="mt-3 space-y-2">
                    {splitPortions.map((p, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <select aria-label={`Portion ${i + 1} category`} className="h-10 flex-1 rounded-lg border border-input bg-secondary px-2 text-sm font-bold text-foreground outline-none"
                          value={p.category} onChange={e => { const n = [...splitPortions]; n[i] = { ...n[i], category: e.target.value }; setSplitPortions(n) }}>
                          {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                        </select>
                        <Input aria-label={`Portion ${i + 1} amount`} className="h-10 w-28 rounded-lg bg-secondary text-sm font-extrabold" inputMode="decimal" placeholder="0"
                          value={p.amount} onChange={e => { const n = [...splitPortions]; n[i] = { ...n[i], amount: e.target.value }; setSplitPortions(n) }} />
                        <button onClick={() => setSplitPortions(sp => sp.filter((_, j) => j !== i))} disabled={splitPortions.length <= 2}
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm text-muted-foreground hover:text-destructive disabled:opacity-30" aria-label={`Remove portion ${i + 1}`}>Ã—</button>
                      </div>
                    ))}
                    {(() => {
                      const total = splitPortions.reduce((s, p) => s + parseNumberInput(p.amount), 0)
                      const main = parseNumberInput(amount); const rem = main - total
                      return (
                        <div className="flex items-center justify-between gap-2 pt-1">
                          <button onClick={() => setSplitPortions(sp => [...sp, { category: categories[0]?.name ?? '', amount: '' }])} className="text-xs font-bold text-primary hover:underline">+ Add portion</button>
                          <span className={`text-xs font-bold ${rem === 0 ? 'text-primary' : rem > 0 ? 'text-muted-foreground' : 'text-destructive'}`}>{rem === 0 ? 'âœ“ Fully allocated' : rem > 0 ? `${money.format(rem, inputCurrency)} remaining` : `${money.format(Math.abs(rem), inputCurrency)} over`}</span>
                        </div>
                      )
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* â”€â”€ Multi-wallet payment (expense only, 2+ wallets) â”€â”€ */}
            {type === 'expense' && wallets.length >= 2 && (
              <div className="rounded-[1.25rem] border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-4">
                  <span>
                    <span className="block text-sm font-extrabold text-foreground">Pay from multiple wallets</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">E.g. $100 from notes + $2 from coins for a $102 expense</span>
                  </span>
                  <button type="button" role="switch" aria-checked={multiWalletEnabled} aria-label="Pay from multiple wallets"
                    onClick={() => {
                      const next = !multiWalletEnabled; setMultiWalletEnabled(next)
                      if (next) {
                        const notesW = wallets.find(w => w.cash_role === 'notes' || w.cash_role === 'mixed' || w.type === 'cash')
                        const coinsW = wallets.find(w => w.cash_role === 'coins' && w.id !== notesW?.id)
                        const initial: { wallet_id: string; amount: string }[] = []
                        if (notesW) initial.push({ wallet_id: notesW.id, amount: '' })
                        if (coinsW) initial.push({ wallet_id: coinsW.id, amount: '' })
                        const others = wallets.filter(w => !initial.find(i => i.wallet_id === w.id))
                        while (initial.length < 2 && others.length > 0) initial.push({ wallet_id: others.shift()!.id, amount: '' })
                        setWalletSplits(initial)
                      } else setWalletSplits([])
                    }}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${multiWalletEnabled ? 'bg-primary' : 'bg-muted'}`}>
                    <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${multiWalletEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
                {multiWalletEnabled && (
                  <div className="mt-3 space-y-2">
                    {walletSplits.map((ws, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <select aria-label={`Wallet ${i + 1}`} className="h-10 flex-1 rounded-lg border border-input bg-secondary px-2 text-sm font-bold text-foreground outline-none"
                          value={ws.wallet_id} onChange={e => { const n = [...walletSplits]; n[i] = { ...n[i], wallet_id: e.target.value }; setWalletSplits(n) }}>
                          {wallets.map(w => <option key={w.id} value={w.id}>{w.name}{w.cash_role === 'coins' ? ' Â· coins' : w.cash_role === 'notes' ? ' Â· notes' : ''}</option>)}
                        </select>
                        <Input aria-label={`Wallet ${i + 1} amount`} className="h-10 w-28 rounded-lg bg-secondary text-sm font-extrabold" inputMode="decimal" placeholder="0"
                          value={ws.amount} onChange={e => { const n = [...walletSplits]; n[i] = { ...n[i], amount: e.target.value }; setWalletSplits(n) }} />
                        <button onClick={() => setWalletSplits(ws2 => ws2.filter((_, j) => j !== i))} disabled={walletSplits.length <= 2}
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm text-muted-foreground hover:text-destructive disabled:opacity-30" aria-label={`Remove wallet ${i + 1}`}>Ã—</button>
                      </div>
                    ))}
                    {(() => {
                      const total = walletSplits.reduce((s, ws) => s + parseNumberInput(ws.amount), 0)
                      const main = parseNumberInput(amount); const rem = main - total
                      return (
                        <div className="flex items-center justify-between gap-2 pt-1">
                          <button onClick={() => { const unused = wallets.find(w => !walletSplits.find(ws2 => ws2.wallet_id === w.id)); setWalletSplits(ws2 => [...ws2, { wallet_id: unused?.id ?? wallets[0].id, amount: '' }]) }} className="text-xs font-bold text-primary hover:underline">+ Add wallet</button>
                          <span className={`text-xs font-bold ${rem === 0 ? 'text-primary' : rem > 0 ? 'text-muted-foreground' : 'text-destructive'}`}>{rem === 0 ? 'âœ“ Fully allocated' : rem > 0 ? `${money.format(rem, inputCurrency)} remaining` : `${money.format(Math.abs(rem), inputCurrency)} over`}</span>
                        </div>
                      )
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* Transfer fee */}
            {type === 'transfer' && (
              <div className="rounded-[1.25rem] border border-border bg-card p-4">
                <label className="flex cursor-pointer items-center justify-between gap-4">
                  <span>
                    <span className="block text-sm font-extrabold text-foreground">Transfer fee</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">Bank or service fee charged for this transfer</span>
                  </span>
                  <input
                    type="checkbox"
                    aria-label="Enable transfer fee"
                    className="h-5 w-5 accent-primary"
                    checked={transferFeeEnabled}
                    onChange={e => {
                      setTransferFeeEnabled(e.target.checked)
                      if (!e.target.checked) { setTransferFeeAmount(''); setFeeKeypad(false) }
                    }}
                  />
                </label>
                {transferFeeEnabled && (
                  <div className="mt-4 space-y-3">
                    <div>
                      <Label className="text-xs font-bold text-muted-foreground">Fee amount ({inputCurrency})</Label>
                      <Input
                        aria-label="Transfer fee amount"
                        readOnly={!isDesktop}
                        className="mt-2 bg-secondary"
                        value={transferFeeAmount}
                        placeholder="0"
                        onChange={e => setTransferFeeAmount(formatNumberInput(e.target.value))}
                        onClick={() => setFeeKeypad(true)}
                        onFocus={() => setFeeKeypad(true)}
                      />
                      {!isDesktop && feeKeypad && (
                        <MoneyKeypad
                          value={transferFeeAmount}
                          onChange={setTransferFeeAmount}
                          currency={inputCurrency}
                          allowDecimal
                          onDone={() => setFeeKeypad(false)}
                          doneLabel="Done"
                        />
                      )}
                    </div>
                    {parseNumberInput(transferFeeAmount) > 0 && (
                      <div className="space-y-1.5 rounded-xl border border-border bg-secondary p-3 text-sm">
                        <div className="flex justify-between gap-3">
                          <span className="text-muted-foreground">Transfer amount</span>
                          <span className="font-bold text-foreground">{money.format(parseNumberInput(amount), inputCurrency)}</span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span className="text-muted-foreground">Fee</span>
                          <span className="font-bold text-[#FF8388]">+{money.format(parseNumberInput(transferFeeAmount), inputCurrency)}</span>
                        </div>
                        <div className="flex justify-between gap-3 border-t border-border pt-1.5">
                          <span className="font-extrabold text-foreground">Total from wallet</span>
                          <span className="font-extrabold text-foreground">{money.format(parseNumberInput(amount) + parseNumberInput(transferFeeAmount), inputCurrency)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Date + Currency â€” side by side */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-bold text-foreground">Date</Label>
                <Input aria-label="Date" className="mt-2 bg-secondary" type="date" value={date} onChange={event => setDate(event.target.value)} />
              </div>
              <div>
                <Label className="text-sm font-bold text-foreground">Currency</Label>
                <select
                  aria-label="Input currency"
                  className="mt-2 h-11 w-full rounded-md border border-input bg-secondary px-3 text-sm font-bold text-foreground outline-none"
                  value={inputCurrency}
                  onChange={event => setInputCurrency(event.target.value)}
                >
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div className="space-y-5">
                {/* Cash Change Assistant — expense + cash wallet only */}
                {type === 'expense' && wallets.find(w => w.id === walletId)?.type === 'cash' && (
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

            {editingTransaction?.needs_review && (
              <Button
                className="mt-4 w-full gap-2 bg-[#FFCF73] text-background hover:bg-[#FFCF73]/90 font-extrabold"
                onClick={async () => {
                  await handleSaveTransaction()
                  handleMarkReviewed(editingTransaction!.id)
                  setIsFormOpen(false)
                }}
              >
                <CheckCircle className="h-4 w-4" />
                Mark reviewed & save
              </Button>
            )}
            <Button className={`w-full ${editingTransaction?.needs_review ? 'mt-2' : 'mt-4'}`} onClick={handleSaveTransaction} disabled={addTransaction.isPending || updateTransaction.isPending || wallets.length === 0 || cannotSaveTransfer || (type === 'expense' && categories.length === 0)}>
              {addTransaction.isPending || updateTransaction.isPending
                ? 'Savingâ€¦'
                : editingTransaction
                  ? `Save ${type}`
                  : `Add ${type}`}
            </Button>
            <Button variant="secondary" className="mt-2 w-full" onClick={() => setIsFormOpen(false)}>
              Cancel
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={Boolean(editingRule)} onOpenChange={v => { if (!v) setEditingRule(null) }}>
        <SheetContent className="w-full overflow-y-auto border-border bg-background p-5 sm:max-w-md sm:p-6">
          <SheetHeader className="mb-6 text-left">
            <SheetTitle>Edit recurring rule</SheetTitle>
            <SheetDescription>Update the schedule or amount for this recurring payment.</SheetDescription>
          </SheetHeader>
          <div className="space-y-5">
            <div>
              <Label className="text-sm font-bold text-foreground">Description</Label>
              <Input aria-label="Rule description" className="mt-2 bg-secondary" value={ruleDescription} onChange={e => setRuleDescription(e.target.value)} />
            </div>
            <div className="flex gap-3">
              <div className="w-28 shrink-0">
                <Label className="text-sm font-bold text-foreground">Currency</Label>
                <select
                  aria-label="Rule currency"
                  className="mt-2 h-11 w-full rounded-md border border-input bg-secondary px-3 text-sm font-bold text-foreground outline-none"
                  value={ruleInputCurrency}
                  onChange={e => setRuleInputCurrency(e.target.value)}
                >
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="flex-1">
                <Label className="text-sm font-bold text-foreground">Amount</Label>
                <Input aria-label="Rule amount" className="mt-2 bg-secondary" inputMode="decimal" value={ruleAmount} onChange={e => setRuleAmount(formatNumberInput(e.target.value))} />
              </div>
            </div>
            <div>
              <Label className="text-sm font-bold text-foreground">Frequency</Label>
              <select
                aria-label="Rule frequency"
                className="mt-2 h-11 w-full rounded-md border border-input bg-secondary px-3 text-sm font-bold text-foreground outline-none"
                value={ruleFrequency}
                onChange={e => setRuleFrequency(e.target.value as RecurringFrequency)}
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
            <div>
              <Label className="text-sm font-bold text-foreground">Next due date</Label>
              <Input aria-label="Rule next due date" className="mt-2 bg-secondary" type="date" value={ruleNextDueDate} onChange={e => setRuleNextDueDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-sm font-bold text-foreground">End date (optional)</Label>
              <Input aria-label="Rule end date" className="mt-2 bg-secondary" type="date" value={ruleEndDate} onChange={e => setRuleEndDate(e.target.value)} />
            </div>
            <Button className="mt-4 w-full" onClick={handleSaveRule} disabled={updateRecurringRule.isPending}>
              Save rule
            </Button>
            <Button variant="secondary" className="mt-2 w-full" onClick={() => setEditingRule(null)}>
              Cancel
            </Button>
          </div>
        </SheetContent>
      </Sheet>


      {expenseCategoryTotals.length > 0 && (
        <div className="mb-6 hidden rounded-[1.4rem] border border-border bg-card px-4 py-5 sm:px-6 lg:block">
          <button
            type="button"
            className="mb-4 flex w-full items-center justify-between gap-3"
            onClick={() => setShowCategories(!showCategories)}
          >
            <h2 className="text-lg font-extrabold text-foreground">Expense by category</h2>
            <span className="text-xs font-bold text-muted-foreground">{showCategories ? 'Hide' : 'Show'} Â· {expenseCategoryTotals.length} categories</span>
          </button>
          {showCategories && (
            <div data-testid="expense-category-list" className="grid max-h-[220px] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
              {expenseCategoryTotals.map(([name, value]) => (
                <button
                  key={name}
                  type="button"
                  aria-label={`Filter by ${name} â€” ${value.count} transaction${value.count === 1 ? '' : 's'}`}
                  className={`flex min-h-12 items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${selectedCategory === name ? 'border-primary bg-primary/10' : 'border-border bg-secondary hover:bg-muted/50'}`}
                  onClick={() => setSelectedCategory(name)}
                >
                  <span className="min-w-0 truncate font-extrabold text-foreground">{name}</span>
                  <div className="shrink-0 flex flex-col items-end gap-0.5">
                    <span className="text-xs font-extrabold text-foreground">{money.formatDisplay(value.total)}</span>
                    <span className="text-[10px] text-muted-foreground">{value.count} item{value.count === 1 ? '' : 's'}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {upcomingRecurringRules.length > 0 && (
        <div className="mb-6 hidden rounded-[1.4rem] border border-border bg-card px-4 py-5 sm:px-6 lg:block">
          <button
            type="button"
            className="mb-4 flex w-full items-center justify-between gap-3 text-left"
            onClick={() => setShowRecurring(!showRecurring)}
          >
            <div>
              <h2 className="text-lg font-extrabold text-foreground">Recurring / cicilan</h2>
              <p className="mt-1 text-xs font-bold text-muted-foreground">Auto-generates due payments without duplicates.</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {showRecurring && (
                <>
                  <Button
                    size="sm" variant="secondary"
                    onClick={e => { e.stopPropagation(); handleGenerateDue() }}
                    disabled={runDueRecurringRules.isPending}
                  >
                    Generate due
                  </Button>
                  <Button asChild size="sm" variant="secondary" onClick={e => e.stopPropagation()}>
                    <Link to="/subscriptions">Manage â†’</Link>
                  </Button>
                </>
              )}
              <span className="text-xs font-bold text-muted-foreground">{showRecurring ? 'Hide' : 'Show'}</span>
            </div>
          </button>
          {showRecurring && (<>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {upcomingRecurringRules.map(rule => (
              <Link
                key={rule.id}
                to="/subscriptions"
                className={`flex items-center justify-between gap-3 rounded-2xl border p-4 transition-colors hover:border-primary/30 hover:bg-primary/5 ${rule.active ? 'border-border bg-secondary' : 'border-border/60 bg-secondary/50 opacity-70'}`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 truncate font-extrabold text-foreground">{rule.description}</p>
                    {!rule.active && <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">Paused</span>}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{rule.category} Â· next {rule.next_due_date}</p>
                  <p className="mt-0.5 text-sm font-bold text-foreground">
                    {money.format(rule.original_amount, rule.original_currency)}
                    {rule.original_currency !== money.baseCurrency && <span className="ml-2 text-xs text-muted-foreground">~ {money.formatBase(rule.amount)}</span>}
                  </p>
                  {rule.installment_total && (
                    <p className="mt-0.5 text-xs font-bold text-muted-foreground">{rule.installment_paid}/{rule.installment_total} paid</p>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
          {recurringCandidates.length > 0 && (
            <div className="mt-6 border-t border-border pt-5">
              <p className="mb-1 text-sm font-extrabold text-foreground">Detected patterns</p>
              <p className="mb-4 text-xs text-muted-foreground">These transactions repeat regularly. Set them up as recurring rules.</p>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {recurringCandidates.map(candidate => (
                  <div key={candidate.description} className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
                    <div className="min-w-0">
                      <p className="truncate font-bold text-foreground">{candidate.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {candidate.category} Â· {candidate.count}Ã— Â· avg {money.formatBase(candidate.amount)}
                      </p>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => handleAddCandidateAsRule(candidate)} disabled={addRecurringRule.isPending}>
                      Set up
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
          </>)}
        </div>
      )}

      <div className="rounded-[1.4rem] border border-border bg-card px-4 py-5 sm:px-6 sm:py-6">
        {selectedCategory ? (
          <div className="mb-6 rounded-2xl border border-border bg-secondary p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-2xl font-extrabold text-foreground">{selectedCategory}</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Spent {money.formatDisplay(selectedCategoryTotal)}
                  {selectedCategoryBudget > 0 && ` / ${money.formatDisplay(selectedCategoryBudget)} (${selectedCategoryUsedPct}%)`}
                </p>
                {money.formatRef(selectedCategoryTotal) && <p className="mt-1 text-xs text-muted-foreground">{money.formatRef(selectedCategoryTotal)}</p>}
              </div>
              <Button variant="secondary" size="sm" onClick={() => setSelectedCategory(null)}>Show all transactions</Button>
            </div>
          </div>
        ) : (
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xl font-extrabold text-foreground">Transaction history</h2>
            <div className="flex items-center gap-2">
              {selectMode && sortedTransactions.length > 0 && (
                <>
                  <span className="text-xs font-bold text-muted-foreground">{selectedIds.size} selected</span>
                  <button
                    onClick={selectAll}
                    className="rounded-full bg-secondary px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground"
                  >
                    All
                  </button>
                  <button
                    onClick={() => setSelectedIds(new Set())}
                    className="rounded-full bg-secondary px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </button>
                </>
              )}
              {(isDesktop || selectMode) && (
                <button
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${selectMode ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-secondary text-muted-foreground hover:text-foreground'}`}
                  onClick={toggleSelectMode}
                  aria-label="Toggle multi-select"
                >
                  <CheckSquare className="h-3.5 w-3.5" />
                  Select
                </button>
              )}
            </div>
          </div>
        )}

        {/* Month navigator */}
        <div className="mb-5 flex items-center gap-1">
          <button
            onClick={goToPrevMonth}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-secondary text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="flex flex-1 items-center justify-center gap-2">
            <span className={`text-sm font-extrabold ${isAllTime ? 'text-muted-foreground' : 'text-foreground'}`}>
              {isAllTime ? 'All transactions' : monthLabel}
            </span>
            {!isAllTime && (
              <span className="text-xs text-muted-foreground">Â· {sortedTransactions.length}</span>
            )}
          </div>
          <button
            onClick={goToNextMonth}
            disabled={isOnCurrentMonth || isAllTime}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-secondary text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          {!isAllTime && !isOnCurrentMonth && (
            <button
              onClick={() => { setDateFrom(getMonthStart()); setDateTo(getLastDay(new Date().getFullYear(), new Date().getMonth() + 1)) }}
              className="ml-1 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary transition-colors hover:bg-primary/20"
            >
              This month
            </button>
          )}
          {!isAllTime && (
            <button
              onClick={() => { setDateFrom(''); setDateTo('') }}
              className="ml-1 rounded-full bg-secondary px-3 py-1.5 text-xs font-bold text-muted-foreground transition-colors hover:text-foreground"
            >
              All
            </button>
          )}
          <button
            onClick={() => setIsFilterOpen(true)}
            aria-label="Open filters"
            className={`relative ml-1 flex h-11 w-11 items-center justify-center rounded-full border transition-colors ${activeFilterCount > 0 ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-secondary text-muted-foreground hover:text-foreground'}`}
          >
            <SlidersHorizontal className="h-4 w-4" />
            {activeFilterCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-extrabold text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        <Sheet open={isFilterOpen} onOpenChange={setIsFilterOpen}>
          <SheetContent side={isDesktop ? 'right' : 'bottom'} className={isDesktop ? 'w-full max-w-sm overflow-y-auto border-border bg-background' : 'overflow-y-auto border-border bg-background pb-safe-8'}>
            <SheetHeader className="mb-5 text-left">
              <SheetTitle>Filters</SheetTitle>
              <SheetDescription>Narrow down by date range or wallet.</SheetDescription>
            </SheetHeader>
            <div className="space-y-6">
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Quick range</p>
                <div className="flex flex-wrap gap-2">
                  {([
                    ['this-week', 'This week'],
                    ['this-month', 'This month'],
                    ['last-month', 'Last month'],
                    ['last-3-months', 'Last 3 months'],
                    ['this-year', 'This year'],
                    ['all-time', 'All time'],
                  ] as const).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => applyDatePreset(key)}
                      className="rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-bold text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground active:scale-95"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Custom date range</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="mb-1 text-[11px] text-muted-foreground">From</p>
                    <Input type="date" className="bg-secondary" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                  </div>
                  <div>
                    <p className="mb-1 text-[11px] text-muted-foreground">To</p>
                    <Input type="date" className="bg-secondary" value={dateTo} onChange={e => setDateTo(e.target.value)} />
                  </div>
                </div>
              </div>
              {wallets.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Wallet</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setFilterWalletId('')}
                      className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors active:scale-95 ${!filterWalletId ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-secondary text-muted-foreground hover:text-foreground'}`}
                    >
                      All wallets
                    </button>
                    {wallets.map(w => (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() => setFilterWalletId(w.id)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors active:scale-95 ${filterWalletId === w.id ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-secondary text-muted-foreground hover:text-foreground'}`}
                      >
                        {w.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <Button variant="secondary" className="flex-1" onClick={() => { resetFilters(); setIsFilterOpen(false) }}>Reset</Button>
                <Button className="flex-1" onClick={() => setIsFilterOpen(false)}>Apply</Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>

        {!txPending && !txError && potentialDuplicates.length > 0 && !searchQuery && !selectedCategory && (() => {
          const groups = [...new Map(potentialDuplicates.map(p => [p.a.description.toLowerCase(), p])).values()]
          return (
            <div className="mb-4 rounded-2xl border border-[#FFCF73]/40 bg-[#FFCF73]/10 px-4 py-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#FFCF73]" />
                <p className="flex-1 text-sm font-bold text-foreground">{potentialDuplicates.length} potential duplicate{potentialDuplicates.length !== 1 ? 's' : ''} detected</p>
              </div>
              <div className="mt-2 flex flex-col gap-1.5">
                {groups.map(p => (
                  <div key={p.a.id} className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                      {p.a.description} Â· {p.a.date}
                    </p>
                    <button
                      className="shrink-0 rounded-full bg-[#FFCF73]/20 px-2.5 py-1 text-xs font-bold text-[#FFCF73] hover:bg-[#FFCF73]/30"
                      onClick={() => setSearchQuery(p.a.description)}
                    >
                      Review
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )
        })()}

        {txPending ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border bg-secondary px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-4 w-20" />
                </div>
              </div>
            ))}
          </div>
        ) : txError ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-secondary px-6 py-12 text-center">
            <p className="text-base font-bold text-foreground">Could not load transactions</p>
            <p className="mt-1 text-sm text-muted-foreground">Your local data is safe. Try refreshing.</p>
            <button
              type="button"
              onClick={() => txRefetch()}
              className="mt-4 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90 active:opacity-80"
            >
              Retry
            </button>
          </div>
        ) : groupedTransactions.length > 0 ? groupedTransactions.map(([date, rows]) => (
          <div key={date} className="mb-6 last:mb-0">
            <h3 className="mb-3 text-sm font-extrabold text-primary">{formatDate(date)}</h3>

            {/* Mobile card list */}
            {!isDesktop && <div className="flex flex-col gap-2">
              {rows.map(tx => {
                const isSelected = selectedIds.has(tx.id)
                const txWallet = wallets.find(w => w.id === tx.wallet_id)
                const linkedChange = tx.cash_tendered && tx.cash_tendered > 0
                  ? transactions.filter(t => t.linked_transaction_id === tx.id && t.is_system_generated)
                  : []
                return (
                  <div key={tx.id} className="relative overflow-hidden rounded-xl">
                    {/* Swipe-to-reveal actions */}
                    {!selectMode && (
                      <div className="absolute inset-y-0 right-0 flex items-stretch">
                        <button
                          type="button"
                          aria-label="Edit"
                          className="flex w-[60px] items-center justify-center bg-accent/80 text-accent-foreground"
                          onClick={() => { setSwipeOpenId(null); openEditForm(tx) }}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          aria-label="Delete"
                          className="flex w-[60px] items-center justify-center bg-destructive text-destructive-foreground"
                          onClick={() => { setSwipeOpenId(null); handleDeleteTransaction(tx) }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                    <button
                      type="button"
                      className={`relative z-10 w-full rounded-xl border px-4 py-3 text-left transition-colors ${isSelected ? 'border-primary bg-primary/5' : tx.needs_review ? 'border-[#FFCF73]/30 bg-[#FFCF73]/5' : 'border-border bg-secondary hover:border-border/80 hover:bg-muted/30'}`}
                      style={{
                        transform: swipeOpenId === tx.id ? 'translateX(-120px)' : 'translateX(0px)',
                        transition: 'transform 0.2s ease-out',
                      }}
                      onPointerDown={(e) => {
                        if (swipeOpenId && swipeOpenId !== tx.id) setSwipeOpenId(null)
                        longPressRef.current = false
                        longPressTimer.current = setTimeout(() => {
                          longPressRef.current = true
                          if (!selectMode) { setSelectMode(true); setSelectedIds(new Set()) }
                          setSelectedIds(prev => { const next = new Set(prev); next.add(tx.id); return next })
                        }, 400)
                        swipeRef.current = { activeId: tx.id, startX: e.clientX, startY: e.clientY, dx: 0, isSwipe: false, wasSwipe: false }
                      }}
                      onPointerMove={(e) => {
                        if (swipeRef.current.activeId !== tx.id || selectMode) return
                        const dx = e.clientX - swipeRef.current.startX
                        const dy = e.clientY - swipeRef.current.startY
                        if (!swipeRef.current.isSwipe) {
                          if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
                          if (Math.abs(dx) >= Math.abs(dy)) {
                            swipeRef.current.isSwipe = true
                            if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null }
                            e.currentTarget.setPointerCapture(e.pointerId)
                          } else {
                            swipeRef.current.activeId = null
                            return
                          }
                        }
                        swipeRef.current.dx = dx
                        const base = swipeOpenId === tx.id ? -120 : 0
                        e.currentTarget.style.transform = `translateX(${Math.min(0, Math.max(-120, base + dx))}px)`
                        e.currentTarget.style.transition = 'none'
                      }}
                      onPointerUp={() => {
                        if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null }
                        if (swipeRef.current.isSwipe) {
                          swipeRef.current.wasSwipe = true
                          const { dx } = swipeRef.current
                          const isOpen = swipeOpenId === tx.id
                          swipeRef.current.activeId = null
                          swipeRef.current.isSwipe = false
                          setSwipeOpenId(isOpen ? (dx > 40 ? null : tx.id) : (dx < -40 ? tx.id : null))
                        }
                      }}
                      onPointerLeave={() => { if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null } }}
                      onClick={() => {
                        if (swipeRef.current.wasSwipe) { swipeRef.current.wasSwipe = false; return }
                        if (swipeOpenId === tx.id) { setSwipeOpenId(null); return }
                        if (longPressRef.current) { longPressRef.current = false; return }
                        selectMode ? toggleSelectId(tx.id) : setDetailTx(tx)
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            {selectMode ? (
                              isSelected
                                ? <CheckSquare className="h-4 w-4 shrink-0 text-primary" />
                                : <Square className="h-4 w-4 shrink-0 text-muted-foreground" />
                            ) : tx.needs_review ? (
                              <span className="h-2 w-2 shrink-0 rounded-full bg-[#FFCF73]" title="Needs review" />
                            ) : null}
                            <p className="truncate text-sm font-bold text-foreground">{tx.description}</p>
                          </div>
                          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                            {categoryColorMap.has(tx.category) && (
                              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: categoryColorMap.get(tx.category) }} />
                            )}
                            <span className="truncate">
                              {tx.split_portions && tx.split_portions.length > 0
                                ? `Split (${tx.split_portions.length})`
                                : tx.category}
                              {tx.wallet_splits && tx.wallet_splits.length > 0
                                ? ` Â· ${tx.wallet_splits.length} wallets`
                                : txWallet ? ` Â· ${txWallet.name}` : ''}
                              {' Â· '}{formatDate(tx.date)}
                            </span>
                          </div>
                          {linkedChange.length > 0 && (() => {
                            const changeAmt = tx.cash_tendered! - (tx.original_amount ?? tx.amount)
                            const changeWallet = wallets.find(w => w.id === linkedChange[0].wallet_id)
                            return changeAmt > 0 ? (
                              <p className="mt-1 text-[11px] text-muted-foreground/70">
                                Cash {money.format(tx.cash_tendered!, tx.original_currency ?? money.baseCurrency)} Â· change {money.format(changeAmt, tx.original_currency ?? money.baseCurrency)}{changeWallet ? ` â†’ ${changeWallet.name}` : ''}
                              </p>
                            ) : null
                          })()}
                        </div>
                        <span className={`shrink-0 tabular-nums text-sm font-extrabold whitespace-nowrap ${txAmountColor(tx.amount, tx.type)}`}>
                          {txAmountSign(tx.amount, tx.type)}{money.formatTx(tx)}
                        </span>
                      </div>
                    </button>
                  </div>
                )
              })}
            </div>}

            {/* Desktop table */}
            {isDesktop && <div className="overflow-x-auto rounded-2xl border border-border">
              <Table className="min-w-[820px]">
                <TableBody>
                  <TableRow className="border-border bg-secondary/70 hover:bg-secondary/70">
                    {selectMode && <TableCell className="w-10 py-2" />}
                    <TableCell className="py-2 text-xs font-bold text-muted-foreground">Item name</TableCell>
                    <TableCell className="py-2 text-xs font-bold text-muted-foreground">Category</TableCell>
                    <TableCell className="py-2 text-xs font-bold text-muted-foreground">Note</TableCell>
                    <TableCell className="py-2 text-right text-xs font-bold text-muted-foreground">Price</TableCell>
                    {!selectMode && <TableCell className="py-2" />}
                  </TableRow>
                  {rows.map(tx => {
                    const isSelected = selectedIds.has(tx.id)
                    return (
                      <TableRow
                        key={tx.id}
                        className={`border-border transition-colors ${isSelected ? 'bg-primary/5 hover:bg-primary/8' : tx.needs_review ? 'bg-[#FFCF73]/5 hover:bg-[#FFCF73]/10' : 'hover:bg-muted/10'} ${selectMode ? 'cursor-pointer' : ''}`}
                        onClick={selectMode ? () => toggleSelectId(tx.id) : undefined}
                      >
                        {selectMode && (
                          <TableCell className="w-10 py-3">
                            {isSelected
                              ? <CheckSquare className="h-4 w-4 text-primary" />
                              : <Square className="h-4 w-4 text-muted-foreground" />}
                          </TableCell>
                        )}
                        <TableCell className="w-1/4 py-3 text-foreground">
                          <div className="flex items-center gap-2">
                            {!selectMode && tx.needs_review && <span className="h-2 w-2 shrink-0 rounded-full bg-[#FFCF73]" title="Needs review" />}
                            {tx.description}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {tx.split_portions && tx.split_portions.length > 0
                            ? `Split (${tx.split_portions.length})`
                            : tx.category}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {money.format(tx.original_amount ?? tx.amount, tx.original_currency ?? money.baseCurrency)}
                          {money.baseCurrency !== (tx.original_currency ?? money.baseCurrency) && ` ~ ${money.formatBase(tx.amount)}`}
                          {tx.cash_tendered && tx.cash_tendered > 0 && (
                            <span className="ml-2 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                              Cash
                            </span>
                          )}
                        </TableCell>
                        <TableCell className={`text-right font-bold ${txAmountColor(tx.amount, tx.type)}`}>
                          {txAmountSign(tx.amount, tx.type)}{money.formatTx(tx)}
                        </TableCell>
                        {!selectMode && (
                          <TableCell className="w-[124px]">
                            <div className="flex justify-end gap-1">
                              {tx.needs_review && (
                                <Button size="sm" variant="ghost" className="h-11 w-11 p-0 text-[#FFCF73] hover:bg-[#FFCF73]/10 hover:text-[#FFCF73]" onClick={() => handleMarkReviewed(tx.id)} aria-label={`Mark ${tx.description} as reviewed`}>
                                  <CheckCircle size={15} />
                                </Button>
                              )}
                              <Button size="sm" variant="ghost" className="h-11 w-11 p-0 text-muted-foreground hover:bg-muted/20 hover:text-foreground" onClick={() => handleDuplicateTransaction(tx)} aria-label={`Duplicate ${tx.description}`}>
                                <Copy size={15} />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-11 w-11 p-0 text-muted-foreground hover:bg-muted/20 hover:text-foreground" onClick={() => openEditForm(tx)} aria-label={`Edit ${tx.description}`}>
                                <Pencil size={15} />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-11 w-11 p-0 text-[#FF8388] hover:bg-[#FF8388]/10" onClick={() => handleDeleteTransaction(tx)} aria-label={`Delete ${tx.description}`}>
                                <Trash2 size={15} />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>}
          </div>
        )) : (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
              <ReceiptText size={28} className="text-muted-foreground/50" />
            </div>
            {(searchQuery || filterWalletId || selectedCategory) ? (
              <div>
                <p className="font-semibold text-foreground">No transactions found</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {searchQuery ? `No results for "${searchQuery}"` : filterWalletId ? 'No transactions for this wallet in this period' : `No "${selectedCategory}" transactions in this period`}
                </p>
                <button
                  type="button"
                  onClick={() => { setSearchQuery(''); setFilterWalletId(''); setSelectedCategory(null) }}
                  className="mt-3 rounded-full bg-secondary px-4 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground"
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <div>
                <p className="font-semibold text-foreground">No transactions yet</p>
                <p className="mt-1 text-sm text-muted-foreground">Add your first income or expense to get started.</p>
              </div>
            )}
            {!searchQuery && !filterWalletId && !selectedCategory && (
              <Button onClick={openAddForm} className="gap-2">
                <Plus size={16} />
                Add transaction
              </Button>
            )}
          </div>
        )}
      </div>
      {/* Bulk action bar â€” shown when items are selected */}
      {selectMode && selectedIds.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card px-4 py-3 shadow-lg sm:px-6" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-extrabold text-foreground">{selectedIds.size} selected</span>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => { setBulkCategoryTarget(categories[0]?.name ?? ''); setBulkCategorySheet(true) }}
                disabled={categories.length === 0}
              >
                <Tag className="mr-1.5 h-3.5 w-3.5" />
                Recategorize
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => { setBulkDate(new Date().toISOString().slice(0, 10)); setBulkDateSheet(true) }}
              >
                <CalendarDays className="mr-1.5 h-3.5 w-3.5" />
                Retime
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={bulkMarkReviewed}
                disabled={!sortedTransactions.some(tx => selectedIds.has(tx.id) && tx.needs_review)}
              >
                <CheckCircle className="mr-1.5 h-3.5 w-3.5" />
                Reviewed
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={bulkExportCSV}
              >
                <FileDown className="mr-1.5 h-3.5 w-3.5" />
                Export
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-[#FF8388] hover:bg-[#FF8388]/10"
                onClick={() => setBulkDeleteConfirm(true)}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Delete
              </Button>
              <Button size="sm" variant="secondary" onClick={toggleSelectMode}>
                <X className="mr-1.5 h-3.5 w-3.5" />
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk recategorize sheet */}
      <Sheet open={bulkCategorySheet} onOpenChange={open => { if (!open) setBulkCategorySheet(false) }}>
        <SheetContent side={isDesktop ? 'right' : 'bottom'} className={isDesktop ? 'w-full max-w-sm overflow-y-auto border-border bg-background px-6 pb-safe-10 pt-6' : 'rounded-t-3xl border-border bg-background px-6 pb-safe-10 pt-6'}>
          <SheetHeader className="mb-5">
            <SheetTitle>Recategorize {selectedIds.size} transaction{selectedIds.size !== 1 ? 's' : ''}</SheetTitle>
            <SheetDescription>Choose a new category for all selected transactions.</SheetDescription>
          </SheetHeader>
          <div className="mb-5 flex flex-wrap gap-2">
            {categories.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => setBulkCategoryTarget(c.name)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold transition-colors ${bulkCategoryTarget === c.name ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}
              >
                {c.color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} />}
                {c.name}
              </button>
            ))}
          </div>
          <div className="flex gap-3">
            <Button className="flex-1" onClick={bulkChangeCategory} disabled={!bulkCategoryTarget}>
              Apply to {selectedIds.size} transaction{selectedIds.size !== 1 ? 's' : ''}
            </Button>
            <Button variant="secondary" onClick={() => setBulkCategorySheet(false)}>Cancel</Button>
          </div>
        </SheetContent>
      </Sheet>
      {/* Bulk retime sheet */}
      <Sheet open={bulkDateSheet} onOpenChange={open => { if (!open) setBulkDateSheet(false) }}>
        <SheetContent side={isDesktop ? 'right' : 'bottom'} className={isDesktop ? 'w-full max-w-sm overflow-y-auto border-border bg-background px-6 pb-safe-10 pt-6' : 'rounded-t-3xl border-border bg-background px-6 pb-safe-10 pt-6'}>
          <SheetHeader className="mb-5">
            <SheetTitle>Change date for {selectedIds.size} transaction{selectedIds.size !== 1 ? 's' : ''}</SheetTitle>
            <SheetDescription>All selected transactions will be moved to this date.</SheetDescription>
          </SheetHeader>
          <div className="mb-5">
            <Label className="mb-2 block text-xs text-muted-foreground">New date</Label>
            <Input type="date" value={bulkDate} onChange={e => setBulkDate(e.target.value)} className="bg-secondary" />
          </div>
          <div className="flex gap-3">
            <Button className="flex-1" onClick={bulkRetime} disabled={!bulkDate}>
              Apply to {selectedIds.size} transaction{selectedIds.size !== 1 ? 's' : ''}
            </Button>
            <Button variant="secondary" onClick={() => setBulkDateSheet(false)}>Cancel</Button>
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={deleteTarget ? `Delete ${deleteTarget.description}?` : ''}
        description="This removes the transaction from your history and wallet calculations."
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDeleteTransaction}
      />
      <ConfirmDialog
        open={bulkDeleteConfirm}
        title={`Delete ${selectedIds.size} transaction${selectedIds.size === 1 ? '' : 's'}?`}
        description="This permanently removes all selected transactions and any linked change transfers."
        onCancel={() => setBulkDeleteConfirm(false)}
        onConfirm={confirmBulkDelete}
      />

      {/* Transaction detail sheet */}
      <Sheet open={!!detailTx} onOpenChange={open => { if (!open) setDetailTx(null) }}>
        <SheetContent side={isDesktop ? 'right' : 'bottom'} className={isDesktop ? 'w-full max-w-md overflow-y-auto border-border px-0 pb-0' : 'max-h-[85dvh] overflow-y-auto rounded-t-3xl px-0 pb-safe-10'}>
          {detailTx && (() => {
            const tx = detailTx
            const wallet = wallets.find(w => w.id === tx.wallet_id)
            const transferWallet = wallets.find(w => w.id === tx.transfer_wallet_id)
            const changeAmount = tx.cash_tendered && tx.cash_tendered > 0 ? tx.cash_tendered - (tx.original_amount ?? tx.amount) : 0
            const linkedChangeTx = transactions.filter(t => t.linked_transaction_id === tx.id && t.is_system_generated)
            const navigateToForm = (fn: () => void) => { setDetailTx(null); setTimeout(fn, 200) }
            return (
              <div>
                {/* Mobile close handle â€” larger touch target than the tiny X */}
                {!isDesktop && (
                  <div className="flex items-center justify-between px-6 pb-2 pt-1">
                    <span className="text-xs font-bold text-muted-foreground">Transaction detail</span>
                    <button
                      type="button"
                      className="rounded-full bg-secondary px-4 py-2 text-sm font-bold text-foreground active:scale-95"
                      onClick={() => setDetailTx(null)}
                    >
                      Done
                    </button>
                  </div>
                )}
                <div className="px-6 pb-4 pt-2">
                  <SheetHeader className="mb-4 text-left">
                    <SheetTitle className="text-base font-extrabold">{tx.description}</SheetTitle>
                    <SheetDescription className="sr-only">Transaction details</SheetDescription>
                  </SheetHeader>

                  {/* Amount hero */}
                  <div className="mb-5 text-center">
                    <p className={`text-4xl font-extrabold tracking-tight ${txAmountColor(tx.amount, tx.type)}`}>
                      {txAmountSign(tx.amount, tx.type)}{money.formatTx(tx)}
                    </p>
                    {money.baseCurrency !== (tx.original_currency ?? money.baseCurrency) && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {money.format(tx.original_amount ?? tx.amount, tx.original_currency ?? money.baseCurrency)}
                      </p>
                    )}
                    <span className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-bold ${tx.type === 'income' ? 'bg-primary/15 text-primary' : tx.type === 'expense' ? 'bg-[#FF8388]/15 text-[#FF8388]' : 'bg-muted text-muted-foreground'}`}>
                      {tx.type.charAt(0).toUpperCase() + tx.type.slice(1)}
                    </span>
                  </div>

                  {/* Detail rows */}
                  <div className="space-y-0 divide-y divide-border rounded-2xl border border-border bg-secondary/50">
                    <div className="flex items-center justify-between px-4 py-3">
                      <span className="text-sm text-muted-foreground">Date</span>
                      <span className="text-sm font-bold text-foreground">{formatDate(tx.date)}</span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-3">
                      <span className="text-sm text-muted-foreground">Category</span>
                      <div className="flex items-center gap-1.5">
                        {categoryColorMap.has(tx.category) && (
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: categoryColorMap.get(tx.category) }} />
                        )}
                        <span className="text-sm font-bold text-foreground">
                          {tx.split_portions && tx.split_portions.length > 0
                            ? `Split (${tx.split_portions.length})`
                            : tx.category}
                        </span>
                      </div>
                    </div>
                    {wallet && (
                      <div className="flex items-center justify-between px-4 py-3">
                        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <WalletIcon size={13} />Wallet
                        </span>
                        <span className="text-sm font-bold text-foreground">{wallet.name}</span>
                      </div>
                    )}
                    {transferWallet && (
                      <div className="flex items-center justify-between px-4 py-3">
                        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <ArrowRightLeft size={13} />Transfer to
                        </span>
                        <span className="text-sm font-bold text-foreground">{transferWallet.name}</span>
                      </div>
                    )}
                    {tx.cash_tendered && tx.cash_tendered > 0 && (
                      <>
                        <div className="flex items-center justify-between px-4 py-3">
                          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <Banknote size={13} />Cash given
                          </span>
                          <span className="text-sm font-bold text-foreground">{money.format(tx.cash_tendered, tx.original_currency ?? money.baseCurrency)}</span>
                        </div>
                        {changeAmount > 0 && (
                          <div className="flex items-center justify-between px-4 py-3">
                            <span className="text-sm text-muted-foreground">Change</span>
                            <span className="text-sm font-bold text-primary">{money.format(changeAmount, tx.original_currency ?? money.baseCurrency)}</span>
                          </div>
                        )}
                      </>
                    )}
                    {tx.is_system_generated && (
                      <div className="px-4 py-3">
                        <p className="text-xs text-muted-foreground">Auto-generated change transfer</p>
                      </div>
                    )}
                    {linkedChangeTx.length > 0 && (
                      <div className="px-4 py-3">
                        <p className="mb-1 text-xs text-muted-foreground">Change routed to:</p>
                        {linkedChangeTx.map(ct => {
                          const ctWallet = wallets.find(w => w.id === ct.wallet_id)
                          return (
                            <p key={ct.id} className="text-xs font-bold text-foreground">
                              {money.format(ct.original_amount ?? ct.amount, ct.original_currency ?? money.baseCurrency)} â†’ {ctWallet?.name ?? 'wallet'}
                            </p>
                          )
                        })}
                      </div>
                    )}
                    {tx.type === 'transfer' && (() => {
                      const feeTx = transactions.find(t => t.linked_transaction_id === tx.id && t.category === 'Transfer Fee' && t.is_system_generated)
                      if (!feeTx) return null
                      return (
                        <div className="flex items-center justify-between px-4 py-3">
                          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <ReceiptText size={13} />Transfer fee
                          </span>
                          <span className="text-sm font-bold text-[#FF8388]">
                            âˆ’{money.format(feeTx.original_amount ?? feeTx.amount, feeTx.original_currency ?? money.baseCurrency)}
                          </span>
                        </div>
                      )
                    })()}
                    {tx.needs_review && (
                      <div className="flex items-center justify-between px-4 py-3">
                        <span className="text-sm font-bold text-[#FFCF73]">Needs review</span>
                        <button
                          type="button"
                          className="rounded-full bg-[#FFCF73]/15 px-4 py-2 text-xs font-bold text-[#FFCF73] active:scale-95"
                          onClick={() => { handleMarkReviewed(tx.id); setDetailTx(null) }}
                        >
                          Mark reviewed
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Merchant search shortcut */}
                  {tx.type !== 'transfer' && (
                    <button
                      type="button"
                      className="mt-3 w-full rounded-xl border border-border bg-secondary/50 py-2.5 text-xs font-bold text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary active:scale-[0.99]"
                      onClick={() => { setDetailTx(null); setSearchQuery(tx.description); setFilter('all') }}
                    >
                      Search all "{tx.description}" transactions â†’
                    </button>
                  )}
                </div>

                {/* Action buttons */}
                <div className="sticky bottom-0 border-t border-border bg-background px-6 pt-4 pb-safe-4">
                  <div className="flex gap-2">
                    <Button
                      className="h-14 flex-1 gap-2"
                      variant="secondary"
                      onClick={() => navigateToForm(() => openEditForm(tx))}
                    >
                      <Pencil size={15} />Edit
                    </Button>
                    <Button
                      className="h-14 flex-1 gap-2"
                      variant="secondary"
                      onClick={() => { handleDuplicateTransaction(tx); setDetailTx(null) }}
                    >
                      <Copy size={15} />Duplicate
                    </Button>
                    <Button
                      className="h-14 w-14 shrink-0 gap-2 text-[#FF8388] hover:bg-[#FF8388]/10"
                      variant="ghost"
                      onClick={() => { setDetailTx(null); handleDeleteTransaction(tx) }}
                      aria-label="Delete transaction"
                    >
                      <Trash2 size={17} />
                    </Button>
                  </div>
                </div>
              </div>
            )
          })()}
        </SheetContent>
      </Sheet>
    </div>
  )
}
