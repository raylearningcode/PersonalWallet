import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  useBudgetCategories,
  useTransactions,
  useUpdateBudgetCategory,
  useAddBudgetCategory,
  useDeleteBudgetCategory,
} from '@/lib/queries'
import { Lightbulb, ChevronRight } from 'lucide-react'
import { StatCard } from '@/components/shared/StatCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { getOverspendRisk, getCategoryUsedPct, isInBudgetPeriod } from '@/lib/budget'
import { useMoney } from '@/lib/currency'
import { formatNumberInput, parseNumberInput } from '@/lib/numberInput'
import { toast } from 'sonner'
import type { BudgetPeriod, RiskLevel } from '@/lib/budget'
import { Skeleton } from '@/components/ui/skeleton'
import { getDaysRemainingInMonth } from '@/lib/financeOs'

const riskVariant: Record<RiskLevel, 'success' | 'warning' | 'danger'> = {
  Low: 'success', Medium: 'warning', High: 'danger',
}

const PRESET_COLORS = [
  '#EF4444', '#F97316', '#EAB308', '#22C55E',
  '#14B8A6', '#3B82F6', '#8B5CF6', '#EC4899',
  '#64748B', '#A16207',
]

const CATEGORY_GROUPS: { label: string; keywords: string[] }[] = [
  { label: 'Food & Drink', keywords: ['food', 'drink', 'eat', 'lunch', 'dinner', 'breakfast', 'grocery', 'groceries', 'restaurant', 'cafe', 'coffee', 'meal', 'snack'] },
  { label: 'Transport', keywords: ['transport', 'transit', 'travel', 'car', 'fuel', 'gas', 'petrol', 'parking', 'taxi', 'uber', 'commute', 'bus', 'train', 'toll'] },
  { label: 'Home & Living', keywords: ['rent', 'home', 'housing', 'utilities', 'electric', 'electricity', 'water', 'internet', 'cleaning', 'furnish', 'maintenance', 'household'] },
  { label: 'Health', keywords: ['health', 'medical', 'doctor', 'pharmacy', 'gym', 'fitness', 'sport', 'wellness', 'dental', 'medicine'] },
  { label: 'Entertainment', keywords: ['entertainment', 'streaming', 'games', 'game', 'movie', 'music', 'netflix', 'spotify', 'hobby', 'fun', 'leisure', 'cinema'] },
  { label: 'Education', keywords: ['education', 'learning', 'course', 'book', 'school', 'tuition', 'study', 'training', 'subscription'] },
  { label: 'Shopping', keywords: ['shopping', 'clothes', 'clothing', 'fashion', 'beauty', 'cosmetic', 'gadget', 'phone', 'electronics'] },
]

function getCategoryGroup(name: string): string {
  const lower = name.toLowerCase()
  for (const { label, keywords } of CATEGORY_GROUPS) {
    if (keywords.some(k => lower.includes(k))) return label
  }
  return 'Other'
}

function groupCategories<T extends { name: string }>(cats: T[]): { group: string; items: T[] }[] {
  const map = new Map<string, T[]>()
  for (const cat of cats) {
    const g = getCategoryGroup(cat.name)
    if (!map.has(g)) map.set(g, [])
    map.get(g)!.push(cat)
  }
  return Array.from(map.entries()).map(([group, items]) => ({ group, items }))
}

