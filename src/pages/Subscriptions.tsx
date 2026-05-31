import { useMemo, useState } from 'react'
import { useRecurringRules, useAddRecurringRule, useUpdateRecurringRule, useDeleteRecurringRule, useAddTransaction, useTransactions, useWallets, useBudgetCategories } from '@/lib/queries'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatCard } from '@/components/shared/StatCard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { useMoney, txAmountColor, txAmountSign } from '@/lib/currency'
import { parseNumberInput } from '@/lib/numberInput'
import { MoneyInput } from '@/components/shared/MoneyInput'
import { FREQ_MONTHS, getMonthlyImpact, getYearlyImpact } from '@/lib/subscriptionCalc'
import { toast } from 'sonner'
import { Plus, Pause, Play, Trash2, RefreshCw, X, Pencil } from 'lucide-react'
import type { RecurringRule, RecurringFrequency } from '@/types'

const FREQ_LABELS: Record<string, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
}


function daysUntil(dateStr: string) {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000)
}

function nextDueFrom(startDate: string, frequency: RecurringFrequency): string {
  const d = new Date(startDate)
  const now = new Date()
  if (d >= now) return startDate
  while (d < now) {
    if (frequency === 'daily') d.setDate(d.getDate() + 1)
    else if (frequency === 'weekly') d.setDate(d.getDate() + 7)
    else if (frequency === 'monthly') d.setMonth(d.getMonth() + 1)
    else d.setFullYear(d.getFullYear() + 1)
  }
  return d.toISOString().slice(0, 10)
}

const emptyAddForm = () => ({
  description: '',
  amount: '',
  type: 'expense' as 'expense' | 'income',
  frequency: 'monthly' as RecurringFrequency,
  category: '',
  walletId: '',
  startDate: new Date().toISOString().slice(0, 10),
  logFirstPayment: true,
})

type ExpenseFilter = 'all' | 'active' | 'paused' | 'due-soon'

