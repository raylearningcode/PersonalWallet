import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  useBudgetCategories,
  useTransactions,
  useUpdateBudgetCategory,
  useAddBudgetCategory,
  useDeleteBudgetCategory,
} from '@/lib/queries'
import { Lightbulb } from 'lucide-react'
import { StatCard } from '@/components/shared/StatCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { getOverspendRisk, getCategoryUsedPct, isInBudgetPeriod } from '@/lib/budget'
import { useMoney } from '@/lib/currency'
import { formatNumberInput, parseNumberInput } from '@/lib/numberInput'
import { toast } from 'sonner'
import { Check, Pencil, Trash2, X } from 'lucide-react'
import type { BudgetPeriod, RiskLevel } from '@/lib/budget'
import { Skeleton } from '@/components/ui/skeleton'
import { getDaysRemainingInMonth } from '@/lib/financeOs'

const riskVariant: Record<RiskLevel, 'success' | 'warning' | 'danger'> = {
  Low: 'success', Medium: 'warning', High: 'danger',
}

function getBarColor(pct: number, catColor: string): string {
  if (pct >= 90) return '#ef4444'
  if (pct >= 70) return '#f59e0b'
  return catColor
}

function ColorBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-3 overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full transition-all duration-300"
        style={{ width: `${Math.min(100, value)}%`, background: color }}
      />
    </div>
  )
}