function ColorSwatch({ color, selected, onClick }: { color: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${selected ? 'border-foreground ring-1 ring-foreground/30' : 'border-transparent'}`}
      style={{ backgroundColor: color }}
      onClick={onClick}
      title={color}
    />
  )
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

  type CatWithSpent = (typeof categoriesWithSpent)[0]
  const [sheetCat, setSheetCat] = useState<CatWithSpent | null>(null)
  const [sheetDraft, setSheetDraft] = useState<{ yearly_allocated: number; budget_period: BudgetPeriod; color: string }>({
    yearly_allocated: 0,
    budget_period: 'monthly',
    color: '#6c63ff',
  })

  const openSheet = (cat: CatWithSpent) => {
    setSheetCat(cat)
    setSheetDraft({
      yearly_allocated: Number(money.fromBase(cat.yearly_allocated, money.displayCurrency).toFixed(2)),
      budget_period: cat.budget_period,
      color: cat.color,
    })
  }

  const [showAdd, setShowAdd] = useState(false)
  const [addName, setAddName] = useState('')
  const [addAmount, setAddAmount] = useState('')
  const [addPeriod, setAddPeriod] = useState<BudgetPeriod>('monthly')
  const [addColor, setAddColor] = useState('#6c63ff')

  const [deleteTarget, setDeleteTarget] = useState<null | { id: string; name: string }>(null)

  const addFormRef = useRef<HTMLDivElement>(null)
  const addNameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (showAdd) {
      addFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      const timer = setTimeout(() => addNameInputRef.current?.focus(), 100)
      return () => clearTimeout(timer)
    }
  }, [showAdd])

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
  const [viewMode, setViewMode] = useState<'monthly' | 'daily' | 'remaining'>('monthly')

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

  const saveSheet = async () => {
    if (!sheetCat) return
    if (sheetDraft.yearly_allocated < 0) {
      toast.error('Budget must be zero or greater')
      return
    }
    const id = sheetCat.id
    setSheetCat(null)
    try {
      await updateCategory.mutateAsync({
        id,
        ...sheetDraft,
        yearly_allocated: money.toBase(sheetDraft.yearly_allocated, money.displayCurrency),
      })
      toast.success('Category updated')
    } catch {
      toast.error('Failed to update category')
    }
  }

  const handleAdd = async () => {
    const amount = parseNumberInput(addAmount)
    if (!addName.trim()) { toast.error('Enter a category name'); return }
    if (!Number.isFinite(amount) || amount < 0) return
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
        <StatCard label="Overspend risk" value={hasData ? risk : 'None'} sub={hasData && totalAllocated > 0 ? `${Math.round((totalSpent / totalAllocated) * 100)}% of budget used` : 'No categories yet'} badgeVariant={hasData ? riskVariant[risk] : undefined} />
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
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-xl">Category allocation</CardTitle>
            <div className="flex rounded-xl border border-border bg-secondary p-0.5 text-xs font-bold">
              {(['monthly', 'daily', 'remaining'] as const).map(mode => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setViewMode(mode)}
                  className={`rounded-lg px-3 py-1.5 transition-colors ${viewMode === mode ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {mode === 'monthly' ? 'Monthly' : mode === 'daily' ? 'Daily' : 'Remaining'}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
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
                    {(() => {
                      const grouped = groupCategories(activeBudgets)
                      const showGroups = grouped.length > 1
                      return grouped.map(({ group, items }) => (
                        <div key={group} className="space-y-4">
                          {showGroups && (
                            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground/60">{group}</p>
                          )}
                          {items.map(cat => {
                            const pct = getCategoryUsedPct(cat.spent, cat.yearly_allocated)
                            const barColor = getBarColor(pct, cat.color)
                            const catDailyAllowance = cat.yearly_allocated > cat.spent && daysLeft > 0
                              ? (cat.yearly_allocated - cat.spent) / daysLeft
                              : null
                            const overPace = pct > monthPct

                            return (
                              <button
                                key={cat.id}
                                type="button"
                                onClick={() => openSheet(cat)}
                                className="w-full rounded-xl border border-transparent p-2 text-left transition-colors hover:border-border hover:bg-secondary/50 active:scale-[0.995]"
                                aria-label={`Open ${cat.name} budget details`}
                              >
                                <div className="mb-2 flex items-center justify-between gap-2 text-sm">
                                  <div className="flex min-w-0 items-center gap-2">
                                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: cat.color }} />
                                    <span className="truncate font-bold text-foreground">{cat.name}</span>
                                  </div>
                                  <div className="flex shrink-0 items-center gap-2">
                                    <span className="text-xs text-muted-foreground">
                                      {fmt(cat.spent)} / {fmt(cat.yearly_allocated)}
                                    </span>
                                    <span className={`text-xs font-bold ${pct >= 90 ? 'text-red-400' : pct >= 70 ? 'text-amber-400' : 'text-muted-foreground'}`}>
                                      {pct}%
                                    </span>
                                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                  </div>
                                </div>
                                <ColorBar value={pct} color={barColor} />
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {viewMode === 'monthly' && (
                                    <>{pct}% used · {overPace ? '⚡ Over pace' : '✓ On track'}</>
                                  )}
                                  {viewMode === 'daily' && cat.budget_period === 'monthly' && catDailyAllowance !== null && daysLeft > 0 && (
                                    <span className="text-primary">Daily guide: {fmt(catDailyAllowance)}/day</span>
                                  )}
                                  {viewMode === 'daily' && (cat.budget_period !== 'monthly' || catDailyAllowance === null || daysLeft === 0) && (
                                    <>{pct}% used · {daysLeft === 0 ? 'Month ends today' : 'No daily data'}</>
                                  )}
                                  {viewMode === 'remaining' && (
                                    <>Remaining: <span className="font-bold text-foreground">{fmt(Math.max(0, cat.yearly_allocated - cat.spent))}</span> · {overPace ? '⚡ Over pace' : '✓ On track'}</>
                                  )}
                                </p>
                              </button>
                            )
                          })}
                        </div>
                      ))
                    })()}
                  </div>
                )}
                {noBudget.length > 0 && (() => {
                  const grouped = groupCategories(noBudget)
                  const showGroups = grouped.length > 1
                  return (
                    <div className="space-y-4">
                      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">No budget set</p>
                      {grouped.map(({ group, items }) => (
                        <div key={group} className="space-y-2">
                          {showGroups && (
                            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground/60">{group}</p>
                          )}
                          {items.map(cat => (
                            <button
                              key={cat.id}
                              type="button"
                              onClick={() => openSheet(cat)}
                              className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-secondary px-4 py-3 text-left transition-colors hover:border-primary/30 hover:bg-secondary/80 active:scale-[0.995]"
                              aria-label={`Open ${cat.name} details`}
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: cat.color }} />
                                <span className="truncate font-bold text-foreground">{cat.name}</span>
                              </div>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span>No budget</span>
                                <ChevronRight className="h-4 w-4" />
                              </div>
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  )
                })()}
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
              <div ref={addFormRef} className="space-y-3 rounded-xl border border-border bg-card p-4">
                <p className="text-sm font-bold text-foreground">New category</p>
                <Input
                  ref={addNameInputRef}
                  aria-label="Category name"
                  className="h-8 bg-secondary text-sm"
                  placeholder="Category name"
                  value={addName}
                  onChange={e => setAddName(e.target.value)}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    aria-label="Budget amount"
                    inputMode="decimal"
                    className="h-8 min-w-0 flex-1 bg-secondary text-sm font-bold"
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
                </div>
                <div>
                  <p className="mb-1.5 text-xs text-muted-foreground">Color</p>
                  <div className="mb-2 flex flex-wrap gap-1">
                    {PRESET_COLORS.map(c => (
                      <ColorSwatch key={c} color={c} selected={addColor === c} onClick={() => setAddColor(c)} />
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 shrink-0 rounded-full border border-border" style={{ backgroundColor: addColor }} />
                    <input
                      type="text"
                      aria-label="Category color hex"
                      className="h-7 w-24 rounded-md border border-input bg-secondary px-2 font-mono text-sm text-foreground outline-none focus:border-primary"
                      value={addColor}
                      onChange={e => { if (/^#[0-9A-Fa-f]{0,6}$/.test(e.target.value)) setAddColor(e.target.value) }}
                    />
                    <input
                      type="color"
                      aria-label="Category color picker"
                      className="h-7 w-7 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
                      value={addColor.length === 7 ? addColor : '#6c63ff'}
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

      {/* Category detail sheet */}
      <Sheet open={!!sheetCat} onOpenChange={open => { if (!open) setSheetCat(null) }}>
        <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto rounded-t-3xl px-0 pb-0">
          {sheetCat && (() => {
            const cat = sheetCat
            const pct = getCategoryUsedPct(cat.spent, cat.yearly_allocated)
            const barColor = getBarColor(pct, cat.color)
            const leftAmt = Math.max(0, cat.yearly_allocated - cat.spent)
            return (
              <div className="px-6 pb-10 pt-6">
                <SheetHeader className="mb-6 pb-0">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-lg font-extrabold text-background" style={{ backgroundColor: cat.color }}>
                      {cat.name.slice(0, 1)}
                    </div>
                    <div className="min-w-0">
                      <SheetTitle className="text-xl">{cat.name}</SheetTitle>
                      <p className="text-xs text-muted-foreground capitalize">{cat.budget_period} budget</p>
                    </div>
                  </div>
                </SheetHeader>

                {/* Stats row */}
                {cat.yearly_allocated > 0 && (
                  <div className="mb-5 grid grid-cols-3 gap-3">
                    <div className="rounded-2xl bg-secondary p-3 text-center">
                      <p className="text-xs text-muted-foreground">Spent</p>
                      <p className="mt-0.5 truncate text-sm font-extrabold text-foreground">{fmt(cat.spent)}</p>
                    </div>
                    <div className="rounded-2xl bg-secondary p-3 text-center">
                      <p className="text-xs text-muted-foreground">Budget</p>
                      <p className="mt-0.5 truncate text-sm font-extrabold text-foreground">{fmt(cat.yearly_allocated)}</p>
                    </div>
                    <div className="rounded-2xl bg-secondary p-3 text-center">
                      <p className="text-xs text-muted-foreground">Left</p>
                      <p className={`mt-0.5 truncate text-sm font-extrabold ${leftAmt === 0 ? 'text-red-400' : 'text-primary'}`}>{fmt(leftAmt)}</p>
                    </div>
                  </div>
                )}

                {/* Progress bar */}
                {cat.yearly_allocated > 0 && (
                  <div className="mb-6">
                    <ColorBar value={pct} color={barColor} />
                    <p className="mt-1.5 text-right text-xs font-bold text-muted-foreground">{pct}% used</p>
                  </div>
                )}

                {/* Edit form */}
                <div className="mb-6 space-y-4">
                  <p className="text-sm font-extrabold text-foreground">Edit budget</p>
                  <div>
                    <p className="mb-1 text-xs text-muted-foreground">Amount ({money.displayCurrency})</p>
                    <Input
                      aria-label="Budget amount"
                      inputMode="decimal"
                      className="bg-secondary text-sm font-bold"
                      value={formatNumberInput(sheetDraft.yearly_allocated)}
                      onChange={e => setSheetDraft(d => ({ ...d, yearly_allocated: parseNumberInput(e.target.value) }))}
                    />
                  </div>
                  <div>
                    <p className="mb-1 text-xs text-muted-foreground">Period</p>
                    <select
                      aria-label="Budget period"
                      className="h-11 w-full rounded-md border border-input bg-secondary px-3 text-sm font-bold text-foreground outline-none"
                      value={sheetDraft.budget_period}
                      onChange={e => setSheetDraft(d => ({ ...d, budget_period: e.target.value as BudgetPeriod }))}
                    >
                      <option value="monthly">Monthly</option>
                      <option value="yearly">Yearly</option>
                    </select>
                  </div>
                  <div>
                    <p className="mb-1.5 text-xs text-muted-foreground">Color</p>
                    <div className="mb-2 flex flex-wrap gap-2">
                      {PRESET_COLORS.map(c => (
                        <ColorSwatch key={c} color={c} selected={sheetDraft.color === c} onClick={() => setSheetDraft(d => ({ ...d, color: c }))} />
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 shrink-0 rounded-full border border-border" style={{ backgroundColor: sheetDraft.color }} />
                      <input
                        type="text"
                        aria-label="Color hex"
                        className="h-8 w-28 rounded-md border border-input bg-secondary px-3 font-mono text-sm text-foreground outline-none focus:border-primary"
                        value={sheetDraft.color}
                        onChange={e => { if (/^#[0-9A-Fa-f]{0,6}$/.test(e.target.value)) setSheetDraft(d => ({ ...d, color: e.target.value })) }}
                      />
                      <input
                        type="color"
                        aria-label="Color picker"
                        className="h-8 w-8 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
                        value={sheetDraft.color.length === 7 ? sheetDraft.color : '#6c63ff'}
                        onChange={e => setSheetDraft(d => ({ ...d, color: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={saveSheet}
                    disabled={updateCategory.isPending}
                    className="flex h-14 flex-1 items-center justify-center rounded-2xl bg-primary font-extrabold text-primary-foreground disabled:opacity-60"
                  >
                    Save changes
                  </button>
                  <button
                    type="button"
                    onClick={() => { setDeleteTarget({ id: cat.id, name: cat.name }); setSheetCat(null) }}
                    className="flex h-14 items-center justify-center rounded-2xl border border-red-500/30 bg-red-500/10 px-5 font-bold text-red-400 hover:bg-red-500/20"
                  >
                    Delete
                  </button>
                </div>
              </div>
            )
          })()}
        </SheetContent>
      </Sheet>
    </div>
  )
}