export function Subscriptions() {
  const money = useMoney()
  const { data: rules = [] } = useRecurringRules()
  const { data: transactions = [] } = useTransactions()
  const { data: wallets = [] } = useWallets()
  const { data: categories = [] } = useBudgetCategories()
  const addRule = useAddRecurringRule()
  const addTransaction = useAddTransaction()
  const updateRule = useUpdateRecurringRule()
  const deleteRule = useDeleteRecurringRule()
  const [deleteTarget, setDeleteTarget] = useState<RecurringRule | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [addForm, setAddForm] = useState(emptyAddForm())
  const [editTarget, setEditTarget] = useState<RecurringRule | null>(null)
  const [editForm, setEditForm] = useState(emptyAddForm())
  const [expenseFilter, setExpenseFilter] = useState<ExpenseFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const expenses = useMemo(
    () => rules.filter(r => r.type !== 'income').sort((a, b) => {
      if (a.active !== b.active) return b.active ? 1 : -1
      return a.next_due_date.localeCompare(b.next_due_date)
    }),
    [rules]
  )
  const income = useMemo(
    () => rules.filter(r => r.type === 'income').sort((a, b) => a.next_due_date.localeCompare(b.next_due_date)),
    [rules]
  )

  const monthlyExpenses = useMemo(
    () => expenses.filter(r => r.active).reduce((sum, r) => sum + r.amount * (FREQ_MONTHS[r.frequency] ?? 1), 0),
    [expenses]
  )
  const monthlyIncome = useMemo(
    () => income.filter(r => r.active).reduce((sum, r) => sum + r.amount * (FREQ_MONTHS[r.frequency] ?? 1), 0),
    [income]
  )

  const nextRenewal = useMemo(() => {
    const upcoming = expenses.filter(r => r.active).sort((a, b) => a.next_due_date.localeCompare(b.next_due_date))
    return upcoming[0] ?? null
  }, [expenses])

  const filteredExpenses = useMemo(() => {
    let list = expenses
    if (expenseFilter === 'active') list = list.filter(r => r.active)
    else if (expenseFilter === 'paused') list = list.filter(r => !r.active)
    else if (expenseFilter === 'due-soon') list = list.filter(r => r.active && daysUntil(r.next_due_date) <= 3)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(r => r.description.toLowerCase().includes(q) || r.category.toLowerCase().includes(q))
    }
    return list
  }, [expenses, expenseFilter, searchQuery])

  const lastPaidDate = (rule: RecurringRule) => {
    const related = transactions
      .filter(t => t.recurring_rule_id === rule.id)
      .sort((a, b) => b.date.localeCompare(a.date))
    return related[0]?.date ?? null
  }

  const togglePause = async (rule: RecurringRule) => {
    try {
      await updateRule.mutateAsync({ id: rule.id, active: !rule.active })
      toast.success(rule.active ? 'Subscription paused' : 'Subscription resumed')
    } catch {
      toast.error('Failed to update subscription')
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteRule.mutateAsync(deleteTarget.id)
      toast.success('Subscription deleted')
      setDeleteTarget(null)
    } catch {
      toast.error('Failed to delete subscription')
    }
  }

  const setField = <K extends keyof ReturnType<typeof emptyAddForm>>(key: K, value: ReturnType<typeof emptyAddForm>[K]) => {
    setAddForm(f => ({ ...f, [key]: value }))
  }

  const setEditField = <K extends keyof ReturnType<typeof emptyAddForm>>(key: K, value: ReturnType<typeof emptyAddForm>[K]) => {
    setEditForm(f => ({ ...f, [key]: value }))
  }

  const openEdit = (rule: RecurringRule) => {
    setEditTarget(rule)
    setEditForm({
      description: rule.description,
      amount: String(rule.original_amount ?? rule.amount),
      type: rule.type as 'expense' | 'income',
      frequency: rule.frequency,
      category: rule.category,
      walletId: rule.wallet_id ?? '',
      startDate: rule.next_due_date,
      logFirstPayment: false,
    })
  }

  const handleEdit = async () => {
    if (!editTarget) return
    const amount = parseNumberInput(editForm.amount)
    if (!editForm.description.trim() || amount <= 0) {
      toast.error('Description and amount are required')
      return
    }
    const category = editForm.category || (editForm.type === 'income' ? 'Income' : 'Subscriptions')
    try {
      await updateRule.mutateAsync({
        id: editTarget.id,
        description: editForm.description.trim(),
        amount: money.toBase(amount, money.displayCurrency),
        original_amount: amount,
        original_currency: money.displayCurrency,
        type: editForm.type,
        category,
        wallet_id: editForm.walletId || null,
        frequency: editForm.frequency,
        next_due_date: nextDueFrom(editForm.startDate, editForm.frequency),
      })
      toast.success('Subscription updated')
      setEditTarget(null)
    } catch {
      toast.error('Failed to update subscription')
    }
  }

  const handleAdd = async () => {
    const amount = parseNumberInput(addForm.amount)
    if (!addForm.description.trim() || amount <= 0) {
      toast.error('Description and amount are required')
      return
    }
    const startDate = addForm.startDate || new Date().toISOString().slice(0, 10)
    const category = addForm.category || (addForm.type === 'income' ? 'Income' : 'Subscriptions')
    try {
      const rule = await addRule.mutateAsync({
        user_id: null,
        description: addForm.description.trim(),
        amount: money.toBase(amount, money.displayCurrency),
        original_amount: amount,
        original_currency: money.displayCurrency,
        type: addForm.type,
        category,
        wallet_id: addForm.walletId || null,
        transfer_wallet_id: null,
        start_date: startDate,
        next_due_date: nextDueFrom(startDate, addForm.frequency),
        frequency: addForm.frequency,
        end_date: null,
        installment_total: null,
        installment_paid: 0,
        active: true,
      })
      if (addForm.logFirstPayment) {
        await addTransaction.mutateAsync({
          user_id: null,
          description: addForm.description.trim(),
          amount: money.toBase(amount, money.displayCurrency),
          original_amount: amount,
          original_currency: money.displayCurrency,
          type: addForm.type,
          category,
          wallet_id: addForm.walletId || null,
          transfer_wallet_id: null,
          recurring_rule_id: rule?.id ?? null,
          recurring_due_date: startDate,
          date: startDate,
          needs_review: false,
        })
        toast.success('Subscription added and first payment recorded')
      } else {
        toast.success('Subscription added')
      }
      setAddForm(emptyAddForm())
      setShowAddForm(false)
    } catch {
      toast.error('Failed to add subscription')
    }
  }

  const RuleCard = ({ rule }: { rule: RecurringRule }) => {
    const days = daysUntil(rule.next_due_date)
    const lastPaid = lastPaidDate(rule)
    const walletName = rule.wallet_id ? wallets.find(w => w.id === rule.wallet_id)?.name : null
    const daysSinceLastPaid = lastPaid
      ? Math.floor((Date.now() - new Date(lastPaid).getTime()) / 86_400_000)
      : null
    const isUnused = rule.active && rule.type !== 'income' && (daysSinceLastPaid === null ? false : daysSinceLastPaid > 60)
    const hasNeverPaid = rule.active && rule.type !== 'income' && !lastPaid
    return (
      <div className={`rounded-2xl border border-border bg-secondary p-4 transition-opacity ${rule.active ? '' : 'opacity-60'}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate font-extrabold text-foreground">{rule.description}</p>
              {!rule.active && (
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground">Paused</span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {rule.category} · {FREQ_LABELS[rule.frequency]}{walletName ? ` · ${walletName}` : ''}
              {rule.frequency !== 'monthly' && (
                <span className="ml-1 text-muted-foreground/70">
                  · ≈ {money.formatDisplay(Math.round(getMonthlyImpact(rule.original_amount ?? rule.amount, rule.frequency)))}/mo · {money.formatDisplay(Math.round(getYearlyImpact(rule.original_amount ?? rule.amount, rule.frequency)))}/yr
                </span>
              )}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className={`font-extrabold ${txAmountColor(rule.original_amount ?? rule.amount, rule.type)}`}>
              {txAmountSign(rule.original_amount ?? rule.amount, rule.type)}{money.format(rule.original_amount ?? rule.amount, rule.original_currency ?? money.baseCurrency)}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{FREQ_LABELS[rule.frequency].toLowerCase()}</p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
          {rule.active ? (
            <span className={`font-bold ${days <= 0 ? 'text-[#FF8388]' : days <= 3 ? 'text-[#FFCF73]' : 'text-foreground'}`}>
              Next: {rule.next_due_date} {days === 0 ? '(today)' : days > 0 ? `(${days}d)` : '(overdue)'}
            </span>
          ) : (
            <span>Paused since {rule.next_due_date}</span>
          )}
          {lastPaid && <span>Last paid: {lastPaid}</span>}
          {rule.installment_total && (
            <span>{rule.installment_paid} / {rule.installment_total} installments</span>
          )}
        </div>

        {(isUnused || hasNeverPaid) && (
          <div className="mt-2 flex items-center gap-1.5 rounded-xl bg-[#FFCF73]/10 px-3 py-1.5">
            <span className="text-xs font-bold text-[#FFCF73]">
              {hasNeverPaid ? '⚠ No payments recorded' : `⚠ No activity for ${daysSinceLastPaid}d — still needed?`}
            </span>
          </div>
        )}

        <div className="mt-3 flex gap-2">
          <button
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-colors ${
              rule.active
                ? 'bg-muted text-muted-foreground hover:text-foreground'
                : 'bg-primary/10 text-primary hover:bg-primary/20'
            }`}
            onClick={() => togglePause(rule)}
            disabled={updateRule.isPending}
          >
            {rule.active ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            {rule.active ? 'Pause' : 'Resume'}
          </button>
          <button
            className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
            onClick={() => editTarget?.id === rule.id ? setEditTarget(null) : openEdit(rule)}
            disabled={updateRule.isPending}
          >
            <Pencil className="h-3 w-3" />
            Edit
          </button>
          <button
            className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold text-muted-foreground transition-colors hover:bg-secondary hover:text-[#FF8388] disabled:opacity-40"
            onClick={() => setDeleteTarget(rule)}
            disabled={deleteRule.isPending}
          >
            <Trash2 className="h-3 w-3" />
            Delete
          </button>
        </div>

        {editTarget?.id === rule.id && (
          <div className="mt-4 space-y-3 rounded-2xl border border-border bg-background p-4">
            <p className="text-xs font-bold text-muted-foreground">Edit subscription</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs text-muted-foreground">Name</Label>
                <Input className="mt-1.5 bg-secondary text-sm" value={editForm.description} onChange={e => setEditField('description', e.target.value)} />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Amount ({money.displayCurrency})</Label>
                <MoneyInput className="mt-1.5 bg-secondary text-sm" value={editForm.amount} onValueChange={v => setEditField('amount', v)} />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Type</Label>
                <select className="mt-1.5 h-10 w-full rounded-md border border-input bg-secondary px-3 text-sm font-bold text-foreground outline-none" value={editForm.type} onChange={e => setEditField('type', e.target.value as 'expense' | 'income')}>
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                </select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Frequency</Label>
                <select className="mt-1.5 h-10 w-full rounded-md border border-input bg-secondary px-3 text-sm font-bold text-foreground outline-none" value={editForm.frequency} onChange={e => setEditField('frequency', e.target.value as RecurringFrequency)}>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Category</Label>
                <select className="mt-1.5 h-10 w-full rounded-md border border-input bg-secondary px-3 text-sm font-bold text-foreground outline-none" value={editForm.category} onChange={e => setEditField('category', e.target.value)}>
                  <option value="">— auto —</option>
                  {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Wallet</Label>
                <select className="mt-1.5 h-10 w-full rounded-md border border-input bg-secondary px-3 text-sm font-bold text-foreground outline-none" value={editForm.walletId} onChange={e => setEditField('walletId', e.target.value)}>
                  <option value="">— none —</option>
                  {wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleEdit} disabled={updateRule.isPending}>
                {updateRule.isPending ? 'Saving…' : 'Save changes'}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setEditTarget(null)}>Cancel</Button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Subscriptions"
        subtitle="Monitor recurring payments and income streams, pause or cancel unwanted subscriptions."
        action={
          !showAddForm ? (
            <Button className="gap-2" onClick={() => setShowAddForm(true)}>
              <Plus className="h-4 w-4" /> Add subscription
            </Button>
          ) : undefined
        }
      />

      {showAddForm && (
        <Card className="mb-8">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl">New subscription</CardTitle>
              <button
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                onClick={() => { setShowAddForm(false); setAddForm(emptyAddForm()) }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 px-5 pb-6 sm:px-8">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label className="text-xs text-muted-foreground">Name *</Label>
                <Input
                  className="mt-2 bg-secondary"
                  value={addForm.description}
                  onChange={e => setField('description', e.target.value)}
                  placeholder="Netflix, Salary, Rent…"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Amount ({money.displayCurrency}) *</Label>
                <MoneyInput
                  className="mt-2 bg-secondary"
                  value={addForm.amount}
                  onValueChange={v => setField('amount', v)}
                  placeholder="0"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Type</Label>
                <select
                  className="mt-2 h-10 w-full rounded-md border border-input bg-secondary px-3 text-sm font-bold text-foreground outline-none"
                  value={addForm.type}
                  onChange={e => setField('type', e.target.value as 'expense' | 'income')}
                >
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                </select>
                {addForm.type === 'income' && (
                  <p className="mt-1.5 text-xs text-muted-foreground">e.g. rent received, salary retainer, freelance contract, dividends</p>
                )}
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Frequency</Label>
                <select
                  className="mt-2 h-10 w-full rounded-md border border-input bg-secondary px-3 text-sm font-bold text-foreground outline-none"
                  value={addForm.frequency}
                  onChange={e => setField('frequency', e.target.value as RecurringFrequency)}
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Category</Label>
                <select
                  className="mt-2 h-10 w-full rounded-md border border-input bg-secondary px-3 text-sm font-bold text-foreground outline-none"
                  value={addForm.category}
                  onChange={e => setField('category', e.target.value)}
                >
                  <option value="">— auto —</option>
                  {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Wallet</Label>
                <select
                  className="mt-2 h-10 w-full rounded-md border border-input bg-secondary px-3 text-sm font-bold text-foreground outline-none"
                  value={addForm.walletId}
                  onChange={e => setField('walletId', e.target.value)}
                >
                  <option value="">— none —</option>
                  {wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Start date</Label>
                <Input
                  type="date"
                  className="mt-2 bg-secondary"
                  value={addForm.startDate}
                  onChange={e => setField('startDate', e.target.value)}
                />
              </div>
            </div>
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input accent-primary"
                checked={addForm.logFirstPayment}
                onChange={e => setField('logFirstPayment', e.target.checked)}
              />
              <span className="text-sm font-bold text-foreground">
                Log first {addForm.type === 'income' ? 'payment received' : 'payment'} on {addForm.startDate || 'start date'}
              </span>
            </label>
            <div className="flex gap-3">
              <Button onClick={handleAdd} disabled={addRule.isPending || addTransaction.isPending}>
                {(addRule.isPending || addTransaction.isPending) ? 'Adding…' : 'Add subscription'}
              </Button>
              <Button variant="secondary" onClick={() => { setShowAddForm(false); setAddForm(emptyAddForm()) }}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
        <StatCard label="Monthly cost" value={money.formatDisplay(monthlyExpenses)} sub={`≈ ${money.formatDisplay(monthlyExpenses * 12)}/year`} badgeVariant="warning" />
        <StatCard label="Monthly income" value={money.formatDisplay(monthlyIncome)} sub={`${income.filter(r => r.active).length} active`} badgeVariant="success" />
        <StatCard label="Net monthly" value={money.formatDisplay(monthlyIncome - monthlyExpenses)} sub="Income minus expenses" />
        <StatCard
          label="Next renewal"
          value={nextRenewal ? nextRenewal.description : 'None'}
          sub={nextRenewal ? `${nextRenewal.next_due_date} · ${money.formatDisplay(nextRenewal.amount)}` : 'No active subscriptions'}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-xl">Expenses</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">{money.formatDisplay(monthlyExpenses)}/month across {expenses.length} rules</p>
            </div>
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-3 px-5 pb-6 sm:px-8">
            {expenses.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-1.5">
                  {(['all', 'active', 'paused', 'due-soon'] as ExpenseFilter[]).map(f => (
                    <button
                      key={f}
                      onClick={() => setExpenseFilter(f)}
                      className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${expenseFilter === f ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}
                    >
                      {f === 'due-soon' ? 'Due Soon' : f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                  ))}
                </div>
                <input
                  aria-label="Search subscriptions"
                  className="h-9 w-full rounded-xl border border-border bg-secondary px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
                  placeholder="Search by name or category…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
            )}
            {filteredExpenses.length > 0 ? (
              filteredExpenses.map(rule => <RuleCard key={rule.id} rule={rule} />)
            ) : expenses.length > 0 ? (
              <p className="rounded-2xl border border-border bg-secondary p-4 text-sm text-muted-foreground">No subscriptions match this filter.</p>
            ) : (
              <div className="rounded-2xl border border-border bg-secondary p-6 text-center">
                <p className="text-sm text-muted-foreground">No recurring expenses yet.</p>
                <Button size="sm" variant="secondary" className="mt-3 gap-2" onClick={() => setShowAddForm(true)}>
                  <Plus className="h-3.5 w-3.5" /> Add one
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-xl">Income streams</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">{money.formatDisplay(monthlyIncome)}/month across {income.length} rules</p>
            </div>
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-3 px-5 pb-6 sm:px-8">
            {income.length > 0 ? (
              income.map(rule => <RuleCard key={rule.id} rule={rule} />)
            ) : (
              <div className="rounded-2xl border border-border bg-secondary p-6 text-center">
                <p className="text-sm text-muted-foreground">No recurring income yet.</p>
                <Button size="sm" variant="secondary" className="mt-3 gap-2" onClick={() => setShowAddForm(true)}>
                  <Plus className="h-3.5 w-3.5" /> Add one
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={deleteTarget ? `Delete "${deleteTarget.description}"?` : ''}
        description="This removes the recurring rule. Past transactions are kept."
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  )
}
