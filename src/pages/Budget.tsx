import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  useBudgetCategories,
  useTransactions,
  useUpdateBudgetCategory,
  useAddBudgetCategory,
  useDeleteBudgetCategory,
} from '@/lib/queries'
import { Lightbulb, ChevronLeft, ChevronRight, Plus, AlertTriangle } from 'lucide-react'
import { StatCard } from '@/components/shared/StatCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { getOverspendRisk, getCategoryUsedPct, isInBudgetPeriod, getSplitAttribution, getBalancingSpent } from '@/lib/budget'
import { MoneyKeypad } from '@/components/mobile/MoneyKeypad'
import { MoneyField } from '@/components/mobile/MoneyField'
import { useMoney } from '@/lib/currency'
import { formatNumberInput, parseNumberInput } from '@/lib/numberInput'
import { toast } from 'sonner'
import type { BudgetPeriod, RiskLevel } from '@/lib/budget'
import { Skeleton } from '@/components/ui/skeleton'
import { getDaysRemainingInMonth } from '@/lib/financeOs'
import { formatDate } from '@/lib/utils'
import { useIsDesktop } from '@/hooks/useIsDesktop'

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
      aria-label={`Select color ${color}`}
      aria-pressed={selected}
      className={`h-11 w-11 rounded-full border-2 transition-transform hover:scale-110 active:scale-95 ${selected ? 'border-foreground ring-1 ring-foreground/30' : 'border-transparent'}`}
      style={{ backgroundColor: color }}
      onClick={onClick}
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
  const isDesktop = useIsDesktop()
  const navigate = useNavigate()
  const { data: categories = [], isPending: catPending, isError: catError, refetch: catRefetch } = useBudgetCategories()
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
      yearly_allocated: cat.yearly_allocated,
      budget_period: cat.budget_period,
      color: cat.color,
    })
  }

  const [periodDate, setPeriodDate] = useState(() => { const d = new Date(); d.setDate(1); return d })
  const [showAdd, setShowAdd] = useState(false)
  const [addName, setAddName] = useState('')
  const [addAmount, setAddAmount] = useState('')
  const [addPeriod, setAddPeriod] = useState<BudgetPeriod>('monthly')
  const [addColor, setAddColor] = useState('#6c63ff')

  const [deleteTarget, setDeleteTarget] = useState<null | { id: string; name: string }>(null)
  const [sheetKeypad, setSheetKeypad] = useState(false)

  const addFormRef = useRef<HTMLDivElement>(null)
  const addNameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (showAdd) {
      addFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      const timer = setTimeout(() => addNameInputRef.current?.focus(), 100)
      return () => clearTimeout(timer)
    }
  }, [showAdd])

  const today = new Date()
  const isCurrentMonth = periodDate.getFullYear() === today.getFullYear() && periodDate.getMonth() === today.getMonth()
  const isPastMonth = periodDate < new Date(today.getFullYear(), today.getMonth(), 1)
  const currentYear = String(periodDate.getFullYear())
  const daysInMonth = new Date(periodDate.getFullYear(), periodDate.getMonth() + 1, 0).getDate()
  const daysLeft = isCurrentMonth ? getDaysRemainingInMonth() : (isPastMonth ? 0 : daysInMonth)
  const monthPct = isCurrentMonth ? Math.round((today.getDate() / daysInMonth) * 100) : (isPastMonth ? 100 : 0)
  const expenseTransactions = transactions.filter(
    t => t.type !== 'income' && t.type !== 'transfer' && t.date.startsWith(currentYear)
  )
  // Cap yearly-category spend to transactions on/before the end of the viewed month
  const lastDayOfViewedMonth = useMemo(() =>
    `${currentYear}-${String(periodDate.getMonth() + 1).padStart(2, '0')}-${daysInMonth}`,
    [currentYear, periodDate, daysInMonth]
  )
  const balancingSpent = getBalancingSpent(expenseTransactions, categories, periodDate)

  const categoriesWithSpent = useMemo(() => {
    const att = getSplitAttribution(expenseTransactions, categories, periodDate)
    return categories.map(cat => {
      const direct = expenseTransactions
        .filter(t => {
          if (t.category !== cat.name) return false
          const period = cat.budget_period ?? 'yearly'
          if (!isInBudgetPeriod(t.date, period, periodDate)) return false
          if (period === 'yearly' && t.date > lastDayOfViewedMonth) return false
          return true
        })
        .reduce((s, t) => s + t.amount, 0)
      const isBalancing = cat.name.toLowerCase() === 'balancing'
      return {
        ...cat,
        budget_period: cat.budget_period ?? 'yearly',
        spent: direct + (att[cat.name.toLowerCase()] ?? 0) + (isBalancing ? balancingSpent : 0),
      }
    })
  }, [categories, expenseTransactions, periodDate, lastDayOfViewedMonth, balancingSpent])

  const monthsElapsed = periodDate.getMonth() + 1
  const balancingCat = categoriesWithSpent.find(c => c.name.toLowerCase() === 'balancing')
  // Normalize all categories to a monthly equivalent so monthly and yearly budgets can be summed fairly
  const totalAllocated = useMemo(() => categoriesWithSpent.reduce((s, c) => {
    return s + (c.budget_period === 'yearly' ? c.yearly_allocated / 12 : c.yearly_allocated)
  }, 0), [categoriesWithSpent])
  const totalSpent = useMemo(() => {
    const catTotal = categoriesWithSpent.reduce((s, c) => {
      return s + (c.budget_period === 'yearly' ? c.spent / Math.max(1, monthsElapsed) : c.spent)
    }, 0)
    // balancingCat's spent already includes balancingSpent; only add it when no Balancing category exists
    return catTotal + (balancingCat ? 0 : balancingSpent)
  }, [categoriesWithSpent, monthsElapsed, balancingSpent, balancingCat])
  const remaining = totalAllocated - totalSpent

  const daysElapsed = isCurrentMonth ? today.getDate() : (isPastMonth ? daysInMonth : 0)
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
    if (!Number.isFinite(sheetDraft.yearly_allocated) || sheetDraft.yearly_allocated <= 0) {
      toast.error('Enter a valid budget amount')
      return
    }
    const id = sheetCat.id
    setSheetCat(null)
    try {
      await updateCategory.mutateAsync({
        id,
        ...sheetDraft,
        yearly_allocated: sheetDraft.yearly_allocated,
      })
      toast.success('Category updated')
    } catch {
      toast.error('Failed to update category')
    }
  }

  const handleAdd = async () => {
    const amount = parseNumberInput(addAmount)
    if (!addName.trim()) { toast.error('Enter a category name'); return }
    if (!Number.isFinite(amount) || amount <= 0) { toast.error('Enter a valid amount'); return }
    try {
      await addCategory.mutateAsync({ name: addName.trim(), yearly_allocated: amount, budget_period: addPeriod, color: addColor })
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
        yearly_allocated: monthlyAvg,
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

  const allocationHeaders = viewMode === 'daily'
    ? ['Daily left', 'Left']
    : viewMode === 'remaining'
    ? ['Remaining', 'Budget']
    : ['Spent', 'Budget']

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
      {/* Month navigator */}
      <div className="mb-5 flex items-center justify-between rounded-2xl border border-border bg-secondary px-4 py-3">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => setPeriodDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-center">
          <p className="text-sm font-extrabold text-foreground">
            {periodDate.toLocaleString('en', { month: 'long', year: 'numeric' })}
          </p>
          {!isCurrentMonth && (
            <button
              type="button"
              onClick={() => setPeriodDate(new Date())}
              className="mt-0.5 text-xs text-primary hover:underline"
            >
              Back to current
            </button>
          )}
        </div>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => setPeriodDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
          disabled={isCurrentMonth}
          className={`flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-background transition-colors ${isCurrentMonth ? 'cursor-not-allowed opacity-30' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:gap-6">
        <StatCard label="Monthly budget" value={fmt(totalAllocated)} sub={money.formatRef(totalAllocated) ?? 'Blended monthly equivalent'} />
        <StatCard label="Remaining" value={fmt(hasData ? remaining : 0)} sub={money.formatRef(hasData ? remaining : 0) ?? 'Safe inside active periods'} badgeVariant={hasData && remaining < 0 ? 'danger' : 'success'} />
        <StatCard label="Overspend risk" value={hasData ? risk : 'None'} sub={hasData && totalAllocated > 0 ? `${Math.round((totalSpent / totalAllocated) * 100)}% of budget used` : 'No categories yet'} badgeVariant={hasData ? riskVariant[risk] : undefined} />
      </div>

      {isCurrentMonth && hasData && forecasts.length > 0 && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-[#FFCF73]/30 bg-[#FFCF73]/5 px-5 py-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#FFCF73]" />
          <div>
            <p className="text-sm font-extrabold text-foreground">Spending pace alert</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {forecasts.length === 1
                ? `${forecasts[0].name} is on track to overspend by ${fmt(forecasts[0].overspend)} this month.`
                : `${forecasts.length} categories are on track to overspend — ${forecasts.map(f => f.name).join(', ')}.`
              }
            </p>
          </div>
        </div>
      )}

      {hasData && forecasts.length === 0 && (
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

      {isCurrentMonth && forecasts.length > 0 && (
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
            <div className="flex items-center gap-2">
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
              {!showAdd && (
                <button
                  type="button"
                  aria-label="Add budget category"
                  onClick={() => { setShowAdd(true); setTimeout(() => addNameInputRef.current?.focus(), 80) }}
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-secondary text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                >
                  <Plus className="h-4 w-4" />
                </button>
              )}
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
            ) : catError ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-secondary px-6 py-10 text-center">
                <p className="text-base font-bold text-foreground">Could not load budget</p>
                <p className="mt-1 text-sm text-muted-foreground">Your local data is safe. Try refreshing.</p>
                <button
                  type="button"
                  onClick={() => catRefetch()}
                  className="mt-4 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90 active:opacity-80"
                >
                  Retry
                </button>
              </div>
            ) : categoriesWithSpent.length > 0 ? (
              <>
                {activeBudgets.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-end justify-between gap-4">
                      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Active budgets</p>
                      <div className="hidden flex-1 grid-cols-[minmax(160px,1.2fr)_130px_130px_150px_140px_32px] items-center gap-4 px-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground/70 lg:grid">
                        <span>Category</span>
                        <span>{allocationHeaders[0]}</span>
                        <span>{allocationHeaders[1]}</span>
                        <span>Progress</span>
                        <span>Status</span>
                        <span />
                      </div>
                    </div>
                    {(() => {
                      const grouped = groupCategories(activeBudgets)
                      const showGroups = grouped.length > 1
                      return grouped.map(({ group, items }) => (
                        <div key={group} className="space-y-4">
                          {showGroups && (
                            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground/60">{group}</p>
                          )}
                          {items.map(cat => {
                            const isBalancing = cat.name.toLowerCase() === 'balancing'
                            const pct = getCategoryUsedPct(cat.spent, cat.yearly_allocated)
                            const barColor = getBarColor(pct, cat.color)
                            const catDailyAllowance = cat.budget_period === 'monthly' && cat.yearly_allocated > cat.spent && daysLeft > 0
                              ? (cat.yearly_allocated - cat.spent) / daysLeft
                              : null
                            const overPace = pct > monthPct
                            const primaryValue = viewMode === 'daily'
                              ? (catDailyAllowance !== null ? fmt(catDailyAllowance) : '—')
                              : viewMode === 'remaining'
                              ? fmt(Math.max(0, cat.yearly_allocated - cat.spent))
                              : fmt(cat.spent)
                            const secondaryValue = viewMode === 'daily'
                              ? fmt(Math.max(0, cat.yearly_allocated - cat.spent))
                              : fmt(cat.yearly_allocated)

                            return (
                              <button
                                key={cat.id}
                                type="button"
                                onClick={() => {
                                  if (isDesktop) openSheet(cat)
                                  else navigate(`/category/${encodeURIComponent(cat.name)}`)
                                }}
                                className="w-full rounded-xl border border-border/50 bg-secondary/30 p-3 text-left transition-colors hover:border-border hover:bg-secondary/50 active:scale-[0.995] lg:grid lg:grid-cols-[minmax(160px,1.2fr)_130px_130px_150px_140px_32px] lg:items-center lg:gap-4 lg:rounded-lg lg:border-border/60 lg:bg-secondary/20 lg:px-3 lg:py-2"
                                aria-label={`Open ${cat.name} budget details`}
                              >
                                <div className="mb-2 flex items-center justify-between gap-2 text-sm lg:contents">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: cat.color }} />
                                      <span className="truncate font-bold text-foreground">{cat.name}</span>
                                    </div>
                                    {isBalancing && (
                                      <p className="mt-0.5 pl-5 text-[11px] leading-tight text-muted-foreground">Includes unknown & unallocated</p>
                                    )}
                                  </div>
                                  <span className="hidden tabular-nums whitespace-nowrap text-xs font-semibold text-muted-foreground lg:block">{primaryValue}</span>
                                  <span className="hidden tabular-nums whitespace-nowrap text-xs font-semibold text-muted-foreground lg:block">{secondaryValue}</span>
                                  <div className="flex shrink-0 items-center gap-2 lg:hidden">
                                    <span className="tabular-nums whitespace-nowrap text-xs text-muted-foreground">{fmt(cat.spent)} / {fmt(cat.yearly_allocated)}</span>
                                    <span className={`text-xs font-bold ${pct >= 90 ? 'text-[#FF8388]' : pct >= 70 ? 'text-[#FFCF73]' : 'text-muted-foreground'}`}>{pct}%</span>
                                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                  </div>
                                </div>
                                <div className="lg:hidden"><ColorBar value={pct} color={barColor} /></div>
                                <div className="hidden items-center gap-2 lg:flex">
                                  <div className="min-w-0 flex-1"><ColorBar value={pct} color={barColor} /></div>
                                  <span className={`w-9 text-right text-xs font-bold ${pct >= 90 ? 'text-[#FF8388]' : pct >= 70 ? 'text-[#FFCF73]' : 'text-muted-foreground'}`}>
                                    {pct}%
                                  </span>
                                </div>
                                <div className="mt-1.5 flex items-center gap-2 lg:mt-0 lg:min-w-0">
                                  {pct === 0 ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground lg:truncate">No spending</span>
                                  ) : pct >= 100 ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-[#FF8388]/15 px-2 py-0.5 text-[11px] font-bold text-[#FF8388] lg:truncate">Over budget</span>
                                  ) : pct >= 90 ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-[#FF8388]/15 px-2 py-0.5 text-[11px] font-bold text-[#FF8388] lg:truncate">Near limit</span>
                                  ) : pct >= 70 ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-[#FFCF73]/15 px-2 py-0.5 text-[11px] font-bold text-[#FFCF73] lg:truncate">Watch spending</span>
                                  ) : overPace ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-[#FFCF73]/10 px-2 py-0.5 text-[11px] font-bold text-[#FFCF73] lg:truncate">Over pace</span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary lg:truncate">On track</span>
                                  )}
                                  {viewMode === 'remaining' && (
                                    <span className="text-[11px] text-muted-foreground lg:hidden">{fmt(Math.max(0, cat.yearly_allocated - cat.spent))} left</span>
                                  )}
                                  {viewMode === 'daily' && cat.budget_period === 'monthly' && catDailyAllowance !== null && daysLeft > 0 && (
                                    <span className="text-[11px] text-muted-foreground lg:hidden">{fmt(catDailyAllowance)}/day</span>
                                  )}
                                </div>
                                <ChevronRight className="hidden h-4 w-4 justify-self-end text-muted-foreground lg:block" />
                              </button>
                            )
                          })}
                        </div>
                      ))
                    })()}
                  </div>
                )}
                {balancingSpent > 0 && !balancingCat && (
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#FFCF73]/30 bg-[#FFCF73]/5 px-5 py-4">
                    <div>
                      <p className="text-sm font-extrabold text-foreground">Unassigned spending — {fmt(balancingSpent)}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">Unknown categories and split leftovers. Add a Balancing category to track them.</p>
                    </div>
                    <Button size="sm" variant="secondary" onClick={async () => {
                      try {
                        await addCategory.mutateAsync({ name: 'Balancing', yearly_allocated: 0, budget_period: 'monthly', color: '#64748B' })
                        toast.success('Balancing category added')
                      } catch { toast.error('Failed to add Balancing category') }
                    }}>Add Balancing</Button>
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
                          {items.map(cat => {
                            const isBalancing = cat.name.toLowerCase() === 'balancing'
                            return (
                              <button
                                key={cat.id}
                                type="button"
                                onClick={() => {
                                  if (isDesktop) openSheet(cat)
                                  else navigate(`/category/${encodeURIComponent(cat.name)}`)
                                }}
                                className="w-full rounded-xl border border-border bg-secondary px-4 py-3 text-left transition-colors hover:border-primary/30 hover:bg-secondary/80 active:scale-[0.995]"
                                aria-label={`Open ${cat.name} details`}
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div className="flex min-w-0 items-center gap-2">
                                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: cat.color }} />
                                    <span className="truncate font-bold text-foreground">{cat.name}</span>
                                  </div>
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <span>{isBalancing ? fmt(cat.spent) : 'No budget'}</span>
                                    <ChevronRight className="h-4 w-4" />
                                  </div>
                                </div>
                                {isBalancing && (
                                  <p className="mt-0.5 text-xs text-muted-foreground">Includes unknown & unallocated</p>
                                )}
                              </button>
                            )
                          })}
                        </div>
                      ))}
                    </div>
                  )
                })()}
              </>
            ) : (
              <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border bg-secondary/30 px-6 py-12 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                  <Lightbulb className="h-7 w-7 text-primary" />
                </span>
                <div>
                  <p className="font-extrabold text-foreground">No budget categories yet</p>
                  <p className="mt-1 text-sm text-muted-foreground">Create categories to track spending limits and see how much you have left each month.</p>
                </div>
                <Button asChild size="sm">
                  <Link to="/settings">Set up categories →</Link>
                </Button>
              </div>
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
                          className="h-9 text-xs"
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
                  className="bg-secondary text-sm"
                  placeholder="Category name"
                  value={addName}
                  onChange={e => setAddName(e.target.value)}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <MoneyField
                      value={addAmount}
                      onChange={v => setAddAmount(formatNumberInput(v))}
                      currency={money.baseCurrency}
                      ariaLabel="Budget amount"
                      className="bg-secondary text-sm font-bold"
                      placeholder={`Budget amount (${money.baseCurrency})`}
                    />
                  </div>
                  <select
                    aria-label="New category budget period"
                    className="h-11 rounded-md border border-input bg-secondary px-3 text-sm font-bold text-foreground outline-none"
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
                    <div className="h-8 w-8 shrink-0 rounded-full border border-border" style={{ backgroundColor: addColor }} />
                    <input
                      type="text"
                      aria-label="Category color hex"
                      className="h-9 w-24 rounded-md border border-input bg-secondary px-2 font-mono text-sm text-foreground outline-none focus:border-primary"
                      value={addColor}
                      onChange={e => { if (/^#[0-9A-Fa-f]{0,6}$/.test(e.target.value)) setAddColor(e.target.value) }}
                    />
                    <input
                      type="color"
                      aria-label="Category color picker"
                      className="h-9 w-9 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
                      value={addColor.length === 7 ? addColor : '#6c63ff'}
                      onChange={e => setAddColor(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button className="h-11 flex-1 text-sm" onClick={handleAdd} disabled={addCategory.isPending}>
                    Add category
                  </Button>
                  <Button variant="secondary" className="h-11 text-sm" onClick={() => setShowAdd(false)}>
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
      <Sheet open={!!sheetCat} onOpenChange={open => { if (!open) { setSheetCat(null); setSheetKeypad(false) } }}>
        <SheetContent
          side={isDesktop ? 'right' : 'bottom'}
          className={isDesktop
            ? 'w-full max-w-xl overflow-y-auto border-border px-0 pb-0 sm:max-w-xl'
            : 'max-h-[90dvh] overflow-y-auto rounded-t-3xl px-0 pb-safe-10'}
        >
          {sheetCat && (() => {
            const cat = sheetCat
            const pct = getCategoryUsedPct(cat.spent, cat.yearly_allocated)
            const barColor = getBarColor(pct, cat.color)
            const leftAmt = Math.max(0, cat.yearly_allocated - cat.spent)
            return (
              <div className="px-6 pb-safe-10 pt-6">
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
                      <p className={`mt-0.5 truncate text-sm font-extrabold ${leftAmt === 0 ? 'text-[#FF8388]' : 'text-primary'}`}>{fmt(leftAmt)}</p>
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
                    <p className="mb-1 text-xs text-muted-foreground">Amount ({money.baseCurrency})</p>
                    <Input
                      aria-label="Budget amount"
                      readOnly
                      className="bg-secondary text-sm font-bold"
                      value={formatNumberInput(sheetDraft.yearly_allocated)}
                      onChange={e => setSheetDraft(d => ({ ...d, yearly_allocated: parseNumberInput(e.target.value) }))}
                      onClick={() => setSheetKeypad(true)}
                      onFocus={() => setSheetKeypad(true)}
                    />
                    {sheetKeypad && (
                      <MoneyKeypad
                        value={String(sheetDraft.yearly_allocated || '')}
                        onChange={v => setSheetDraft(d => ({ ...d, yearly_allocated: parseNumberInput(v) }))}
                        currency={money.baseCurrency}
                        onDone={() => setSheetKeypad(false)}
                        doneLabel="Done"
                      />
                    )}
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
                      <div className="h-9 w-9 shrink-0 rounded-full border border-border" style={{ backgroundColor: sheetDraft.color }} />
                      <input
                        type="text"
                        aria-label="Color hex"
                        className="h-9 w-28 rounded-md border border-input bg-secondary px-3 font-mono text-sm text-foreground outline-none focus:border-primary"
                        value={sheetDraft.color}
                        onChange={e => { if (/^#[0-9A-Fa-f]{0,6}$/.test(e.target.value)) setSheetDraft(d => ({ ...d, color: e.target.value })) }}
                      />
                      <input
                        type="color"
                        aria-label="Color picker"
                        className="h-9 w-9 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
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
                    className="flex h-14 flex-1 items-center justify-center rounded-2xl bg-primary font-extrabold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Save changes
                  </button>
                  <button
                    type="button"
                    onClick={() => { setDeleteTarget({ id: cat.id, name: cat.name }); setSheetCat(null) }}
                    className="flex h-14 items-center justify-center rounded-2xl border border-[#FF8388]/30 bg-[#FF8388]/10 px-5 font-bold text-[#FF8388] hover:bg-[#FF8388]/20"
                  >
                    Delete
                  </button>
                </div>

                {/* Recent transactions in this category */}
                {(() => {
                  const catTx = expenseTransactions
                    .filter(t => t.category === cat.name && isInBudgetPeriod(t.date, cat.budget_period, periodDate))
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .slice(0, 4)
                  if (catTx.length === 0) return null
                  return (
                    <div className="mt-6 border-t border-border pt-6">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-sm font-extrabold text-foreground">Recent transactions</p>
                        <Link
                          to={`/transactions`}
                          onClick={() => setSheetCat(null)}
                          className="text-xs font-bold text-primary hover:underline"
                        >
                          View all →
                        </Link>
                      </div>
                      <div className="space-y-1.5">
                        {catTx.map(tx => (
                          <div key={tx.id} className="flex items-center justify-between gap-3 rounded-xl bg-secondary px-3 py-2.5 text-sm">
                            <div className="min-w-0">
                              <p className="truncate font-bold text-foreground">{tx.description}</p>
                              <p className="text-xs text-muted-foreground">{formatDate(tx.date)}</p>
                            </div>
                            <span className="shrink-0 tabular-nums font-extrabold text-[#FF8388]">−{fmt(tx.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })()}
              </div>
            )
          })()}
        </SheetContent>
      </Sheet>
    </div>
  )
}