export function Budget() {
  const money = useMoney()
  const fmt = money.formatDisplay
  const { data: categories = [], isPending: catPending } = useBudgetCategories()
  const { data: transactions = [] } = useTransactions()
  const updateCategory = useUpdateBudgetCategory()
  const addCategory = useAddBudgetCategory()
  const deleteCategory = useDeleteBudgetCategory()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<{ yearly_allocated: number; budget_period: BudgetPeriod; color: string }>({
    yearly_allocated: 0,
    budget_period: 'monthly',
    color: '#6c63ff',
  })

  const [showAdd, setShowAdd] = useState(false)
  const [addName, setAddName] = useState('')
  const [addAmount, setAddAmount] = useState('')
  const [addPeriod, setAddPeriod] = useState<BudgetPeriod>('monthly')
  const [addColor, setAddColor] = useState('#6c63ff')

  const [deleteTarget, setDeleteTarget] = useState<null | { id: string; name: string }>(null)

  const currentYear = String(new Date().getFullYear())
  const now = new Date()
  const daysLeft = getDaysRemainingInMonth()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const monthPct = Math.round((now.getDate() / daysInMonth) * 100)
  const expenseTransactions = transactions.filter(
    t => t.type !== 'income' && t.type !== 'transfer' && t.date.startsWith(currentYear)
  )

  const categoriesWithSpent = useMemo(() =>
    categories.map(cat => ({
      ...cat,
      budget_period: cat.budget_period ?? 'yearly',
      spent: expenseTransactions
        .filter(t => t.category === cat.name && isInBudgetPeriod(t.date, cat.budget_period ?? 'yearly'))
        .reduce((s, t) => s + t.amount, 0),
    })),
    [categories, expenseTransactions]
  )

  const monthsElapsed = now.getMonth() + 1
  // Normalize all categories to a monthly equivalent so monthly and yearly budgets can be summed fairly
  const totalAllocated = useMemo(() => categoriesWithSpent.reduce((s, c) => {
    return s + (c.budget_period === 'yearly' ? c.yearly_allocated / 12 : c.yearly_allocated)
  }, 0), [categoriesWithSpent])
  const totalSpent = useMemo(() => categoriesWithSpent.reduce((s, c) => {
    return s + (c.budget_period === 'yearly' ? c.spent / Math.max(1, monthsElapsed) : c.spent)
  }, 0), [categoriesWithSpent, monthsElapsed])
  const remaining = totalAllocated - totalSpent

  const daysElapsed = now.getDate()
  const forecasts = useMemo(() => categoriesWithSpent
    .filter(cat => cat.budget_period === 'monthly' && cat.yearly_allocated > 0 && cat.spent > 0 && daysElapsed > 0)
    .map(cat => {
      const dailyRate = cat.spent / daysElapsed
      const projectedMonthEnd = Math.round(dailyRate * daysInMonth)
      const overspend = projectedMonthEnd - cat.yearly_allocated
      return { ...cat, projectedMonthEnd, overspend, dailyRate }
    })
    .filter(f => f.overspend > 0)
    .sort((a, b) => b.overspend - a.overspend),
    [categoriesWithSpent, daysElapsed, daysInMonth]
  )
  const risk = totalAllocated > 0 ? getOverspendRisk(remaining, totalAllocated) : 'Low'
  const hasData = categories.length > 0

  const [showSuggestions, setShowSuggestions] = useState(false)

  const spendingSuggestions = useMemo(() => {
    const now = new Date()
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1)
    const recentExpenses = transactions.filter(t => {
      if (t.type === 'income' || t.type === 'transfer') return false
      const d = new Date(t.date)
      return d >= threeMonthsAgo
    })
    const catMap: Record<string, number[]> = {}
    recentExpenses.forEach(t => {
      if (!catMap[t.category]) catMap[t.category] = []
      catMap[t.category].push(t.amount)
    })
    const existingNames = new Set(categories.map(c => c.name.toLowerCase()))
    return Object.entries(catMap)
      .map(([name, amounts]) => ({
        name,
        monthlyAvg: Math.round(amounts.reduce((s, a) => s + a, 0) / 3),
        txCount: amounts.length,
      }))
      .filter(s => !existingNames.has(s.name.toLowerCase()) && s.monthlyAvg > 0)
      .sort((a, b) => b.monthlyAvg - a.monthlyAvg)
      .slice(0, 6)
  }, [transactions, categories])

  const startEdit = (id: string, yearly_allocated: number, budget_period: BudgetPeriod, color: string) => {
    setEditingId(id)
    setEditDraft({ yearly_allocated: Number(money.fromBase(yearly_allocated, money.displayCurrency).toFixed(2)), budget_period, color })
  }

  const cancelEdit = () => setEditingId(null)

  const saveEdit = async () => {
    if (!editingId) return
    if (editDraft.yearly_allocated < 0) {
      toast.error('Budget must be zero or greater')
      return
    }
    const id = editingId
    setEditingId(null) // optimistic close — no double-click needed
    try {
      await updateCategory.mutateAsync({
        id,
        ...editDraft,
        yearly_allocated: money.toBase(editDraft.yearly_allocated, money.displayCurrency),
      })
      toast.success('Category updated')
    } catch {
      setEditingId(id) // reopen on failure
      toast.error('Failed to update category')
    }
  }

  const handleAdd = async () => {
    const amount = parseNumberInput(addAmount)
    if (!addName.trim() || !Number.isFinite(amount) || amount < 0) return
    try {
      await addCategory.mutateAsync({ name: addName.trim(), yearly_allocated: money.toBase(amount, money.displayCurrency), budget_period: addPeriod, color: addColor })
      setAddName('')
      setAddAmount('')
      setAddPeriod('monthly')
      setAddColor('#6c63ff')
      setShowAdd(false)
      toast.success('Category added')
    } catch {
      toast.error('Failed to add category')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteCategory.mutateAsync(id)
      toast.success('Category removed')
    } catch {
      toast.error('Failed to remove category')
    }
  }

  const handleApplySuggestion = async (name: string, monthlyAvg: number) => {
    try {
      await addCategory.mutateAsync({
        name,
        yearly_allocated: money.toBase(money.fromBase(monthlyAvg, money.displayCurrency), money.displayCurrency),
        budget_period: 'monthly',
        color: '#6c63ff',
      })
      toast.success(`${name} budget created`)
    } catch {
      toast.error('Failed to create budget')
    }
  }

  const confirmDeleteSelected = async () => {
    if (!deleteTarget) return
    await handleDelete(deleteTarget.id)
    setDeleteTarget(null)
  }

  const activeBudgets = useMemo(() =>
    categoriesWithSpent
      .filter(c => c.yearly_allocated > 0)
      .sort((a, b) => {
        const pctA = getCategoryUsedPct(a.spent, a.yearly_allocated)
        const pctB = getCategoryUsedPct(b.spent, b.yearly_allocated)
        return pctB - pctA
      }),
    [categoriesWithSpent]
  )
  const noBudget = categoriesWithSpent.filter(c => c.yearly_allocated === 0)

  // Overspend risk explanation
  const closestToCap = useMemo(() => {
    if (activeBudgets.length === 0) return null
    return activeBudgets.reduce((top, c) => {
      const pct = getCategoryUsedPct(c.spent, c.yearly_allocated)
      const topPct = getCategoryUsedPct(top.spent, top.yearly_allocated)
      return pct > topPct ? c : top
    }, activeBudgets[0])
  }, [activeBudgets])

  const closestPct = closestToCap ? getCategoryUsedPct(closestToCap.spent, closestToCap.yearly_allocated) : 0

  return (
    <div>
      <PageHeader
        title="Budget"
        subtitle={<><span className="hidden sm:inline">Choose monthly or yearly limits, then track usage in the period that matters.</span><span className="sm:hidden">See where your money goes.</span></>}
        action={
          !showAdd ? (
            <Button size="sm" className="gap-2" onClick={() => setShowAdd(true)}>
              + Add category
            </Button>
          ) : undefined
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-3 lg:gap-6">
        <StatCard label="Monthly budget" value={fmt(totalAllocated)} sub={money.baseCurrency !== money.displayCurrency ? money.formatBase(totalAllocated) : 'Blended monthly equivalent'} />
        <StatCard label="Remaining" value={fmt(hasData ? remaining : 0)} sub={money.baseCurrency !== money.displayCurrency ? money.formatBase(hasData ? remaining : 0) : 'Safe inside active periods'} badgeVariant="success" />
        <StatCard label="Overspend risk" value={hasData ? risk : 'None'} sub={hasData ? 'Based on current period spending' : 'No categories yet'} badgeVariant={hasData ? riskVariant[risk] : undefined} />
      </div>

      {hasData && (
        <div className="mb-8 rounded-2xl border border-border bg-secondary px-5 py-4">
          <p className="text-xs font-bold text-muted-foreground">Overspend risk explanation</p>
          <p className="mt-1 text-sm text-foreground">
            {closestToCap && closestPct >= 70
              ? `${closestToCap.name} is your closest category at ${closestPct}%. Monitor it closely.`
              : closestToCap
              ? `${closestToCap.name} is your closest category at ${closestPct}%. At your current pace, you are unlikely to exceed any category this month.`
              : 'At your current pace, you are unlikely to exceed any category this month.'}
          </p>
        </div>
      )}

      {forecasts.length > 0 && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-xl">Month forecast</CardTitle>
            <p className="text-sm text-muted-foreground">
              Based on your current daily spend rate ({monthPct}% of month elapsed).
            </p>
          </CardHeader>
          <CardContent className="space-y-3 px-5 pb-6 sm:px-8">
            {forecasts.map(f => (
              <div key={f.id} className="flex items-start justify-between gap-4 rounded-2xl border border-[#FF8388]/20 bg-[#FF8388]/5 p-4">
                <div>
                  <p className="font-extrabold text-foreground">{f.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Current: {fmt(f.spent)} · Forecast: {fmt(f.projectedMonthEnd)} · Budget: {fmt(f.yearly_allocated)}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-[#FF8388]/20 px-3 py-1 text-xs font-extrabold text-[#FF8388]">
                  +{fmt(f.overspend)} over
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-xl">Category allocation</CardTitle></CardHeader>
        <CardContent className="space-y-4 px-5 pb-6 sm:px-8 sm:pb-8">
            {catPending ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                  <Skeleton className="h-2 w-full" />
                </div>
              ))
            ) : categoriesWithSpent.length > 0 ? (
              <>
                {activeBudgets.length > 0 && (
                  <div className="space-y-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Active budgets</p>
                    {activeBudgets.map(cat => {
                      const pct = getCategoryUsedPct(cat.spent, cat.yearly_allocated)
                      const barColor = getBarColor(pct, cat.color)
                      const isEditing = editingId === cat.id
                      const catDailyAllowance = cat.yearly_allocated > cat.spent && daysLeft > 0
                        ? (cat.yearly_allocated - cat.spent) / daysLeft
                        : null
                      const overPace = pct > monthPct

                      if (isEditing) {
                        return (
                          <div key={cat.id} className="space-y-3 rounded-xl border border-primary/30 bg-card p-4">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-foreground">{cat.name}</span>
                              <div className="flex gap-2">
                                <Button size="sm" className="h-7 px-3 text-xs" onClick={saveEdit} disabled={updateCategory.isPending}>
                                  <Check className="mr-1 h-3.5 w-3.5" />
                                  Save
                                </Button>
                                <Button size="sm" variant="secondary" className="h-7 px-3 text-xs" onClick={cancelEdit} aria-label="Cancel edit">
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                            <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                              <div>
                                <p className="mb-1 text-xs text-muted-foreground">Budget amount ({money.displayCurrency})</p>
                                <Input
                                  aria-label="Budget amount"
                                  inputMode="decimal"
                                  className="h-8 bg-secondary text-sm font-bold"
                                  value={formatNumberInput(editDraft.yearly_allocated)}
                                  onChange={e => setEditDraft(d => ({ ...d, yearly_allocated: parseNumberInput(e.target.value) }))}
                                />
                              </div>
                              <div>
                                <p className="mb-1 text-xs text-muted-foreground">Period</p>
                                <select
                                  aria-label="Budget period"
                                  className="h-8 rounded-md border border-input bg-secondary px-3 text-sm font-bold text-foreground outline-none"
                                  value={editDraft.budget_period}
                                  onChange={e => setEditDraft(d => ({ ...d, budget_period: e.target.value as BudgetPeriod }))}
                                >
                                  <option value="monthly">Monthly</option>
                                  <option value="yearly">Yearly</option>
                                </select>
                              </div>
                              <div>
                                <p className="mb-1 text-xs text-muted-foreground">Color</p>
                                <div className="flex items-center gap-2">
                                  <div className="h-8 w-8 shrink-0 rounded-full border border-border" style={{ backgroundColor: editDraft.color }} />
                                  <input
                                    type="color"
                                    aria-label="Category color"
                                    className="h-8 w-8 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
                                    value={editDraft.color}
                                    onChange={e => setEditDraft(d => ({ ...d, color: e.target.value }))}
                                  />
                                </div>
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Spent this {editDraft.budget_period}: {fmt(cat.spent)}
                            </p>
                          </div>
                        )
                      }

                      return (
                        <div key={cat.id}>
                          <div className="mb-2 flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                            <span className="font-bold text-foreground">{cat.name}</span>
                            <div className="flex flex-wrap items-center gap-3">
                              <span className="text-xs text-muted-foreground">
                                {fmt(cat.spent)} of {fmt(cat.yearly_allocated)} {cat.budget_period}
                              </span>
                              <span className={`text-xs font-bold ${pct >= 90 ? 'text-red-400' : pct >= 70 ? 'text-amber-400' : 'text-muted-foreground'}`}>
                                {pct}%
                              </span>
                              <button
                                onClick={() => startEdit(cat.id, cat.yearly_allocated, cat.budget_period, cat.color)}
                                className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-xs text-muted-foreground hover:text-foreground"
                                aria-label={`Edit ${cat.name}`}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => setDeleteTarget({ id: cat.id, name: cat.name })}
                                disabled={deleteCategory.isPending}
                                className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-xs text-destructive hover:text-red-300 disabled:opacity-50"
                                aria-label={`Delete ${cat.name}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                          <ColorBar value={pct} color={barColor} />
                          <p className="mt-1 text-xs text-muted-foreground">
                            {pct}% used · {daysLeft === 0 ? 'Month ends today' : `${monthPct}% of month passed`} · {overPace ? '⚡ Over pace' : '✓ On track'}
                            {catDailyAllowance !== null && daysLeft > 0 && (
                              <span className="ml-2 text-primary">· {fmt(catDailyAllowance)}/day left</span>
                            )}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                )}
                {noBudget.length > 0 && (
                  <div className="space-y-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">No budget set</p>
                    {noBudget.map(cat => {
                      const isEditing = editingId === cat.id

                      if (isEditing) {
                        return (
                          <div key={cat.id} className="space-y-3 rounded-xl border border-primary/30 bg-card p-4">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-foreground">{cat.name}</span>
                              <div className="flex gap-2">
                                <Button size="sm" className="h-7 px-3 text-xs" onClick={saveEdit} disabled={updateCategory.isPending}>
                                  <Check className="mr-1 h-3.5 w-3.5" />
                                  Save
                                </Button>
                                <Button size="sm" variant="secondary" className="h-7 px-3 text-xs" onClick={cancelEdit} aria-label="Cancel edit">
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                            <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                              <div>
                                <p className="mb-1 text-xs text-muted-foreground">Budget amount ({money.displayCurrency})</p>
                                <Input
                                  aria-label="Budget amount"
                                  inputMode="decimal"
                                  className="h-8 bg-secondary text-sm font-bold"
                                  value={formatNumberInput(editDraft.yearly_allocated)}
                                  onChange={e => setEditDraft(d => ({ ...d, yearly_allocated: parseNumberInput(e.target.value) }))}
                                />
                              </div>
                              <div>
                                <p className="mb-1 text-xs text-muted-foreground">Period</p>
                                <select
                                  aria-label="Budget period"
                                  className="h-8 rounded-md border border-input bg-secondary px-3 text-sm font-bold text-foreground outline-none"
                                  value={editDraft.budget_period}
                                  onChange={e => setEditDraft(d => ({ ...d, budget_period: e.target.value as BudgetPeriod }))}
                                >
                                  <option value="monthly">Monthly</option>
                                  <option value="yearly">Yearly</option>
                                </select>
                              </div>
                              <div>
                                <p className="mb-1 text-xs text-muted-foreground">Color</p>
                                <div className="flex items-center gap-2">
                                  <div className="h-8 w-8 shrink-0 rounded-full border border-border" style={{ backgroundColor: editDraft.color }} />
                                  <input
                                    type="color"
                                    aria-label="Category color"
                                    className="h-8 w-8 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
                                    value={editDraft.color}
                                    onChange={e => setEditDraft(d => ({ ...d, color: e.target.value }))}
                                  />
                                </div>
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Spent this {editDraft.budget_period}: {fmt(cat.spent)}
                            </p>
                          </div>
                        )
                      }

                      return (
                        <div key={cat.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary px-4 py-3">
                          <span className="font-bold text-foreground">{cat.name}</span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => startEdit(cat.id, cat.yearly_allocated, cat.budget_period, cat.color)}
                              className="flex h-8 w-8 items-center justify-center rounded-xl bg-muted text-xs text-muted-foreground hover:text-foreground"
                              aria-label={`Edit ${cat.name}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => setDeleteTarget({ id: cat.id, name: cat.name })}
                              disabled={deleteCategory.isPending}
                              className="flex h-8 w-8 items-center justify-center rounded-xl bg-muted text-xs text-destructive hover:text-red-300 disabled:opacity-50"
                              aria-label={`Delete ${cat.name}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                No budget categories yet.{' '}
                <Link to="/settings" className="font-bold text-primary hover:underline">
                  Add categories in Settings →
                </Link>
              </p>
            )}

            {spendingSuggestions.length > 0 && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2"
                  onClick={() => setShowSuggestions(v => !v)}
                >
                  <div className="flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-primary" />
                    <span className="text-sm font-extrabold text-primary">
                      {spendingSuggestions.length} budget{spendingSuggestions.length > 1 ? 's' : ''} suggested from history
                    </span>
                  </div>
                  <span className="text-xs font-bold text-primary">{showSuggestions ? 'Hide' : 'Show'}</span>
                </button>
                {showSuggestions && (
                  <div className="mt-3 flex flex-col gap-2">
                    {spendingSuggestions.map(s => (
                      <div key={s.name} className="flex items-center justify-between gap-3 rounded-lg bg-primary/10 px-3 py-2">
                        <div>
                          <p className="text-sm font-bold text-foreground">{s.name}</p>
                          <p className="text-xs text-muted-foreground">
                            avg {fmt(s.monthlyAvg)}/mo · {s.txCount} recent transactions
                          </p>
                        </div>
                        <Button
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => handleApplySuggestion(s.name, s.monthlyAvg)}
                          disabled={addCategory.isPending}
                        >
                          Add
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {showAdd ? (
              <div className="space-y-3 rounded-xl border border-border bg-card p-4">
                <p className="text-sm font-bold text-foreground">New category</p>
                <Input
                  aria-label="Category name"
                  className="h-8 bg-secondary text-sm"
                  placeholder="Category name"
                  value={addName}
                  onChange={e => setAddName(e.target.value)}
                />
                <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                  <Input
                    aria-label="Budget amount"
                    inputMode="decimal"
                    className="h-8 bg-secondary text-sm font-bold"
                    placeholder={`Budget amount (${money.displayCurrency})`}
                    value={addAmount}
                    onChange={e => setAddAmount(formatNumberInput(e.target.value))}
                  />
                  <select
                    aria-label="New category budget period"
                    className="h-8 rounded-md border border-input bg-secondary px-3 text-sm font-bold text-foreground outline-none"
                    value={addPeriod}
                    onChange={e => setAddPeriod(e.target.value as BudgetPeriod)}
                  >
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                  <div className="flex items-center gap-1.5">
                    <div className="h-8 w-8 shrink-0 rounded-full border border-border" style={{ backgroundColor: addColor }} />
                    <input
                      type="color"
                      aria-label="Category color"
                      className="h-8 w-8 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
                      value={addColor}
                      onChange={e => setAddColor(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button className="h-8 flex-1 text-xs" onClick={handleAdd} disabled={addCategory.isPending}>
                    Add category
                  </Button>
                  <Button variant="secondary" className="h-8 text-xs" onClick={() => setShowAdd(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowAdd(true)}
                className="w-full rounded-xl border border-dashed border-border py-3 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
              >
                + Add category
              </button>
            )}
        </CardContent>
      </Card>
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={deleteTarget ? `Delete ${deleteTarget.name}?` : ''}
        description="This removes the budget category. Existing transactions will keep their category text."
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDeleteSelected}
      />
    </div>
  )
}
