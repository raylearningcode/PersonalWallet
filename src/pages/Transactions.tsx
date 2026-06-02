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
import { Trash2, Pencil, Plus, Copy, CheckCircle, X, ReceiptText, CheckSquare, Square, ChevronLeft, ChevronRight, Wallet as WalletIcon, ArrowRightLeft, Banknote } from 'lucide-react'
import { toast } from 'sonner'
import { CURRENCIES, useMoney, txAmountColor, txAmountSign } from '@/lib/currency'
import { formatNumberInput, parseNumberInput } from '@/lib/numberInput'
import { formatDate } from '@/lib/utils'
import { getMerchantSuggestion, getRecurringCandidates } from '@/lib/financeOs'
import { addRecurringInterval } from '@/lib/recurring'
import type { RecurringFrequency, RecurringRule, Transaction } from '@/types'
import { Skeleton } from '@/components/ui/skeleton'
import { useIsDesktop } from '@/hooks/useIsDesktop'

type Filter = 'all' | 'income' | 'expense' | 'transfer'
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
  const [filter, setFilter] = useState<Filter>('all')
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('q') ?? '')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Transaction | null>(null)
  const [dateFrom, setDateFrom] = useState(getMonthStart)
  const [dateTo, setDateTo] = useState(() => { const d = new Date(); return getLastDay(d.getFullYear(), d.getMonth() + 1) })
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [inputCurrency, setInputCurrency] = useState(money.displayCurrency)
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [category, setCategory] = useState('')
  const [walletId, setWalletId] = useState('')
  const [transferWalletId, setTransferWalletId] = useState('')
  const [type, setType] = useState<EntryType>('expense')
  const [isRecurring, setIsRecurring] = useState(false)
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly')
  const [installmentTotal, setInstallmentTotal] = useState('')
  const [endDate, setEndDate] = useState('')
  const [cashEnabled, setCashEnabled] = useState(false)
  const [cashTendered, setCashTendered] = useState('')
  const [changeBillsWalletId, setChangeBillsWalletId] = useState('')
  const [changeCoinsWalletId, setChangeCoinsWalletId] = useState('')
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false)
  const [detailTx, setDetailTx] = useState<Transaction | null>(null)
  const isDesktop = useIsDesktop()
  const generatedDueRef = useRef(false)
  const { data: transactions = [], isPending: txPending } = useTransactions(filter)
  const { data: categories = [] } = useBudgetCategories()
  const { data: wallets = [] } = useWallets()
  const { data: recurringRules = [] } = useRecurringRules()
  const addTransaction = useAddTransaction()
  const updateTransaction = useUpdateTransaction()
  const del = useDeleteTransaction()
  const addRecurringRule = useAddRecurringRule()
  const runDueRecurringRules = useRunDueRecurringRules()
  const markReviewed = useMarkReviewed()

  useEffect(() => {
    if (!category && categories.length > 0) setCategory(categories[0].name)
  }, [categories, category])

  useEffect(() => {
    if (!walletId && wallets.length > 0) setWalletId(wallets[0].id)
    if (!transferWalletId && wallets.length > 1) setTransferWalletId(wallets[1].id)
  }, [walletId, transferWalletId, wallets])

  useEffect(() => {
    setInputCurrency(current => current || money.displayCurrency)
  }, [money.displayCurrency])

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

  const walletBalances = useMemo(() => {
    const balances = new Map(wallets.map(w => [w.id, w.balance ?? 0]))
    transactions.forEach(tx => {
      if (tx.type === 'income' && tx.wallet_id) balances.set(tx.wallet_id, (balances.get(tx.wallet_id) ?? 0) + tx.amount)
      if (tx.type !== 'income' && tx.type !== 'transfer' && tx.wallet_id) balances.set(tx.wallet_id, (balances.get(tx.wallet_id) ?? 0) - tx.amount)
      if (tx.type === 'transfer') {
        if (tx.wallet_id) balances.set(tx.wallet_id, (balances.get(tx.wallet_id) ?? 0) - tx.amount)
        if (tx.transfer_wallet_id) balances.set(tx.transfer_wallet_id, (balances.get(tx.transfer_wallet_id) ?? 0) + tx.amount)
      }
    })
    return balances
  }, [wallets, transactions])

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
        visibleTransactions = visibleTransactions.filter(tx =>
          tx.description.toLowerCase().includes(q) || tx.category.toLowerCase().includes(q)
        )
      }
      if (dateFrom) visibleTransactions = visibleTransactions.filter(tx => tx.date >= dateFrom)
      if (dateTo) visibleTransactions = visibleTransactions.filter(tx => tx.date <= dateTo)
      return [...visibleTransactions].sort((a, b) => `${b.date}-${b.created_at ?? ''}`.localeCompare(`${a.date}-${a.created_at ?? ''}`))
    },
    [selectedCategory, transactions, searchQuery, dateFrom, dateTo]
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
    () => getMerchantSuggestion(description, transactions),
    [description, transactions]
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

  const nextDueRule = useMemo(
    () => recurringRules.filter(r => r.active).sort((a, b) => a.next_due_date.localeCompare(b.next_due_date))[0] ?? null,
    [recurringRules]
  )

  const resetForm = () => {
    setEditingTransaction(null)
    setDescription('')
    setAmount('')
    setInputCurrency(money.displayCurrency)
    setDate(new Date().toISOString().slice(0, 10))
    setType('expense')
    setCategory(categories[0]?.name ?? '')
    setIsRecurring(false)
    setFrequency('monthly')
    setInstallmentTotal('')
    setEndDate('')
    setCashEnabled(false)
    setCashTendered('')
    setChangeBillsWalletId('')
    setChangeCoinsWalletId('')
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
    setAmount(String(transaction.original_amount ?? money.fromBase(transaction.amount, transaction.original_currency ?? money.displayCurrency)))
    setInputCurrency(transaction.original_currency ?? money.displayCurrency)
    setDate(transaction.date)
    setCategory(transaction.category)
    setWalletId(transaction.wallet_id ?? wallets[0]?.id ?? '')
    setTransferWalletId(transaction.transfer_wallet_id ?? wallets.find(wallet => wallet.id !== transaction.wallet_id)?.id ?? '')
    setType(transaction.type === 'income' || transaction.type === 'transfer' ? transaction.type : 'expense')
    setIsRecurring(false)
    setIsFormOpen(true)
  }

  const handleSaveTransaction = async () => {
    const parsedAmount = parseNumberInput(amount)
    if (!description.trim()) { toast.error('Please enter a merchant name'); return }
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
    const parsedInstallments = parseInt(installmentTotal.replace(/[^\d]/g, ''), 10)

    const payload = {
      description: description.trim(),
      amount: baseAmount,
      original_amount: parsedAmount,
      original_currency: inputCurrency,
      type,
      category: type === 'transfer' ? 'Transfer' : txCategory,
      wallet_id: walletId || null,
      transfer_wallet_id: type === 'transfer' ? transferWalletId : null,
      recurring_rule_id: editingTransaction?.recurring_rule_id ?? null,
      recurring_due_date: editingTransaction?.recurring_due_date ?? null,
      date,
      needs_review: false,
      cash_tendered: cashEnabled && baseTendered > 0 ? baseTendered : null,
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
          const billsChangeEdit = isTWDEdit ? Math.floor(rawChangeEdit / 100) * 100 : 0
          const coinsChangeEdit = isTWDEdit ? rawChangeEdit % 100 : rawChangeEdit
          let firstEditChangeTxId: string | undefined
          if (isTWDEdit && billsChangeEdit > 0 && changeBillsWalletId && changeBillsWalletId !== walletId) {
            const ct = await addTransaction.mutateAsync({
              description: `Change bills — ${description.trim()}`,
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
              description: `Change coins — ${description.trim()}`,
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
              description: `Change — ${description.trim()}`,
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
        toast.success('Transaction updated')
      } else {
        const savedTx = await addTransaction.mutateAsync(payload)
        // Create system-generated change transfer(s) when cash given > expense
        if (cashEnabled && baseChange > 0 && savedTx?.id) {
          const isTWD = inputCurrency === 'TWD'
          const rawChange = parsedTendered - parsedAmount
          const billsChangeAmt = isTWD ? Math.floor(rawChange / 100) * 100 : 0
          const coinsChangeAmt = isTWD ? rawChange % 100 : rawChange
          let firstChangeTxId: string | undefined

          // Bills transfer (only if destination != spending wallet and there are bills)
          if (isTWD && billsChangeAmt > 0 && changeBillsWalletId && changeBillsWalletId !== walletId) {
            const ct = await addTransaction.mutateAsync({
              description: `Change bills — ${description.trim()}`,
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
              description: `Change coins — ${description.trim()}`,
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
              description: `Change — ${description.trim()}`,
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
        if (isRecurring) {
          const completedAtStart = Number.isFinite(parsedInstallments) && parsedInstallments <= 1
          await addRecurringRule.mutateAsync({
            description: description.trim(),
            amount: baseAmount,
            original_amount: parsedAmount,
            original_currency: inputCurrency,
            type,
            category: type === 'transfer' ? 'Transfer' : txCategory,
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
        toast.success(cashEnabled && baseChange > 0 ? `Cash payment added · change routed to wallet` : 'Transaction added')
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

  // Month navigator
  const _today = new Date()
  const navYear = dateFrom ? parseInt(dateFrom.slice(0, 4)) : _today.getFullYear()
  const navMonth = dateFrom ? parseInt(dateFrom.slice(5, 7)) : _today.getMonth() + 1
  const isAllTime = !dateFrom && !dateTo
  const isOnCurrentMonth = navYear === _today.getFullYear() && navMonth === _today.getMonth() + 1
  const monthLabel = new Date(navYear, navMonth - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

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
            {(['all', 'income', 'expense', 'transfer'] as Filter[]).map(f => (
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
          { label: 'Money in', value: money.formatDisplay(moneyIn), dot: 'bg-primary', sub: money.baseCurrency !== money.displayCurrency ? money.formatBase(moneyIn) : 'Income received' },
          { label: 'Money out', value: money.formatDisplay(moneyOut), dot: 'bg-[#FF8388]', sub: money.baseCurrency !== money.displayCurrency ? money.formatBase(moneyOut) : `Across ${transactions.length} transactions` },
          { label: 'Categories', value: `${expenseCategoryTotals.length} items`, dot: 'bg-[#FFD276]', sub: 'Expense breakdown below' },
        ].map(({ label, value, dot, sub }) => (
          <div key={label} className="relative rounded-[1.4rem] border border-border bg-card px-6 py-5">
            <span className={`absolute right-7 top-7 h-4 w-4 rounded-full ${dot}`} />
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-4 break-words text-[1.65rem] font-extrabold leading-none text-foreground sm:text-[2rem]">{value}</p>
            <p className="mt-6 text-sm text-muted-foreground">{sub}</p>
          </div>
        ))}
      </div>

      <Sheet open={isFormOpen} onOpenChange={setIsFormOpen}>
        <SheetContent className="w-full overflow-y-auto border-border bg-background p-5 sm:max-w-md sm:p-6">
          <SheetHeader className="mb-6 text-left">
            <SheetTitle>{editingTransaction ? 'Edit transaction' : 'New transaction'}</SheetTitle>
            <SheetDescription>Fill the amount in the currency you actually paid or received.</SheetDescription>
          </SheetHeader>
          <div className="space-y-5">
            {/* Type selector + big amount — always visible */}
            <div className="rounded-[1.25rem] border border-border bg-card p-4 text-center">
              <div className="mx-auto mb-3 inline-flex rounded-full border border-border bg-secondary p-1">
                {(['income', 'expense', 'transfer'] as const).map(item => (
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
              <Input aria-label="Amount" className="mx-auto h-16 w-full border-0 bg-transparent text-center text-4xl font-extrabold" inputMode="decimal" value={amount} onChange={event => setAmount(formatNumberInput(event.target.value))} placeholder="0" />
              <p className="mt-1 text-xs text-muted-foreground">{inputCurrency}</p>
            </div>

            {/* Merchant — always visible */}
            <div>
              <Label className="text-sm font-bold text-foreground">Merchant name</Label>
              <Input aria-label="Description" className="mt-2 bg-secondary" value={description} onChange={event => setDescription(event.target.value)} placeholder="Enter a merchant name" />
              {merchantSuggestion && !editingTransaction && (
                <button
                  type="button"
                  className="mt-2 rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-bold text-primary"
                  onClick={() => {
                    setCategory(merchantSuggestion.category)
                    if (merchantSuggestion.wallet_id) setWalletId(merchantSuggestion.wallet_id)
                    setType(merchantSuggestion.type === 'income' || merchantSuggestion.type === 'transfer' ? merchantSuggestion.type : 'expense')
                  }}
                  title="Fills in category, wallet, and type from last time you used this merchant"
                >
                  Last time: {merchantSuggestion.category}
                  {merchantSuggestion.wallet_id && wallets.find(w => w.id === merchantSuggestion.wallet_id) && (
                    <span className="ml-1.5 opacity-70">· {wallets.find(w => w.id === merchantSuggestion.wallet_id)!.name}</span>
                  )}
                </button>
              )}
            </div>

            {/* Category — always visible (except transfer) */}
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

            {/* Date + Currency — side by side */}
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
                {type === 'expense' && wallets.find(w => w.id === walletId)?.type === 'cash' && (() => {
                  const selectedWallet = wallets.find(w => w.id === walletId)!
                  const parsedExpense = parseNumberInput(amount)
                  const parsedTendered = parseNumberInput(cashTendered)
                  const changeAmount = cashEnabled && Number.isFinite(parsedTendered) && parsedTendered > parsedExpense ? parsedTendered - parsedExpense : 0
                  const isUnderpay = cashEnabled && Number.isFinite(parsedTendered) && parsedTendered > 0 && parsedTendered < parsedExpense
                  const otherWallets = wallets.filter(w => w.id !== walletId)
                  const walletCurrentBal = walletBalances.get(walletId) ?? 0
                  const showChips = selectedWallet.currency === 'TWD' && inputCurrency === 'TWD'
                  const isTWD = inputCurrency === 'TWD'
                  const billsChange = isTWD ? Math.floor(changeAmount / 100) * 100 : 0
                  const coinsChange = isTWD ? changeAmount % 100 : changeAmount
                  const hasBills = billsChange > 0
                  const hasCoins = coinsChange > 0
                  const twdChips = [100, 500, 1000].filter(n => !Number.isFinite(parsedExpense) || parsedExpense <= 0 || n >= parsedExpense)
                  const validTender = Number.isFinite(parsedTendered) && parsedTendered >= parsedExpense && parsedTendered > 0

                  return (
                    <div className="rounded-[1.25rem] border border-primary/20 bg-primary/5 p-4">
                      <label className="flex cursor-pointer items-center justify-between gap-4">
                        <span>
                          <span className="block text-sm font-extrabold text-foreground">Cash Change Assistant</span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">Track the bill given and change received</span>
                        </span>
                        <input
                          type="checkbox"
                          aria-label="Enable cash change"
                          className="h-5 w-5 accent-primary"
                          checked={cashEnabled}
                          onChange={e => {
                            setCashEnabled(e.target.checked)
                            if (e.target.checked) {
                              const coinsWallet = otherWallets.find(w => w.cash_role === 'coins')
                              setChangeCoinsWalletId(coinsWallet?.id ?? otherWallets[0]?.id ?? '')
                              const billsWallet = otherWallets.find(w => w.cash_role === 'notes' || w.cash_role === 'mixed')
                              setChangeBillsWalletId(billsWallet?.id ?? '')
                              if (!cashTendered && parsedExpense > 0 && showChips) {
                                const minDenom = parsedExpense <= 100 ? 100 : parsedExpense <= 500 ? 500 : 1000
                                setCashTendered(String(minDenom))
                              }
                            }
                            if (!e.target.checked) setCashTendered('')
                          }}
                        />
                      </label>

                      {cashEnabled && (
                        <div className="mt-4 space-y-4">
                          <div>
                            <Label className="text-xs font-bold text-muted-foreground">Cash given ({inputCurrency})</Label>
                            <Input
                              aria-label="Cash given"
                              className="mt-2 bg-secondary"
                              inputMode="decimal"
                              value={cashTendered}
                              onChange={e => setCashTendered(formatNumberInput(e.target.value))}
                              placeholder="Amount you handed over"
                            />
                            {showChips && (
                              <div className="mt-2 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => setCashTendered(parsedExpense > 0 ? String(parsedExpense) : '')}
                                  className="min-h-[44px] rounded-xl border border-border bg-secondary px-4 text-sm font-bold text-foreground transition-colors hover:border-primary hover:text-primary"
                                >
                                  Exact
                                </button>
                                {twdChips.map(chip => (
                                  <button
                                    key={chip}
                                    type="button"
                                    onClick={() => setCashTendered(String(chip))}
                                    className={`min-h-[44px] rounded-xl border px-4 text-sm font-bold transition-colors ${parsedTendered === chip ? 'border-primary bg-primary/15 text-primary' : 'border-border bg-secondary text-foreground hover:border-primary hover:text-primary'}`}
                                  >
                                    NT${chip.toLocaleString()}
                                  </button>
                                ))}
                              </div>
                            )}
                            {isUnderpay && (
                              <p className="mt-2 text-xs font-bold text-red-400">Cash given must be at least the expense amount</p>
                            )}
                            {!isUnderpay && Number.isFinite(parsedTendered) && parsedTendered > 0 && walletCurrentBal < money.toBase(parsedTendered, inputCurrency) && (
                              <p className="mt-2 text-xs font-bold text-[#FFCF73]">⚠ Wallet balance {money.formatBase(walletCurrentBal)} may be lower than cash given</p>
                            )}
                          </div>

                          {changeAmount > 0 && isTWD && hasBills && hasCoins && (
                            <>
                              <div>
                                <Label className="text-xs font-bold text-muted-foreground">
                                  Bills change (NT${billsChange.toLocaleString()}) stays in
                                </Label>
                                <select
                                  aria-label="Bills change destination wallet"
                                  className="mt-2 h-11 w-full rounded-md border border-input bg-secondary px-3 text-sm font-bold text-foreground outline-none"
                                  value={changeBillsWalletId}
                                  onChange={e => setChangeBillsWalletId(e.target.value)}
                                >
                                  <option value="">Keep in {selectedWallet.name}</option>
                                  {otherWallets.map(w => (
                                    <option key={w.id} value={w.id}>{w.name}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <Label className="text-xs font-bold text-muted-foreground">
                                  Coins change (NT${coinsChange.toLocaleString()}) goes to
                                </Label>
                                <select
                                  aria-label="Coins change destination wallet"
                                  className="mt-2 h-11 w-full rounded-md border border-input bg-secondary px-3 text-sm font-bold text-foreground outline-none"
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
                            </>
                          )}
                          {changeAmount > 0 && isTWD && hasBills && !hasCoins && (
                            <div>
                              <Label className="text-xs font-bold text-muted-foreground">
                                Bills change (NT${billsChange.toLocaleString()}) stays in
                              </Label>
                              <select
                                aria-label="Bills change destination wallet"
                                className="mt-2 h-11 w-full rounded-md border border-input bg-secondary px-3 text-sm font-bold text-foreground outline-none"
                                value={changeBillsWalletId}
                                onChange={e => setChangeBillsWalletId(e.target.value)}
                              >
                                <option value="">Keep in {selectedWallet.name}</option>
                                {otherWallets.map(w => (
                                  <option key={w.id} value={w.id}>{w.name}</option>
                                ))}
                              </select>
                            </div>
                          )}
                          {changeAmount > 0 && isTWD && !hasBills && hasCoins && (
                            <div>
                              <Label className="text-xs font-bold text-muted-foreground">
                                Coins change (NT${coinsChange.toLocaleString()}) goes to
                              </Label>
                              <select
                                aria-label="Coins change destination wallet"
                                className="mt-2 h-11 w-full rounded-md border border-input bg-secondary px-3 text-sm font-bold text-foreground outline-none"
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
                          {changeAmount > 0 && !isTWD && (
                            <div>
                              <Label className="text-xs font-bold text-muted-foreground">
                                Change ({money.format(changeAmount, inputCurrency)}) goes to
                              </Label>
                              <select
                                aria-label="Change destination wallet"
                                className="mt-2 h-11 w-full rounded-md border border-input bg-secondary px-3 text-sm font-bold text-foreground outline-none"
                                value={changeCoinsWalletId}
                                onChange={e => setChangeCoinsWalletId(e.target.value)}
                              >
                                <option value="">Keep in same wallet (no transfer)</option>
                                {otherWallets.map(w => (
                                  <option key={w.id} value={w.id}>
                                    {w.name}{w.cash_role === 'coins' ? ' · coin pouch' : ''}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}

                          {validTender && (
                            <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                              <p className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Balance preview</p>
                              <div className="space-y-2 text-sm">
                                <div className="flex items-center justify-between gap-3">
                                  <span className="text-muted-foreground">{selectedWallet.name}</span>
                                  <span className="font-extrabold text-foreground">
                                    {money.formatDisplay(walletCurrentBal)} → {money.formatDisplay(walletCurrentBal - money.toBase(parsedTendered, inputCurrency))}
                                  </span>
                                </div>
                                {hasBills && changeBillsWalletId && changeBillsWalletId !== walletId && (
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="text-muted-foreground">{wallets.find(w => w.id === changeBillsWalletId)?.name}</span>
                                    <span className="font-extrabold text-foreground">
                                      {money.formatDisplay(walletBalances.get(changeBillsWalletId) ?? 0)} → {money.formatDisplay((walletBalances.get(changeBillsWalletId) ?? 0) + money.toBase(billsChange, inputCurrency))}
                                    </span>
                                  </div>
                                )}
                                {hasCoins && changeCoinsWalletId && (
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="text-muted-foreground">{wallets.find(w => w.id === changeCoinsWalletId)?.name}</span>
                                    <span className="font-extrabold text-foreground">
                                      {money.formatDisplay(walletBalances.get(changeCoinsWalletId) ?? 0)} → {money.formatDisplay((walletBalances.get(changeCoinsWalletId) ?? 0) + money.toBase(coinsChange, inputCurrency))}
                                    </span>
                                  </div>
                                )}
                                {!isTWD && changeAmount > 0 && changeCoinsWalletId && (
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="text-muted-foreground">{wallets.find(w => w.id === changeCoinsWalletId)?.name}</span>
                                    <span className="font-extrabold text-foreground">
                                      {money.formatDisplay(walletBalances.get(changeCoinsWalletId) ?? 0)} → {money.formatDisplay((walletBalances.get(changeCoinsWalletId) ?? 0) + money.toBase(changeAmount, inputCurrency))}
                                    </span>
                                  </div>
                                )}
                                <div className="flex items-center justify-between gap-3 border-t border-border pt-2">
                                  <span className="text-muted-foreground">Expense recorded</span>
                                  <span className="font-extrabold text-primary">{money.format(parsedExpense, inputCurrency)}</span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })()}

                {/* Recurring */}
                {!editingTransaction && (
                  <div className="rounded-[1.25rem] border border-border bg-card p-4">
                    <label className="flex items-center justify-between gap-4">
                      <span>
                        <span className="block text-sm font-extrabold text-foreground">Recurring / Cicilan</span>
                        <span className="mt-1 block text-xs text-muted-foreground">For rent, subscriptions, salary, or installments.</span>
                      </span>
                      <input
                        aria-label="Recurring / Cicilan"
                        type="checkbox"
                        className="h-5 w-5 accent-primary"
                        checked={isRecurring}
                        onChange={event => setIsRecurring(event.target.checked)}
                      />
                    </label>
                    {isRecurring && (
                      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <Label className="text-xs font-bold text-muted-foreground">Repeat</Label>
                          <select aria-label="Recurring frequency" className="mt-2 h-11 w-full rounded-md border border-input bg-secondary px-3 text-sm font-bold text-foreground outline-none" value={frequency} onChange={event => setFrequency(event.target.value as RecurringFrequency)}>
                            <option value="daily">Daily</option>
                            <option value="weekly">Weekly</option>
                            <option value="monthly">Monthly</option>
                            <option value="yearly">Yearly</option>
                          </select>
                        </div>
                        <div>
                          <Label className="text-xs font-bold text-muted-foreground">Installments</Label>
                          <Input aria-label="Installment count" className="mt-2 bg-secondary" inputMode="numeric" value={installmentTotal} onChange={event => setInstallmentTotal(formatNumberInput(event.target.value))} placeholder="Empty = no limit" />
                        </div>
                        <div className="sm:col-span-2">
                          <Label className="text-xs font-bold text-muted-foreground">End date</Label>
                          <Input aria-label="Recurring end date" className="mt-2 bg-secondary" type="date" value={endDate} onChange={event => setEndDate(event.target.value)} />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

            <Button className="mt-4 w-full" onClick={handleSaveTransaction} disabled={addTransaction.isPending || updateTransaction.isPending || wallets.length === 0 || cannotSaveTransfer || (type === 'expense' && categories.length === 0)}>
              {editingTransaction ? 'Save transaction' : 'Add transaction'}
            </Button>
            <Button variant="secondary" className="mt-2 w-full" onClick={() => setIsFormOpen(false)}>
              Cancel
            </Button>
          </div>
        </SheetContent>
      </Sheet>


      {expenseCategoryTotals.length > 0 && (
        <div className="mb-6 rounded-[1.4rem] border border-border bg-card px-4 py-5 sm:px-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-extrabold text-foreground">Expense by category</h2>
            <p className="text-xs font-bold text-muted-foreground">Tap to filter</p>
          </div>
          <div data-testid="expense-category-list" className="grid max-h-[220px] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
            {expenseCategoryTotals.map(([name, value]) => (
              <button
                key={name}
                type="button"
                aria-label={`Filter by ${name} — ${value.count} transaction${value.count === 1 ? '' : 's'}`}
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
        </div>
      )}

      {upcomingRecurringRules.length > 0 && (
        <div className="mb-6 rounded-[1.4rem] border border-border bg-card px-4 py-5 sm:px-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-extrabold text-foreground">Recurring / cicilan</h2>
              <p className="mt-1 text-xs font-bold text-muted-foreground">Auto-generates due payments without duplicates.</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={handleGenerateDue}
                disabled={runDueRecurringRules.isPending}
                title={nextDueRule ? `Next due: ${nextDueRule.description} on ${nextDueRule.next_due_date}` : 'No upcoming rules'}
              >
                Generate due
              </Button>
              <Button asChild size="sm" variant="secondary">
                <Link to="/subscriptions">Manage →</Link>
              </Button>
            </div>
          </div>
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
                  <p className="mt-1 text-sm text-muted-foreground">{rule.category} · next {rule.next_due_date}</p>
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
                        {candidate.category} · {candidate.count}× · avg {money.formatBase(candidate.amount)}
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
                {money.baseCurrency !== money.displayCurrency && <p className="mt-1 text-xs text-muted-foreground">{money.formatBase(selectedCategoryTotal)}</p>}
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
              <button
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${selectMode ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-secondary text-muted-foreground hover:text-foreground'}`}
                onClick={toggleSelectMode}
                aria-label="Toggle multi-select"
              >
                <CheckSquare className="h-3.5 w-3.5" />
                Select
              </button>
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
              <span className="text-xs text-muted-foreground">· {sortedTransactions.length}</span>
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
          {!isAllTime && (
            <button
              onClick={() => { setDateFrom(''); setDateTo('') }}
              className="ml-1 rounded-full bg-secondary px-3 py-1.5 text-xs font-bold text-muted-foreground transition-colors hover:text-foreground"
            >
              All
            </button>
          )}
        </div>

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
                  <button
                    key={tx.id}
                    type="button"
                    className={`w-full rounded-xl border px-4 py-3 text-left transition-colors active:scale-[0.99] ${isSelected ? 'border-primary bg-primary/5' : tx.needs_review ? 'border-[#FFCF73]/30 bg-[#FFCF73]/5' : 'border-border bg-secondary hover:border-border/80 hover:bg-muted/30'}`}
                    onClick={selectMode ? () => toggleSelectId(tx.id) : () => setDetailTx(tx)}
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
                          <span className="truncate">{tx.category}{txWallet ? ` · ${txWallet.name}` : ''} · {formatDate(tx.date)}</span>
                        </div>
                        {linkedChange.length > 0 && (() => {
                          const changeAmt = tx.cash_tendered! - (tx.original_amount ?? tx.amount)
                          const changeWallet = wallets.find(w => w.id === linkedChange[0].wallet_id)
                          return changeAmt > 0 ? (
                            <p className="mt-1 text-[11px] text-muted-foreground/70">
                              Cash {money.format(tx.cash_tendered!, tx.original_currency ?? money.baseCurrency)} · change {money.format(changeAmt, tx.original_currency ?? money.baseCurrency)}{changeWallet ? ` → ${changeWallet.name}` : ''}
                            </p>
                          ) : null
                        })()}
                      </div>
                      <span className={`shrink-0 text-sm font-extrabold ${txAmountColor(tx.amount, tx.type)}`}>
                        {txAmountSign(tx.amount, tx.type)}{money.formatDisplay(tx.amount)}
                      </span>
                    </div>
                  </button>
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
                        <TableCell className="text-muted-foreground">{tx.category}</TableCell>
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
                          {txAmountSign(tx.amount, tx.type)}{money.formatDisplay(tx.amount)}
                        </TableCell>
                        {!selectMode && (
                          <TableCell className="w-[124px]">
                            <div className="flex justify-end gap-1">
                              {tx.needs_review && (
                                <Button size="sm" variant="ghost" className="h-9 w-9 p-0 text-[#FFCF73] hover:bg-[#FFCF73]/10 hover:text-[#FFCF73]" onClick={() => handleMarkReviewed(tx.id)} aria-label={`Mark ${tx.description} as reviewed`}>
                                  <CheckCircle size={15} />
                                </Button>
                              )}
                              <Button size="sm" variant="ghost" className="h-9 w-9 p-0 text-muted-foreground hover:bg-muted/20 hover:text-foreground" onClick={() => handleDuplicateTransaction(tx)} aria-label={`Duplicate ${tx.description}`}>
                                <Copy size={15} />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-9 w-9 p-0 text-muted-foreground hover:bg-muted/20 hover:text-foreground" onClick={() => openEditForm(tx)} aria-label={`Edit ${tx.description}`}>
                                <Pencil size={15} />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-9 w-9 p-0 text-red-400 hover:bg-red-500/10 hover:text-red-300" onClick={() => handleDeleteTransaction(tx)} aria-label={`Delete ${tx.description}`}>
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
            <div>
              <p className="font-semibold text-foreground">No transactions yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Add your first income or expense to get started.</p>
            </div>
            <Button onClick={openAddForm} className="gap-2">
              <Plus size={16} />
              Add transaction
            </Button>
          </div>
        )}
      </div>
      {/* Bulk action bar — shown when items are selected */}
      {selectMode && selectedIds.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-between gap-3 border-t border-border bg-card px-4 py-3 shadow-lg sm:px-6">
          <span className="text-sm font-extrabold text-foreground">{selectedIds.size} selected</span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={bulkMarkReviewed}
              disabled={!sortedTransactions.some(tx => selectedIds.has(tx.id) && tx.needs_review)}
            >
              <CheckCircle className="mr-1.5 h-3.5 w-3.5" />
              Mark reviewed
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
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
      )}
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

      {/* Transaction detail sheet (mobile) */}
      <Sheet open={!!detailTx} onOpenChange={open => { if (!open) setDetailTx(null) }}>
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-3xl px-0 pb-0">
          {detailTx && (() => {
            const tx = detailTx
            const wallet = wallets.find(w => w.id === tx.wallet_id)
            const transferWallet = wallets.find(w => w.id === tx.transfer_wallet_id)
            const changeAmount = tx.cash_tendered && tx.cash_tendered > 0 ? tx.cash_tendered - (tx.original_amount ?? tx.amount) : 0
            const linkedChangeTx = transactions.filter(t => t.linked_transaction_id === tx.id && t.is_system_generated)
            return (
              <div>
                <div className="px-6 pb-4 pt-2">
                  <SheetHeader className="mb-4 text-left">
                    <SheetTitle className="text-base font-extrabold">{tx.description}</SheetTitle>
                    <SheetDescription className="sr-only">Transaction details</SheetDescription>
                  </SheetHeader>

                  {/* Amount hero */}
                  <div className="mb-5 text-center">
                    <p className={`text-4xl font-extrabold tracking-tight ${txAmountColor(tx.amount, tx.type)}`}>
                      {txAmountSign(tx.amount, tx.type)}{money.formatDisplay(tx.amount)}
                    </p>
                    {money.baseCurrency !== (tx.original_currency ?? money.baseCurrency) && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {money.format(tx.original_amount ?? tx.amount, tx.original_currency ?? money.baseCurrency)}
                      </p>
                    )}
                    <span className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-bold ${tx.type === 'income' ? 'bg-green-500/15 text-green-400' : tx.type === 'expense' ? 'bg-red-500/15 text-red-400' : 'bg-blue-500/15 text-blue-400'}`}>
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
                        <span className="text-sm font-bold text-foreground">{tx.category}</span>
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
                              {money.format(ct.original_amount ?? ct.amount, ct.original_currency ?? money.baseCurrency)} → {ctWallet?.name ?? 'wallet'}
                            </p>
                          )
                        })}
                      </div>
                    )}
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
                </div>

                {/* Action buttons */}
                <div className="sticky bottom-0 border-t border-border bg-background px-6 py-4">
                  <div className="flex gap-2">
                    <Button
                      className="h-14 flex-1 gap-2"
                      variant="secondary"
                      onClick={() => { setDetailTx(null); openEditForm(tx) }}
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
                      className="h-14 w-14 shrink-0 gap-2 text-red-400 hover:bg-red-500/10 hover:text-red-300"
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
