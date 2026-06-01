import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
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
  useDeleteRecurringRule,
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
import { Trash2, Pencil, Plus, Copy, CheckCircle, CalendarRange, X, ReceiptText, ChevronDown } from 'lucide-react'
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

export function Transactions() {
  const money = useMoney()
  const [searchParams] = useSearchParams()
  const [filter, setFilter] = useState<Filter>('all')
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('q') ?? '')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Transaction | null>(null)
  const [deleteRuleTarget, setDeleteRuleTarget] = useState<RecurringRule | null>(null)
  const [editingRule, setEditingRule] = useState<RecurringRule | null>(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [showDateFilter, setShowDateFilter] = useState(false)
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
  const [type, setType] = useState<EntryType>('expense')
  const [isRecurring, setIsRecurring] = useState(false)
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly')
  const [installmentTotal, setInstallmentTotal] = useState('')
  const [endDate, setEndDate] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [cashEnabled, setCashEnabled] = useState(false)
  const [cashTendered, setCashTendered] = useState('')
  const [changeWalletId, setChangeWalletId] = useState('')
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
  const updateRecurringRule = useUpdateRecurringRule()
  const deleteRecurringRule = useDeleteRecurringRule()
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
    setShowAdvanced(false)
    setCashEnabled(false)
    setCashTendered('')
    setChangeWalletId('')
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
    setShowAdvanced(true)
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
        // Recalculate linked change transfer if it exists
        const prevLinkedId = editingTx.linked_transaction_id
        if (cashEnabled && baseChange > 0 && changeWalletId) {
          const changePayload = {
            amount: baseChange,
            original_amount: parsedTendered - parsedAmount,
            original_currency: inputCurrency,
            wallet_id: walletId || null,
            transfer_wallet_id: changeWalletId,
            date,
          }
          if (prevLinkedId) {
            await updateTransaction.mutateAsync({ id: prevLinkedId, ...changePayload })
          } else {
            await addTransaction.mutateAsync({
              description: `Change — ${description.trim()}`,
              ...changePayload,
              type: 'transfer',
              category: 'Transfer',
              recurring_rule_id: null,
              recurring_due_date: null,
              needs_review: false,
              is_system_generated: true,
              linked_transaction_id: editingTx.id,
              cash_tendered: null,
            })
          }
        } else if (prevLinkedId) {
          await del.mutateAsync(prevLinkedId)
        }
        toast.success('Transaction updated')
      } else {
        const savedTx = await addTransaction.mutateAsync(payload)
        // Create system-generated change transfer when cash given > expense
        if (cashEnabled && baseChange > 0 && changeWalletId && savedTx?.id) {
          const changeTx = await addTransaction.mutateAsync({
            description: `Change — ${description.trim()}`,
            amount: baseChange,
            original_amount: parsedTendered - parsedAmount,
            original_currency: inputCurrency,
            type: 'transfer',
            category: 'Transfer',
            wallet_id: walletId || null,
            transfer_wallet_id: changeWalletId,
            recurring_rule_id: null,
            recurring_due_date: null,
            date,
            needs_review: false,
            is_system_generated: true,
            linked_transaction_id: savedTx.id,
            cash_tendered: null,
          })
          // Bidirectional link: update expense tx to point back to change transfer
          if (changeTx?.id) {
            await updateTransaction.mutateAsync({ id: savedTx.id, linked_transaction_id: changeTx.id })
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
        toast.success(cashEnabled && baseChange > 0 ? `Cash payment added · ${money.format(parsedTendered - parsedAmount, inputCurrency)} change to pouch` : 'Transaction added')
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
    setDeleteTarget(null)
    try {
      await del.mutateAsync(deleteTarget.id)
      if (linkedId) await del.mutateAsync(linkedId)
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

  const handleToggleRule = (rule: RecurringRule) => {
    updateRecurringRule.mutate({ id: rule.id, active: !rule.active })
  }

  const confirmDeleteRule = () => {
    if (!deleteRuleTarget) return
    deleteRecurringRule.mutate(deleteRuleTarget.id)
    toast.success('Recurring rule removed')
    setDeleteRuleTarget(null)
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

  const openEditRule = (rule: RecurringRule) => {
    setEditingRule(rule)
    setRuleDescription(rule.description)
    setRuleAmount(String(rule.original_amount))
    setRuleInputCurrency(rule.original_currency)
    setRuleFrequency(rule.frequency)
    setRuleNextDueDate(rule.next_due_date)
    setRuleEndDate(rule.end_date ?? '')
  }

  const handleSaveRule = async () => {
    if (!editingRule) return
    const parsedAmount = parseNumberInput(ruleAmount)
    if (!ruleDescription.trim() || !Number.isFinite(parsedAmount) || parsedAmount <= 0) return
    const baseAmount = money.toBase(parsedAmount, ruleInputCurrency)
    await updateRecurringRule.mutateAsync({
      id: editingRule.id,
      description: ruleDescription.trim(),
      amount: baseAmount,
      original_amount: parsedAmount,
      original_currency: ruleInputCurrency,
      frequency: ruleFrequency,
      next_due_date: ruleNextDueDate,
      end_date: ruleEndDate || null,
    })
    toast.success('Recurring rule updated')
    setEditingRule(null)
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

  return (
    <div>
      <PageHeader
        title="Transactions"
        subtitle={<><span className="hidden sm:inline">Track every cashflow with clean filters, wallet routing, and category breakdowns.</span><span className="sm:hidden">Track spending and income.</span></>}
        searchValue={searchQuery}
        onSearchChange={q => { setSearchQuery(q); setSelectedCategory(null) }}
        action={(
          <div className="flex items-center gap-2">
            <button
              className={`flex h-10 w-10 items-center justify-center rounded-full border transition-colors ${showDateFilter || dateFrom || dateTo ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-secondary text-muted-foreground hover:text-foreground'}`}
              onClick={() => setShowDateFilter(v => !v)}
              title="Date range filter"
              aria-label="Toggle date range filter"
            >
              <CalendarRange className="h-4 w-4" />
            </button>
            <Button onClick={openAddForm} className="hidden gap-2 lg:inline-flex">
              <Plus className="h-4 w-4" />
              New transaction
            </Button>
          </div>
        )}
      />
      <div className="relative mb-8">
        <Tabs value={filter} onValueChange={v => { setFilter(v as Filter); setSelectedCategory(null); setSearchQuery(''); setDateFrom(''); setDateTo('') }} className="overflow-x-auto rounded-[1.4rem] border border-border bg-card p-4 sm:p-7">
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
                >
                  Use suggestion: {merchantSuggestion.category}
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

            {/* More options toggle */}
            <button
              type="button"
              onClick={() => setShowAdvanced(v => !v)}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-border bg-secondary py-2.5 text-xs font-bold text-muted-foreground transition-colors hover:text-foreground active:bg-muted/40"
            >
              <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${showAdvanced ? 'rotate-180' : ''}`} />
              {showAdvanced ? 'Fewer options' : 'More options'}
            </button>

            {/* Advanced fields */}
            {showAdvanced && (
              <div className="space-y-5">
                {/* Currency */}
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

                {/* Date */}
                <div>
                  <Label className="text-sm font-bold text-foreground">Date</Label>
                  <Input aria-label="Date" className="mt-2 bg-secondary" type="date" value={date} onChange={event => setDate(event.target.value)} />
                </div>

                {/* Wallet(s) */}
                {type !== 'transfer' ? (
                  <div>
                    <Label className="text-sm font-bold text-foreground">Wallet</Label>
                    <select aria-label="Wallet" className="mt-2 h-11 w-full rounded-md border border-input bg-secondary px-3 text-sm font-bold text-foreground outline-none" value={walletId} onChange={event => { setWalletId(event.target.value); setCashEnabled(false); setCashTendered(''); setChangeWalletId('') }}>
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

                {/* Cash Change Assistant — expense + cash wallet only */}
                {type === 'expense' && wallets.find(w => w.id === walletId)?.type === 'cash' && (() => {
                  const selectedWallet = wallets.find(w => w.id === walletId)!
                  const parsedExpense = parseNumberInput(amount)
                  const parsedTendered = parseNumberInput(cashTendered)
                  const changeAmount = cashEnabled && Number.isFinite(parsedTendered) && parsedTendered > parsedExpense ? parsedTendered - parsedExpense : 0
                  const isUnderpay = cashEnabled && Number.isFinite(parsedTendered) && parsedTendered > 0 && parsedTendered < parsedExpense
                  const otherWallets = wallets.filter(w => w.id !== walletId)
                  const walletCurrentBal = walletBalances.get(walletId) ?? 0
                  const changeWalletBal = walletBalances.get(changeWalletId) ?? 0
                  const showChips = selectedWallet.currency === 'TWD' && inputCurrency === 'TWD'
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
                            if (e.target.checked && !changeWalletId) {
                              const coinPouch = otherWallets.find(w => w.cash_role === 'coins')
                              const anyCash = otherWallets.find(w => w.type === 'cash')
                              setChangeWalletId(coinPouch?.id ?? anyCash?.id ?? '')
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

                          {changeAmount > 0 && (
                            <div>
                              <Label className="text-xs font-bold text-muted-foreground">
                                Change ({money.format(changeAmount, inputCurrency)}) goes to
                              </Label>
                              <select
                                aria-label="Change destination wallet"
                                className="mt-2 h-11 w-full rounded-md border border-input bg-secondary px-3 text-sm font-bold text-foreground outline-none"
                                value={changeWalletId}
                                onChange={e => setChangeWalletId(e.target.value)}
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
                                {changeAmount > 0 && changeWalletId && (
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="text-muted-foreground">{wallets.find(w => w.id === changeWalletId)?.name}</span>
                                    <span className="font-extrabold text-foreground">
                                      {money.formatDisplay(changeWalletBal)} → {money.formatDisplay(changeWalletBal + money.toBase(changeAmount, inputCurrency))}
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
            )}

            <Button className="mt-4 w-full" onClick={handleSaveTransaction} disabled={addTransaction.isPending || updateTransaction.isPending || wallets.length === 0 || cannotSaveTransfer || (type === 'expense' && categories.length === 0)}>
              {editingTransaction ? 'Save transaction' : 'Add transaction'}
            </Button>
            <Button variant="secondary" className="mt-2 w-full lg:hidden" onClick={() => setIsFormOpen(false)}>
              Close
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
            <Button variant="secondary" className="mt-2 w-full lg:hidden" onClick={() => setEditingRule(null)}>
              Close
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {showDateFilter && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-[1.4rem] border border-border bg-card px-4 py-4 sm:px-6">
          <span className="text-sm font-bold text-muted-foreground">Date range</span>
          <Input
            type="date"
            aria-label="Date from"
            className="h-9 w-auto min-w-0 bg-secondary text-sm"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
          />
          <span className="text-muted-foreground">→</span>
          <Input
            type="date"
            aria-label="Date to"
            className="h-9 w-auto min-w-0 bg-secondary text-sm"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
          />
          {(dateFrom || dateTo) && (
            <button
              className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground"
              onClick={() => { setDateFrom(''); setDateTo('') }}
            >
              <X className="h-3 w-3" />
              Clear
            </button>
          )}
          {(dateFrom || dateTo) && (
            <span className="text-xs text-primary font-bold">{sortedTransactions.length} result{sortedTransactions.length !== 1 ? 's' : ''}</span>
          )}
        </div>
      )}

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
                aria-label={`View ${name} category`}
                className={`flex min-h-12 items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${selectedCategory === name ? 'border-primary bg-primary/10' : 'border-border bg-secondary hover:bg-muted/50'}`}
                onClick={() => setSelectedCategory(name)}
              >
                <span className="min-w-0 truncate font-extrabold text-foreground">{name}</span>
                <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground">{value.count} item{value.count === 1 ? '' : 's'}</span>
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
            <Button
              size="sm"
              variant="secondary"
              onClick={handleGenerateDue}
              disabled={runDueRecurringRules.isPending}
              title={nextDueRule ? `Next due: ${nextDueRule.description} on ${nextDueRule.next_due_date}` : 'No upcoming rules'}
            >
              Generate due transactions
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {upcomingRecurringRules.map(rule => (
              <div key={rule.id} className={`rounded-2xl border p-4 ${rule.active ? 'border-border bg-secondary' : 'border-border/60 bg-secondary/50 opacity-70'}`}>
                <div className="flex items-center justify-between gap-3">
                  <p className="min-w-0 truncate font-extrabold text-foreground">{rule.description}</p>
                  <p className="shrink-0 text-sm font-bold text-primary">{rule.frequency}</p>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{rule.category} - next {rule.next_due_date}</p>
                <p className="mt-1 text-sm font-bold text-foreground">
                  {money.format(rule.original_amount, rule.original_currency)}
                  {rule.original_currency !== money.baseCurrency && <span className="ml-2 text-xs text-muted-foreground">~ {money.formatBase(rule.amount)}</span>}
                </p>
                {rule.installment_total && (
                  <p className="mt-1 text-xs font-bold text-muted-foreground">{rule.installment_paid}/{rule.installment_total} paid</p>
                )}
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => handleToggleRule(rule)}>{rule.active ? 'Pause' : 'Resume'}</Button>
                  <Button size="sm" variant="secondary" onClick={() => openEditRule(rule)}><Pencil size={13} className="mr-1" />Edit</Button>
                  <Button size="sm" variant="ghost" className="text-red-400 hover:bg-red-500/10 hover:text-red-300" onClick={() => setDeleteRuleTarget(rule)}>Delete</Button>
                </div>
              </div>
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
          <h2 className="mb-4 text-xl font-extrabold text-foreground">Transaction history</h2>
        )}
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
              {rows.map(tx => (
                <div
                  key={tx.id}
                  className={`rounded-xl border border-border px-4 py-3 ${tx.needs_review ? 'bg-[#FFCF73]/5' : 'bg-secondary'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {tx.needs_review && <span className="h-2 w-2 shrink-0 rounded-full bg-[#FFCF73]" />}
                        <p className="truncate text-sm font-bold text-foreground">{tx.description}</p>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {tx.category}
                        {tx.cash_tendered && tx.cash_tendered > 0 && (
                          <span className="ml-2 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                            Cash · {money.formatDisplay(tx.cash_tendered)} given
                          </span>
                        )}
                      </p>
                    </div>
                    <span className={`shrink-0 text-sm font-extrabold ${txAmountColor(tx.amount, tx.type)}`}>
                      {txAmountSign(tx.amount, tx.type)}{money.formatDisplay(tx.amount)}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      {money.format(tx.original_amount ?? tx.amount, tx.original_currency ?? money.baseCurrency)}
                      {money.baseCurrency !== (tx.original_currency ?? money.baseCurrency) && ` ~ ${money.formatBase(tx.amount)}`}
                    </p>
                    <div className="flex gap-1">
                      {tx.needs_review && (
                        <Button size="sm" variant="ghost" className="h-11 w-11 p-0 text-[#FFCF73]" onClick={() => handleMarkReviewed(tx.id)} aria-label={`Mark ${tx.description} as reviewed`}>
                          <CheckCircle size={17} />
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-11 w-11 p-0 text-muted-foreground" onClick={() => handleDuplicateTransaction(tx)} aria-label={`Duplicate ${tx.description}`}>
                        <Copy size={17} />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-11 w-11 p-0 text-muted-foreground" onClick={() => openEditForm(tx)} aria-label={`Edit ${tx.description}`}>
                        <Pencil size={17} />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-11 w-11 p-0 text-red-400" onClick={() => handleDeleteTransaction(tx)} aria-label={`Delete ${tx.description}`}>
                        <Trash2 size={17} />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>}

            {/* Desktop table */}
            {isDesktop && <div className="overflow-x-auto rounded-2xl border border-border">
              <Table className="min-w-[820px]">
                <TableBody>
                  <TableRow className="border-border bg-secondary/70 hover:bg-secondary/70">
                    <TableCell className="py-2 text-xs font-bold text-muted-foreground">Item name</TableCell>
                    <TableCell className="py-2 text-xs font-bold text-muted-foreground">Category</TableCell>
                    <TableCell className="py-2 text-xs font-bold text-muted-foreground">Note</TableCell>
                    <TableCell className="py-2 text-right text-xs font-bold text-muted-foreground">Price</TableCell>
                    <TableCell className="py-2" />
                  </TableRow>
                  {rows.map(tx => (
                    <TableRow key={tx.id} className={`border-border hover:bg-muted/10 ${tx.needs_review ? 'bg-[#FFCF73]/5' : ''}`}>
                      <TableCell className="w-1/4 py-3 text-foreground">
                        <div className="flex items-center gap-2">
                          {tx.needs_review && <span className="h-2 w-2 shrink-0 rounded-full bg-[#FFCF73]" title="Needs review" />}
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
                      <TableCell className="w-[124px]">
                        <div className="flex justify-end gap-1">
                          {tx.needs_review && (
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-[#FFCF73] hover:bg-[#FFCF73]/10 hover:text-[#FFCF73]" onClick={() => handleMarkReviewed(tx.id)} aria-label={`Mark ${tx.description} as reviewed`}>
                              <CheckCircle size={15} />
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:bg-muted/20 hover:text-foreground" onClick={() => handleDuplicateTransaction(tx)} aria-label={`Duplicate ${tx.description}`}>
                            <Copy size={15} />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:bg-muted/20 hover:text-foreground" onClick={() => openEditForm(tx)} aria-label={`Edit ${tx.description}`}>
                            <Pencil size={15} />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-400 hover:bg-red-500/10 hover:text-red-300" onClick={() => handleDeleteTransaction(tx)} aria-label={`Delete ${tx.description}`}>
                            <Trash2 size={15} />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
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
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={deleteTarget ? `Delete ${deleteTarget.description}?` : ''}
        description="This removes the transaction from your history and wallet calculations."
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDeleteTransaction}
      />
      <ConfirmDialog
        open={Boolean(deleteRuleTarget)}
        title={deleteRuleTarget ? `Delete recurring rule for ${deleteRuleTarget.description}?` : ''}
        description="Existing generated transactions stay in history. Only future automatic payments stop."
        onCancel={() => setDeleteRuleTarget(null)}
        onConfirm={confirmDeleteRule}
      />
    </div>
  )
}
