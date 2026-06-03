import { useEffect, useMemo, useRef, useState } from 'react'
import { useEstimationPlans, useUpsertEstimationPlan, useTransactions, useAddGoal } from '@/lib/queries'
import { StatCard } from '@/components/shared/StatCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { calculateSavingsRate } from '@/lib/stats'
import { useMoney } from '@/lib/currency'
import { formatNumberInput, parseNumberInput } from '@/lib/numberInput'
import { toast } from 'sonner'
import { Check, Pencil, X, Lightbulb, Target, ChevronLeft, ChevronRight, Zap, TrendingUp, TrendingDown } from 'lucide-react'
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from 'recharts'

const PLANNING_TIP_KEY = 'finpath_planning_tip_dismissed'

type EstimatePeriod = 'monthly' | 'yearly'

type EstimateItem = {
  id: string
  name: string
  amount: number
  period: EstimatePeriod
}

type WishlistItem = {
  id: string
  name: string
  amount: number
  type: string
  note: string
}

export function Estimation() {
  const money = useMoney()
  const upsert = useUpsertEstimationPlan()
  const addGoal = useAddGoal()
  const { data: plans } = useEstimationPlans()
  const { data: transactions = [] } = useTransactions()
  const [planningDate, setPlanningDate] = useState(() => { const d = new Date(); d.setDate(1); return d })
  const loadedMonth = useRef('')

  const [incomeItems, setIncomeItems] = useState<EstimateItem[]>([])
  const [expenseItems, setExpenseItems] = useState<EstimateItem[]>([])
  const [incomeSource, setIncomeSource] = useState('')
  const [incomeAmount, setIncomeAmount] = useState('')
  const [incomePeriod, setIncomePeriod] = useState<EstimatePeriod>('monthly')
  const [expenseDetail, setExpenseDetail] = useState('')
  const [expenseAmount, setExpenseAmount] = useState('')
  const [expensePeriod, setExpensePeriod] = useState<EstimatePeriod>('monthly')
  const [notes, setNotes] = useState('')
  const [wishlistItems, setWishlistItems] = useState<WishlistItem[]>([])
  const [wishlistName, setWishlistName] = useState('')
  const [wishlistAmount, setWishlistAmount] = useState('')
  const [wishlistType, setWishlistType] = useState('Want')
  const [wishlistNote, setWishlistNote] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<null | { list: 'income' | 'expense' | 'wishlist'; id: string; name: string }>(null)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [incomeError, setIncomeError] = useState(false)
  const [expenseError, setExpenseError] = useState(false)
  const [editItem, setEditItem] = useState<{ list: 'income' | 'expense'; id: string } | null>(null)
  const [editName, setEditName] = useState('')
  const [editAmount, setEditAmount] = useState('')
  const [editPeriod, setEditPeriod] = useState<EstimatePeriod>('monthly')
  const [editWishlistId, setEditWishlistId] = useState<string | null>(null)
  const [editWishlistName, setEditWishlistName] = useState('')
  const [editWishlistAmount, setEditWishlistAmount] = useState('')
  const [editWishlistType, setEditWishlistType] = useState('Want')
  const [editWishlistNote, setEditWishlistNote] = useState('')
  const [planningTipDismissed, setPlanningTipDismissed] = useState(() => localStorage.getItem(PLANNING_TIP_KEY) === '1')

  useEffect(() => {
    if (!plans) return
    const monthKey = `${planningDate.getFullYear()}-${planningDate.getMonth() + 1}`
    if (loadedMonth.current === monthKey) return
    loadedMonth.current = monthKey
    const current = plans.find(p => p.month === planningDate.getMonth() + 1 && p.year === planningDate.getFullYear())
    setNotes('')
    setIncomeItems([])
    setExpenseItems([])
    setWishlistItems([])
    if (!current?.notes) return
    try {
      const parsed = JSON.parse(current.notes) as {
        text?: string
        incomeItems?: EstimateItem[]
        expenseItems?: EstimateItem[]
        wishlistItems?: WishlistItem[]
      }
      if (parsed.text !== undefined) setNotes(parsed.text)
      if (Array.isArray(parsed.incomeItems)) setIncomeItems(parsed.incomeItems)
      if (Array.isArray(parsed.expenseItems)) setExpenseItems(parsed.expenseItems)
      if (Array.isArray(parsed.wishlistItems)) setWishlistItems(parsed.wishlistItems)
    } catch {
      setNotes(current.notes)
    }
  }, [plans, planningDate])

  const actualThisMonth = useMemo(() => {
    const monthStr = `${planningDate.getFullYear()}-${String(planningDate.getMonth() + 1).padStart(2, '0')}`
    const monthTx = transactions.filter(t => t.date.startsWith(monthStr))
    return {
      income: monthTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0),
      expenses: monthTx.filter(t => t.type !== 'income' && t.type !== 'transfer').reduce((s, t) => s + t.amount, 0),
    }
  }, [transactions])

  const monthlyIncome = useMemo(() => incomeItems.reduce((sum, item) => sum + (item.period === 'monthly' ? item.amount : item.amount / 12), 0), [incomeItems])
  const yearlyIncome = useMemo(() => incomeItems.reduce((sum, item) => sum + (item.period === 'monthly' ? item.amount * 12 : item.amount), 0), [incomeItems])
  const monthlyExpenses = useMemo(() => expenseItems.reduce((sum, item) => sum + (item.period === 'monthly' ? item.amount : item.amount / 12), 0), [expenseItems])
  const yearlyExpenses = useMemo(() => expenseItems.reduce((sum, item) => sum + (item.period === 'monthly' ? item.amount * 12 : item.amount), 0), [expenseItems])
  const yearlySaving = yearlyIncome - yearlyExpenses
  const savingsRate = calculateSavingsRate(monthlyIncome, monthlyExpenses)
  const wishlistTotal = useMemo(() => wishlistItems.reduce((sum, item) => sum + item.amount, 0), [wishlistItems])

  const saveToBackend = async (
    newIncome: EstimateItem[],
    newExpense: EstimateItem[],
    newWishlist: WishlistItem[],
    currentNotes: string,
  ) => {
    const mi = newIncome.reduce((s, i) => s + (i.period === 'monthly' ? i.amount : i.amount / 12), 0)
    const me = newExpense.reduce((s, i) => s + (i.period === 'monthly' ? i.amount : i.amount / 12), 0)
    await upsert.mutateAsync({
      month: planningDate.getMonth() + 1,
      year: planningDate.getFullYear(),
      estimated_income: mi,
      fixed_expenses: me,
      variable_estimate: 0,
      currency: money.baseCurrency,
      notes: JSON.stringify({ text: currentNotes, incomeItems: newIncome, expenseItems: newExpense, wishlistItems: newWishlist }),
    })
  }

  const addIncome = async () => {
    const amount = parseNumberInput(incomeAmount)
    if (!incomeSource.trim() || amount <= 0) {
      setIncomeError(true)
      setTimeout(() => setIncomeError(false), 1500)
      return
    }
    const newItems = [...incomeItems, { id: crypto.randomUUID(), name: incomeSource.trim(), amount: money.toBase(amount, money.displayCurrency), period: incomePeriod }]
    setIncomeItems(newItems)
    setIncomeSource('')
    setIncomeAmount('')
    try {
      await saveToBackend(newItems, expenseItems, wishlistItems, notes)
      toast.success('Income item added')
    } catch {
      toast.error('Failed to save — item shown locally but may not persist')
    }
  }

  const addExpense = async () => {
    const amount = parseNumberInput(expenseAmount)
    if (!expenseDetail.trim() || amount <= 0) {
      setExpenseError(true)
      setTimeout(() => setExpenseError(false), 1500)
      return
    }
    const newItems = [...expenseItems, { id: crypto.randomUUID(), name: expenseDetail.trim(), amount: money.toBase(amount, money.displayCurrency), period: expensePeriod }]
    setExpenseItems(newItems)
    setExpenseDetail('')
    setExpenseAmount('')
    try {
      await saveToBackend(incomeItems, newItems, wishlistItems, notes)
      toast.success('Expense item added')
    } catch {
      toast.error('Failed to save — item shown locally but may not persist')
    }
  }

  const addWishlistItem = async () => {
    const amount = parseNumberInput(wishlistAmount)
    if (!wishlistName.trim() || amount <= 0) return
    const newItems = [...wishlistItems, {
      id: crypto.randomUUID(),
      name: wishlistName.trim(),
      amount: money.toBase(amount, money.displayCurrency),
      type: wishlistType,
      note: wishlistNote.trim(),
    }]
    setWishlistItems(newItems)
    setWishlistName('')
    setWishlistAmount('')
    setWishlistType('Want')
    setWishlistNote('')
    try {
      await saveToBackend(incomeItems, expenseItems, newItems, notes)
      toast.success('Wishlist item added')
    } catch {
      toast.error('Failed to save — item shown locally but may not persist')
    }
  }

  const startEditItem = (list: 'income' | 'expense', id: string) => {
    const items = list === 'income' ? incomeItems : expenseItems
    const item = items.find(i => i.id === id)
    if (!item) return
    setEditItem({ list, id })
    setEditName(item.name)
    setEditAmount(formatNumberInput(money.fromBase(item.amount, money.displayCurrency)))
    setEditPeriod(item.period)
  }

  const saveEditItem = async () => {
    if (!editItem) return
    const amount = money.toBase(parseNumberInput(editAmount), money.displayCurrency)
    if (!editName.trim() || amount <= 0) return
    let newIncome = incomeItems
    let newExpense = expenseItems
    if (editItem.list === 'income') {
      newIncome = incomeItems.map(i => i.id === editItem.id ? { ...i, name: editName.trim(), amount, period: editPeriod } : i)
      setIncomeItems(newIncome)
    } else {
      newExpense = expenseItems.map(i => i.id === editItem.id ? { ...i, name: editName.trim(), amount, period: editPeriod } : i)
      setExpenseItems(newExpense)
    }
    setEditItem(null)
    await saveToBackend(newIncome, newExpense, wishlistItems, notes)
  }

  const startEditWishlist = (id: string) => {
    const item = wishlistItems.find(i => i.id === id)
    if (!item) return
    setEditWishlistId(id)
    setEditWishlistName(item.name)
    setEditWishlistAmount(formatNumberInput(money.fromBase(item.amount, money.displayCurrency)))
    setEditWishlistType(item.type)
    setEditWishlistNote(item.note)
  }

  const saveEditWishlist = async () => {
    if (!editWishlistId) return
    const amount = money.toBase(parseNumberInput(editWishlistAmount), money.displayCurrency)
    if (!editWishlistName.trim() || amount <= 0) return
    const newWishlist = wishlistItems.map(i => i.id === editWishlistId
      ? { ...i, name: editWishlistName.trim(), amount, type: editWishlistType, note: editWishlistNote.trim() }
      : i
    )
    setWishlistItems(newWishlist)
    setEditWishlistId(null)
    await saveToBackend(incomeItems, expenseItems, newWishlist, notes)
  }

  const convertToGoal = async (item: WishlistItem) => {
    const GOAL_COLORS = ['#A9F5C7', '#93C5FD', '#FADBEA', '#FFD276', '#C4AEFF']
    const color = GOAL_COLORS[Math.floor(Math.random() * GOAL_COLORS.length)]
    await addGoal.mutateAsync({
      name: item.name,
      target_amount: item.amount,
      current_amount: 0,
      color,
      category: item.type || 'Other',
      notes: item.note || '',
      deadline: null,
    })
    toast.success(`"${item.name}" added as a goal`)
  }

  const handleSave = async () => {
    await saveToBackend(incomeItems, expenseItems, wishlistItems, notes)
    toast.success('Estimation plan saved')
  }

  const handleClearAll = async () => {
    setIncomeItems([])
    setExpenseItems([])
    setWishlistItems([])
    setNotes('')
    setShowClearConfirm(false)
    await saveToBackend([], [], [], '')
    toast.success('Plan data cleared')
  }

  const confirmDeleteSelected = async () => {
    if (!deleteTarget) return
    const newIncome = deleteTarget.list === 'income' ? incomeItems.filter(i => i.id !== deleteTarget.id) : incomeItems
    const newExpense = deleteTarget.list === 'expense' ? expenseItems.filter(i => i.id !== deleteTarget.id) : expenseItems
    const newWishlist = deleteTarget.list === 'wishlist' ? wishlistItems.filter(i => i.id !== deleteTarget.id) : wishlistItems
    setIncomeItems(newIncome)
    setExpenseItems(newExpense)
    setWishlistItems(newWishlist)
    setDeleteTarget(null)
    await saveToBackend(newIncome, newExpense, newWishlist, notes)
  }

  return (
    <div>
      <PageHeader
        title="Planning"
        subtitle="Plan future months one item at a time: income sources, expected expenses, notes, and wishlist."
        action={(
          <div className="flex items-center gap-3">
            <div className="flex h-11 items-center gap-5 rounded-full border border-border bg-secondary px-6 text-sm">
              <span className="text-muted-foreground">Main currency</span>
              <span className="min-w-10 text-right font-extrabold text-primary" aria-label="Main currency">
                {money.baseCurrency}
              </span>
            </div>
            {(incomeItems.length > 0 || expenseItems.length > 0 || wishlistItems.length > 0) && (
              <Button variant="secondary" size="sm" className="text-[#FF8388] hover:bg-[#FF8388]/10" onClick={() => setShowClearConfirm(true)}>
                Clear all
              </Button>
            )}
          </div>
        )}
      />
      {/* Month navigator */}
      {(() => {
        const today = new Date()
        const isCurrentMonth = planningDate.getFullYear() === today.getFullYear() && planningDate.getMonth() === today.getMonth()
        return (
          <div className="mb-5 flex items-center justify-between rounded-2xl border border-border bg-secondary px-4 py-3">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setPlanningDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="text-center">
              <p className="text-sm font-extrabold text-foreground">
                {planningDate.toLocaleString('en', { month: 'long', year: 'numeric' })}
              </p>
              {!isCurrentMonth && (
                <button
                  type="button"
                  onClick={() => setPlanningDate(new Date())}
                  className="mt-0.5 text-xs text-primary hover:underline"
                >
                  Back to current
                </button>
              )}
            </div>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setPlanningDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )
      })()}

      {!planningTipDismissed && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-5 py-4">
          <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="font-bold text-foreground">Planning vs Budget</p>
            <p className="mt-1 text-sm text-muted-foreground">
              <strong className="text-foreground">Budget</strong> is for tracking real monthly spending limits against actual transactions.{' '}
              <strong className="text-foreground">Planning</strong> is for forecasting future income, expenses, and wishlist goals.
            </p>
          </div>
          <button
            type="button"
            onClick={() => { localStorage.setItem(PLANNING_TIP_KEY, '1'); setPlanningTipDismissed(true) }}
            className="shrink-0 rounded-full px-3 py-2 text-xs font-bold text-primary hover:bg-primary/10 active:scale-95"
          >
            Got it
          </button>
        </div>
      )}

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
        <StatCard label="Monthly income" value={money.formatDisplay(monthlyIncome)} sub={`${incomeItems.length} income items`} badgeVariant="success" />
        <StatCard label="Monthly expenses" value={money.formatDisplay(monthlyExpenses)} sub={`${expenseItems.length} expense items`} badgeVariant="warning" />
        <StatCard label="Yearly saving" value={money.formatDisplay(yearlySaving)} sub={`${savingsRate}% monthly saving rate`} />
        <StatCard label="Yearly income" value={money.formatDisplay(yearlyIncome)} sub={`Expenses ${money.formatDisplay(yearlyExpenses)}`} />
      </div>

      {(monthlyIncome > 0 || monthlyExpenses > 0) && (() => {
        const total = Math.max(monthlyIncome, monthlyExpenses, 1)
        const incPct = Math.round((monthlyIncome / total) * 100)
        const expPct = Math.round((monthlyExpenses / total) * 100)
        const surplus = monthlyIncome - monthlyExpenses
        return (
          <div className="mb-8 rounded-2xl border border-border bg-secondary px-5 py-4">
            <div className="space-y-3">
              <div>
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 font-bold text-foreground">
                    <span className="h-2 w-2 rounded-full bg-primary" />Income
                  </div>
                  <span className="font-extrabold text-primary">{money.formatDisplay(monthlyIncome)}/mo</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${incPct}%` }} />
                </div>
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 font-bold text-foreground">
                    <span className="h-2 w-2 rounded-full bg-[#FF8388]" />Expenses
                  </div>
                  <span className="font-extrabold text-[#FF8388]">{money.formatDisplay(monthlyExpenses)}/mo</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-[#FF8388] transition-all" style={{ width: `${expPct}%` }} />
                </div>
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {savingsRate}% savings rate ·{' '}
              <span className={surplus >= 0 ? 'font-bold text-primary' : 'font-bold text-[#FF8388]'}>
                {surplus >= 0 ? '+' : ''}{money.formatDisplay(surplus)}/mo surplus
              </span>
              {' '}· yearly projection {money.formatDisplay(surplus * 12)}
            </p>
          </div>
        )
      })()}

      {monthlyIncome > 0 && (
        <div className={`mb-8 rounded-2xl border px-5 py-4 ${monthlyIncome >= monthlyExpenses + wishlistTotal ? 'border-primary/20 bg-primary/5' : monthlyIncome >= monthlyExpenses ? 'border-[#FFCF73]/20 bg-[#FFCF73]/5' : 'border-[#FF8388]/20 bg-[#FF8388]/5'}`}>
          <p className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">
            {planningDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} forecast
          </p>
          <div className="space-y-1.5 text-sm">
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Income</span>
              <span className="font-extrabold text-primary">{money.formatDisplay(monthlyIncome)}/mo</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Fixed expenses</span>
              <span className="font-extrabold text-[#FF8388]">−{money.formatDisplay(monthlyExpenses)}/mo</span>
            </div>
            {wishlistTotal > 0 && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Wishlist total</span>
                <span className="font-bold text-muted-foreground">{money.formatDisplay(wishlistTotal)}</span>
              </div>
            )}
          </div>
          <div className="mt-3 border-t border-border pt-3">
            {monthlyIncome >= monthlyExpenses + (wishlistTotal > 0 ? wishlistTotal : 0) ? (
              <p className="flex items-center gap-1.5 font-extrabold text-primary"><Check className="h-4 w-4 shrink-0" /> Affordable — surplus of {money.formatDisplay(monthlyIncome - monthlyExpenses - wishlistTotal)}/mo after everything</p>
            ) : monthlyIncome >= monthlyExpenses ? (
              <div>
                <p className="flex items-center gap-1.5 font-extrabold text-[#FFCF73]"><Zap className="h-4 w-4 shrink-0" /> Expenses covered — wishlist needs {money.formatDisplay(monthlyExpenses + wishlistTotal - monthlyIncome)} more/mo</p>
                {wishlistTotal > 0 && <p className="mt-1 text-xs text-muted-foreground">Save {money.formatDisplay(monthlyExpenses + wishlistTotal - monthlyIncome)}/mo for {Math.ceil(wishlistTotal / Math.max(1, monthlyIncome - monthlyExpenses))} months to afford wishlist</p>}
              </div>
            ) : (
              <p className="flex items-center gap-1.5 font-extrabold text-[#FF8388]"><X className="h-4 w-4 shrink-0" /> Expenses exceed income by {money.formatDisplay(monthlyExpenses - monthlyIncome)}/mo — reduce expenses or increase income</p>
            )}
          </div>
        </div>
      )}

      {(monthlyIncome > 0 || monthlyExpenses > 0 || actualThisMonth.income > 0 || actualThisMonth.expenses > 0) && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-xl">Planned vs Actual this month</CardTitle>
            <p className="text-sm text-muted-foreground">How your forecast compares to real transactions recorded this month.</p>
          </CardHeader>
          <CardContent className="space-y-4 px-5 pb-6 sm:px-8">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {[
                { label: 'Income', planned: monthlyIncome, actual: actualThisMonth.income, good: (actual: number, planned: number) => actual >= planned },
                { label: 'Expenses', planned: monthlyExpenses, actual: actualThisMonth.expenses, good: (actual: number, planned: number) => actual <= planned },
              ].map(row => {
                const variance = row.actual - row.planned
                const pct = row.planned > 0 ? Math.round((row.actual / row.planned) * 100) : 0
                const isGood = row.good(row.actual, row.planned)
                return (
                  <div key={row.label} className="rounded-2xl border border-border bg-secondary p-4">
                    <p className="text-xs font-bold text-muted-foreground">{row.label}</p>
                    <div className="mt-2 flex items-end justify-between gap-3">
                      <div>
                        <p className="text-xl font-extrabold text-foreground">{money.formatDisplay(row.actual)}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">actual · planned {money.formatDisplay(row.planned)}</p>
                      </div>
                      <span className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-extrabold ${isGood ? 'bg-primary/10 text-primary' : 'bg-[#FF8388]/10 text-[#FF8388]'}`}>
                        {variance > 0 ? '+' : ''}{money.formatDisplay(Math.abs(variance))} {variance > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />} ({pct}%)
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
            {(monthlyIncome > 0 || monthlyExpenses > 0) && (
              <div>
                <p className="mb-2 text-xs text-muted-foreground">Visual comparison</p>
                <ResponsiveContainer width="100%" height={140}>
                  <BarChart
                    data={[
                      { name: 'Income', Planned: monthlyIncome, Actual: actualThisMonth.income },
                      { name: 'Expenses', Planned: monthlyExpenses, Actual: actualThisMonth.expenses },
                    ]}
                    barGap={4}
                    barCategoryGap="35%"
                  >
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ background: '#1a2236', border: '1px solid #2d3953', borderRadius: 10, fontSize: 12 }}
                      formatter={(v) => money.formatDisplay(typeof v === 'number' ? v : 0)}
                    />
                    <Bar dataKey="Planned" fill="#2d3953" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Actual" fill="#A9F5C7" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex items-center gap-4 text-xs font-bold text-muted-foreground">
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#2d3953]" />Planned</span>
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#A9F5C7]" />Actual</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-7">
        <Card>
          <CardHeader className="pb-0">
            <div className="flex items-center gap-3 mb-1">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-extrabold text-primary-foreground">1</span>
              <CardTitle className="text-xl">Income sources</CardTitle>
            </div>
            <p className="text-sm text-muted-foreground">How much money will come in?</p>
          </CardHeader>
          <CardContent className="space-y-4 p-5 sm:p-6">
            <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-[minmax(0,1fr)_minmax(120px,0.55fr)_minmax(120px,0.5fr)_auto]">
              <div>
                <Label className="text-xs text-muted-foreground">Income source</Label>
                <Input aria-label="Income source" className={`mt-2 bg-secondary transition-colors ${incomeError && !incomeSource.trim() ? 'border-[#FF8388]' : ''}`} value={incomeSource} onChange={event => setIncomeSource(event.target.value)} placeholder="Part-time work" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Income amount ({money.displayCurrency})</Label>
                <Input aria-label="Income amount" className={`mt-2 bg-secondary transition-colors ${incomeError && parseNumberInput(incomeAmount) <= 0 ? 'border-[#FF8388]' : ''}`} inputMode="decimal" value={incomeAmount} onChange={event => setIncomeAmount(formatNumberInput(event.target.value))} placeholder="0" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Period</Label>
                <select aria-label="Income period" className="mt-2 h-11 w-full rounded-md border border-input bg-secondary px-3 text-sm font-bold text-foreground outline-none" value={incomePeriod} onChange={event => setIncomePeriod(event.target.value as EstimatePeriod)}>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
              <Button onClick={addIncome} disabled={upsert.isPending}>Add</Button>
            </div>
            <ItemList
              items={incomeItems}
              empty="No income sources yet."
              fmt={money.formatDisplay}
              onDelete={(id, name) => setDeleteTarget({ list: 'income', id, name })}
              editingId={editItem?.list === 'income' ? editItem.id : null}
              editName={editName}
              editAmount={editAmount}
              editPeriod={editPeriod}
              onEditStart={id => startEditItem('income', id)}
              onEditNameChange={setEditName}
              onEditAmountChange={v => setEditAmount(formatNumberInput(v))}
              onEditPeriodChange={p => setEditPeriod(p as EstimatePeriod)}
              onEditSave={saveEditItem}
              onEditCancel={() => setEditItem(null)}
              displayCurrency={money.displayCurrency}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-0">
            <div className="flex items-center gap-3 mb-1">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-extrabold text-primary-foreground">2</span>
              <CardTitle className="text-xl">Expected expenses</CardTitle>
            </div>
            <p className="text-sm text-muted-foreground">What fixed expenses are expected this month?</p>
          </CardHeader>
          <CardContent className="space-y-4 p-5 sm:p-6">
            <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-[minmax(0,1fr)_minmax(120px,0.55fr)_minmax(120px,0.5fr)_auto]">
              <div>
                <Label className="text-xs text-muted-foreground">Expense detail</Label>
                <Input aria-label="Expense detail" className={`mt-2 bg-secondary transition-colors ${expenseError && !expenseDetail.trim() ? 'border-[#FF8388]' : ''}`} value={expenseDetail} onChange={event => setExpenseDetail(event.target.value)} placeholder="Apartment rent" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Expense amount ({money.displayCurrency})</Label>
                <Input aria-label="Expense amount" className={`mt-2 bg-secondary transition-colors ${expenseError && parseNumberInput(expenseAmount) <= 0 ? 'border-[#FF8388]' : ''}`} inputMode="decimal" value={expenseAmount} onChange={event => setExpenseAmount(formatNumberInput(event.target.value))} placeholder="0" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Period</Label>
                <select aria-label="Expense period" className="mt-2 h-11 w-full rounded-md border border-input bg-secondary px-3 text-sm font-bold text-foreground outline-none" value={expensePeriod} onChange={event => setExpensePeriod(event.target.value as EstimatePeriod)}>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
              <Button onClick={addExpense} disabled={upsert.isPending}>Add</Button>
            </div>
            <ItemList
              items={expenseItems}
              empty="No expected expenses yet."
              fmt={money.formatDisplay}
              onDelete={(id, name) => setDeleteTarget({ list: 'expense', id, name })}
              editingId={editItem?.list === 'expense' ? editItem.id : null}
              editName={editName}
              editAmount={editAmount}
              editPeriod={editPeriod}
              onEditStart={id => startEditItem('expense', id)}
              onEditNameChange={setEditName}
              onEditAmountChange={v => setEditAmount(formatNumberInput(v))}
              onEditPeriodChange={p => setEditPeriod(p as EstimatePeriod)}
              onEditSave={saveEditItem}
              onEditCancel={() => setEditItem(null)}
              displayCurrency={money.displayCurrency}
            />
          </CardContent>
        </Card>
      </div>
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]">
        <Card>
          <CardHeader className="pb-0">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-extrabold text-primary-foreground">3</span>
                  <CardTitle className="text-xl">Wishlist</CardTitle>
                </div>
                <p className="text-sm text-muted-foreground">What do you want to buy or save for?</p>
              </div>
              <p className="text-sm font-extrabold text-primary">{money.formatDisplay(wishlistTotal)}</p>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 p-5 sm:p-6">
            <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(110px,0.45fr)_minmax(120px,0.45fr)]">
              <div>
                <Label className="text-xs text-muted-foreground">Wishlist item</Label>
                <Input aria-label="Wishlist item" className="mt-2 bg-secondary" value={wishlistName} onChange={event => setWishlistName(event.target.value)} placeholder="e.g. new laptop, vacation, gadget" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Amount ({money.displayCurrency})</Label>
                <Input aria-label="Wishlist amount" className="mt-2 bg-secondary" inputMode="decimal" value={wishlistAmount} onChange={event => setWishlistAmount(formatNumberInput(event.target.value))} placeholder="0" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Type</Label>
                <select aria-label="Wishlist type" className="mt-2 h-11 w-full rounded-md border border-input bg-secondary px-3 text-sm font-bold text-foreground outline-none" value={wishlistType} onChange={event => setWishlistType(event.target.value)}>
                  <option value="Need">Need</option>
                  <option value="Want">Want</option>
                  <option value="Later">Later</option>
                  <option value="Work">Work</option>
                  <option value="Travel">Travel</option>
                  <option value="Gift">Gift</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs text-muted-foreground">Note</Label>
                <Input aria-label="Wishlist note" className="mt-2 bg-secondary" value={wishlistNote} onChange={event => setWishlistNote(event.target.value)} placeholder="What this is for" />
              </div>
              <Button onClick={addWishlistItem} disabled={upsert.isPending}>Add wishlist item</Button>
            </div>
            {wishlistItems.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {wishlistItems.map(item => (
                  editWishlistId === item.id ? (
                    <div key={item.id} className="space-y-2 rounded-2xl border border-primary/30 bg-secondary p-4">
                      <Input className="bg-card text-sm" value={editWishlistName} onChange={e => setEditWishlistName(e.target.value)} placeholder="Item name" />
                      <div className="flex gap-2">
                        <Input className="bg-card text-sm" inputMode="decimal" value={editWishlistAmount} onChange={e => setEditWishlistAmount(formatNumberInput(e.target.value))} placeholder="Amount" />
                        <select className="h-11 flex-1 rounded-md border border-input bg-card px-2 text-sm font-bold text-foreground outline-none" value={editWishlistType} onChange={e => setEditWishlistType(e.target.value)}>
                          {['Want','Need','Work','Travel','Gift'].map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <Input className="bg-card text-sm" value={editWishlistNote} onChange={e => setEditWishlistNote(e.target.value)} placeholder="Note" />
                      <div className="flex gap-2">
                        <Button size="sm" className="flex-1 gap-1" onClick={saveEditWishlist}><Check className="h-3.5 w-3.5" />Save</Button>
                        <Button size="sm" variant="secondary" onClick={() => setEditWishlistId(null)}><X className="h-3.5 w-3.5" /></Button>
                      </div>
                    </div>
                  ) : (
                  <div key={item.id} className="rounded-2xl border border-border bg-secondary p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-extrabold text-foreground">{item.name}</p>
                        <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-bold ${
                          item.type === 'Need' ? 'bg-primary/15 text-primary' :
                          item.type === 'Want' ? 'bg-[#FFCF73]/20 text-[#FFCF73]' :
                          item.type === 'Later' ? 'bg-muted text-muted-foreground' :
                          item.type === 'Work' ? 'bg-[#93C5FD]/20 text-[#93C5FD]' :
                          item.type === 'Travel' ? 'bg-[#C4AEFF]/20 text-[#C4AEFF]' :
                          item.type === 'Gift' ? 'bg-[#FADBEA]/50 text-[#FADBEA]' :
                          'bg-secondary text-muted-foreground'
                        }`}>{item.type}</span>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-primary" onClick={() => convertToGoal(item)} aria-label="Convert to goal" disabled={addGoal.isPending}><Target className="h-4 w-4" /></button>
                        <button className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => startEditWishlist(item.id)} aria-label="Edit"><Pencil className="h-4 w-4" /></button>
                        <button className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-[#FF8388]" onClick={() => setDeleteTarget({ list: 'wishlist', id: item.id, name: item.name })} aria-label="Remove"><X className="h-4 w-4" /></button>
                      </div>
                    </div>
                    <p className="mt-3 text-lg font-extrabold text-primary">{money.formatDisplay(item.amount)}</p>
                    {monthlyIncome > monthlyExpenses && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Save {Math.ceil(item.amount / (monthlyIncome - monthlyExpenses))} month{Math.ceil(item.amount / (monthlyIncome - monthlyExpenses)) !== 1 ? 's' : ''} of surplus ({money.formatDisplay(monthlyIncome - monthlyExpenses)}/mo)
                      </p>
                    )}
                    {item.note && <p className="mt-2 text-sm text-muted-foreground">{item.note}</p>}
                  </div>
                  )
                ))}
              </div>
            ) : (
              <p className="rounded-2xl border border-border bg-secondary p-4 text-sm text-muted-foreground">No wishlist items yet.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-xl">Plan notes</CardTitle>
            <p className="text-sm text-muted-foreground">Add anything that could change the estimate.</p>
          </CardHeader>
          <CardContent className="space-y-4 p-5 sm:p-6">
            <div>
              <Label className="text-xs text-muted-foreground">Notes</Label>
              <textarea
                aria-label="Notes"
                className="mt-2 min-h-[160px] w-full resize-y rounded-2xl border border-input bg-secondary px-4 py-3 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                value={notes}
                onChange={event => setNotes(event.target.value)}
                placeholder="Optional notes"
              />
            </div>
            <Button className="w-full" onClick={handleSave} disabled={upsert.isPending}>
              {upsert.isPending ? 'Saving...' : 'Save plan'}
            </Button>
          </CardContent>
        </Card>
      </div>
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={deleteTarget ? `Delete ${deleteTarget.name}?` : ''}
        description="This removes the item from this estimate only."
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDeleteSelected}
      />
      <ConfirmDialog
        open={showClearConfirm}
        title="Clear all plan data?"
        description="This will remove all income sources, expenses, and wishlist items from this plan. Notes will also be cleared."
        onCancel={() => setShowClearConfirm(false)}
        onConfirm={handleClearAll}
      />
    </div>
  )
}

function ItemList({ items, empty, fmt, onDelete, editingId, editName, editAmount, editPeriod, onEditStart, onEditNameChange, onEditAmountChange, onEditPeriodChange, onEditSave, onEditCancel, displayCurrency }: {
  items: { id: string; name: string; amount: number; period: EstimatePeriod }[]
  empty: string
  fmt: (amount: number) => string
  onDelete: (id: string, name: string) => void
  editingId: string | null
  editName: string
  editAmount: string
  editPeriod: EstimatePeriod
  onEditStart: (id: string) => void
  onEditNameChange: (v: string) => void
  onEditAmountChange: (v: string) => void
  onEditPeriodChange: (v: string) => void
  onEditSave: () => void
  onEditCancel: () => void
  displayCurrency: string
}) {
  if (items.length === 0) return <p className="rounded-2xl border border-border bg-secondary p-4 text-sm text-muted-foreground">{empty}</p>

  return (
    <div className="space-y-2">
      {items.map(item => (
        editingId === item.id ? (
          <div key={item.id} className="space-y-2 rounded-2xl border border-primary/30 bg-secondary px-4 py-3">
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(100px,0.5fr)_minmax(100px,0.45fr)_auto_auto] items-center gap-2">
              <Input className="h-11 bg-card text-sm" value={editName} onChange={e => onEditNameChange(e.target.value)} placeholder="Name" />
              <Input className="h-11 bg-card text-sm" inputMode="decimal" value={editAmount} onChange={e => onEditAmountChange(e.target.value)} placeholder="Amount" />
              <select className="h-11 rounded-md border border-input bg-card px-2 text-xs font-bold text-foreground outline-none" value={editPeriod} onChange={e => onEditPeriodChange(e.target.value)}>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
              <button aria-label="Save" className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground" onClick={onEditSave}><Check className="h-4 w-4" /></button>
              <button aria-label="Cancel" className="flex h-11 w-11 items-center justify-center rounded-lg bg-secondary text-muted-foreground hover:text-foreground border border-border" onClick={onEditCancel}><X className="h-4 w-4" /></button>
            </div>
            <p className="text-xs text-muted-foreground">Editing · amounts in {displayCurrency}</p>
          </div>
        ) : (
        <div key={item.id} className="flex items-center justify-between rounded-2xl border border-border bg-secondary px-4 py-3">
          <div>
            <p className="font-bold text-foreground">{item.name}</p>
            <p className="text-xs capitalize text-muted-foreground">{item.period}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-foreground">{fmt(item.amount)}</span>
            <button className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => onEditStart(item.id)} aria-label="Edit"><Pencil className="h-4 w-4" /></button>
            <button className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-[#FF8388]" onClick={() => onDelete(item.id, item.name)} aria-label="Remove"><X className="h-4 w-4" /></button>
          </div>
        </div>
        )
      ))}
    </div>
  )
}
