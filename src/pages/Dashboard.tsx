import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTransactions, useInvestmentConfig, useBudgetCategories, useAppSettings, useWallets, useRecurringRules, useGoals, useAuthSession } from '@/lib/queries'
import { txAmountColor, txAmountSign } from '@/lib/currency'
import { StatCard } from '@/components/shared/StatCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { calculateSavingsRate } from '@/lib/stats'
import { useMoney } from '@/lib/currency'
import { isInBudgetPeriod } from '@/lib/budget'
import { getCategoryInsights, getDaysRemainingInMonth, getSafeToSpend, getWalletBalances } from '@/lib/financeOs'
import { getAiInsights, getGeminiKey, type InsightResult } from '@/lib/gemini'
import { computeStreak } from '@/lib/streak'
import { Sparkles, Loader2, TrendingUp, AlertTriangle, Lightbulb, Bell, Flame, X } from 'lucide-react'
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { Skeleton } from '@/components/ui/skeleton'

export function Dashboard() {
  const money = useMoney()
  const fmt = money.formatDisplay
  const [showDetails, setShowDetails] = useState(false)
  const { data: transactions = [], isPending: txPending } = useTransactions()
  const { data: investConfig } = useInvestmentConfig()
  const { data: categories = [], isPending: catPending } = useBudgetCategories()
  const { data: settings } = useAppSettings()
  const { data: wallets = [], isPending: walletPending } = useWallets()
  const { data: recurringRules = [] } = useRecurringRules()
  const { data: goals = [] } = useGoals()
  const { data: session } = useAuthSession()

  const year = new Date().getFullYear()
  const now = new Date()
  const hour = now.getHours()
  const { greeting, greetingSubtitle } = (() => {
    if (hour < 5)  return { greeting: 'Still awake?',             greetingSubtitle: 'Quick check before bed — the numbers can wait.' }
    if (hour < 7)  return { greeting: 'Early start!',             greetingSubtitle: "You're up before the world. Let's make it count." }
    if (hour < 12) return { greeting: 'Good morning',             greetingSubtitle: 'Your financial health at a glance.' }
    if (hour < 14) return { greeting: 'Midday check-in',          greetingSubtitle: "Halfway through the day — how's the spending?" }
    if (hour < 18) return { greeting: 'Good afternoon',           greetingSubtitle: 'Your financial health at a glance.' }
    if (hour < 21) return { greeting: 'Good evening',             greetingSubtitle: 'See how today went.' }
    if (hour < 23) return { greeting: 'Winding down?',            greetingSubtitle: 'Good time to review the day before you rest.' }
    return                { greeting: 'Burning the midnight oil?', greetingSubtitle: "Don't let the budget keep you up." }
  })()
  const yearTx = transactions.filter(t => t.date.startsWith(String(year)))

  const monthlyTx = useMemo(
    () =>
      yearTx.filter(t => {
        const d = new Date(t.date)
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [yearTx]
  )

  const totalIncome = useMemo(
    () => yearTx.filter(t => t.type === 'income').reduce((sum, tx) => sum + tx.amount, 0),
    [yearTx]
  )
  const totalExpenses = useMemo(
    () => yearTx.filter(t => t.type !== 'income' && t.type !== 'transfer').reduce((sum, tx) => sum + tx.amount, 0),
    [yearTx]
  )
  const monthlyIncome = useMemo(
    () => monthlyTx.filter(t => t.type === 'income').reduce((sum, tx) => sum + tx.amount, 0),
    [monthlyTx]
  )
  const monthlySpent = useMemo(
    () => monthlyTx.filter(t => t.type !== 'income' && t.type !== 'transfer').reduce((sum, tx) => sum + tx.amount, 0),
    [monthlyTx]
  )

  const savingsRate = calculateSavingsRate(totalIncome, totalExpenses)
  const invested = investConfig?.current_value ?? 0
  const monthlyContribution = investConfig?.monthly_contribution ?? 0
  const walletBalances = getWalletBalances(wallets, transactions)
  const cashBalance = [...walletBalances.values()].reduce((sum, amount) => sum + amount, 0)
  const netWorth = cashBalance + invested

  const reviewCount = useMemo(() => transactions.filter(t => t.needs_review).length, [transactions])

  const cashBalanceHistory = useMemo(() => {
    const now = new Date()
    const walletBase = wallets.reduce((sum, w) => sum + (w.balance ?? 0), 0)
    return Array.from({ length: 12 }, (_, i) => {
      const monthOffset = 11 - i
      const mEnd = new Date(now.getFullYear(), now.getMonth() - monthOffset + 1, 0)
      const mEndStr = mEnd.toISOString().slice(0, 10)
      const balance = walletBase + transactions
        .filter(t => t.date <= mEndStr)
        .reduce((sum, t) => {
          if (t.type === 'income') return sum + t.amount
          if (t.type !== 'transfer') return sum - t.amount
          return sum
        }, 0)
      return {
        label: new Date(now.getFullYear(), now.getMonth() - monthOffset, 1)
          .toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }),
        amount: balance,
      }
    })
  }, [wallets, transactions])

  const spendingByCategory = useMemo(() => {
    const map: Record<string, number> = {}
    yearTx.filter(t => t.type !== 'income' && t.type !== 'transfer').forEach(t => {
      map[t.category] = (map[t.category] || 0) + t.amount
    })
    return Object.entries(map).map(([name, amount]) => ({
      name,
      amount,
      color: categories.find(c => c.name === name)?.color ?? '#A9F5C7',
    }))
  }, [yearTx, categories])

  const topSpending = spendingByCategory.reduce(
    (top, item) => item.amount > top.amount ? item : top,
    { name: '', amount: 0, color: '#2D3953' }
  )
  const totalCategorySpend = spendingByCategory.reduce((sum, item) => sum + item.amount, 0)
  const spendingOverviewRows = (spendingByCategory.length > 0
    ? [...spendingByCategory].sort((a, b) => b.amount - a.amount).slice(0, 5)
    : []
  ).map(item => ({
    ...item,
    pct: totalCategorySpend > 0 ? Math.round((item.amount / totalCategorySpend) * 100) : 0,
  }))

  const categoryRows = categories
    .filter(category => category.yearly_allocated > 0)
    .slice(0, 4)
    .map(category => {
      const spent = yearTx
        .filter(tx => tx.type !== 'income' && tx.type !== 'transfer' && tx.category === category.name && isInBudgetPeriod(tx.date, category.budget_period ?? 'yearly'))
        .reduce((sum, tx) => sum + tx.amount, 0)
      const pct = category.yearly_allocated > 0 ? Math.min(100, Math.round((spent / category.yearly_allocated) * 100)) : 0
      return { ...category, spent, pct }
    })

  const monthlyBudget = categories
    .filter(category => category.budget_period === 'monthly')
    .reduce((sum, category) => sum + category.yearly_allocated, 0)

  const daysLeft = getDaysRemainingInMonth()
  const safeToSpend = getSafeToSpend(monthlyBudget, monthlySpent, daysLeft)
  const categoryInsights = getCategoryInsights(transactions, categories).slice(0, 3)

  const isNewUser = !session && transactions.length === 0 && categories.length === 0 && wallets.length === 0

  const streak = useMemo(() => computeStreak(transactions.map(t => t.date)), [transactions])
  const [aiCardDismissed, setAiCardDismissed] = useState(() => localStorage.getItem('finpath_ai_dismissed') === '1')

  const [aiInsights, setAiInsights] = useState<InsightResult[] | null>(null)
  const [loadingInsights, setLoadingInsights] = useState(false)
  const [insightsError, setInsightsError] = useState<string | null>(null)

  const handleGetInsights = async () => {
    setLoadingInsights(true)
    setInsightsError(null)
    try {
      const cats = categories.map(c => ({
        name: c.name,
        spent: monthlyTx.filter(t => t.type !== 'income' && t.type !== 'transfer' && t.category === c.name).reduce((s, t) => s + t.amount, 0),
        budget: c.yearly_allocated,
      }))
      const overBudget = cats
        .filter(c => c.budget > 0 && c.spent > c.budget)
        .map(c => ({ name: c.name, overage: c.spent - c.budget, pct: Math.round(((c.spent - c.budget) / c.budget) * 100) }))
      const goalsSummary = goals.map(g => ({
        name: g.name,
        current: g.current_amount,
        target: g.target_amount,
        pct: g.target_amount > 0 ? Math.min(100, Math.round((g.current_amount / g.target_amount) * 100)) : 0,
      }))
      const insights = await getAiInsights({
        currency: money.baseCurrency,
        monthlyIncome,
        monthlySpent,
        daysLeftInMonth: daysLeft,
        annualIncome: totalIncome,
        annualSpent: totalExpenses,
        savingsRate,
        netWorth,
        cashBalance,
        invested,
        categories: cats,
        goals: goalsSummary,
        overBudget,
      })
      setAiInsights(insights)
    } catch (err) {
      setInsightsError(err instanceof Error ? err.message : 'Failed to get insights')
    } finally {
      setLoadingInsights(false)
    }
  }

  const recentTransactions = useMemo(
    () => [...transactions].sort((a, b) => `${b.date}-${b.created_at ?? ''}`.localeCompare(`${a.date}-${a.created_at ?? ''}`)).slice(0, 5),
    [transactions]
  )

  const savingsRateVariant = savingsRate >= 20 ? 'success' : savingsRate > 0 ? 'warning' : 'danger'

  const topGoals = useMemo(
    () => goals
      .filter(g => g.current_amount < g.target_amount)
      .sort((a, b) => {
        const pctA = a.target_amount > 0 ? a.current_amount / a.target_amount : 0
        const pctB = b.target_amount > 0 ? b.current_amount / b.target_amount : 0
        return pctB - pctA
      })
      .slice(0, 3),
    [goals]
  )

  const upcomingBills = useMemo(
    () =>
      recurringRules
        .filter(r => r.active && r.type !== 'income')
        .sort((a, b) => a.next_due_date.localeCompare(b.next_due_date))
        .slice(0, 5),
    [recurringRules]
  )

  const overPaceInsight = categoryInsights.find(i => i.overPace) ?? null

  return (
    <div>
      <PageHeader
        title={`${greeting}${settings?.user_name ? `, ${settings.user_name}` : ''}`}
        subtitle={
          <>
            <span className="hidden sm:inline">{greetingSubtitle}</span>
            <span className="sm:hidden">See where your money goes.</span>
          </>
        }
      />

      {/* Onboarding banner for brand-new users */}
      {isNewUser && (
        <div className="mb-8 rounded-2xl border border-primary/20 bg-primary/5 p-5 sm:p-8">
          <p className="text-xs font-bold uppercase tracking-widest text-primary">Getting started</p>
          <h2 className="mt-2 text-xl font-extrabold text-foreground sm:text-2xl">Welcome to FinPath</h2>
          <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
            <span className="hidden sm:inline">Set up your profile in three steps to unlock personalised insights, budget health scores, and investment projections.</span>
            <span className="sm:hidden">Set up your wallet to start tracking spending and income.</span>
          </p>
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              { step: '1', label: 'Create categories', sub: 'Define spending buckets', to: '/budget' },
              { step: '2', label: 'Add a wallet', sub: 'Track where your money sits', to: '/settings' },
              { step: '3', label: 'Record a transaction', sub: 'Log income or expenses', to: '/transactions' },
            ].map(item => (
              <Link
                key={item.step}
                to={item.to}
                className="flex items-start gap-4 rounded-2xl border border-primary/20 bg-background px-4 py-4 transition-colors hover:border-primary/40"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary text-sm font-extrabold text-primary-foreground">{item.step}</span>
                <div>
                  <p className="font-extrabold text-foreground">{item.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{item.sub}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Review queue banner */}
      {reviewCount > 0 && (
        <div className="mb-6 flex items-center justify-between gap-4 rounded-2xl border border-[#FFCF73]/30 bg-[#FFCF73]/5 px-5 py-4">
          <div>
            <p className="text-sm font-extrabold text-[#FFCF73]">Needs review</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {reviewCount} transaction{reviewCount === 1 ? '' : 's'} need category confirmation
            </p>
          </div>
          <Button asChild size="sm" variant="secondary">
            <Link to="/transactions">Review now</Link>
          </Button>
        </div>
      )}

      {/* Hero stat cards — 2×2 on mobile, 4-col on desktop */}
      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-6">
        {(txPending || walletPending || catPending) ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-border bg-card p-4 sm:p-6">
              <Skeleton className="mb-3 h-3 w-20" />
              <Skeleton className="mb-2 h-7 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))
        ) : (
          <>
            <StatCard label="Net worth" value={fmt(netWorth)} sub={money.baseCurrency !== money.displayCurrency ? money.formatBase(netWorth) : 'Cash + investments'} badgeVariant="success" />
            <StatCard label="This month" value={fmt(monthlySpent)} sub={monthlyIncome > 0 ? `of ${fmt(monthlyIncome)} income` : daysLeft === 0 ? 'Month ends today' : `${daysLeft} days left`} badgeVariant="warning" />
            <StatCard label="Safe to spend" value={fmt(safeToSpend)} sub={daysLeft === 0 ? 'Month ends today' : daysLeft === 1 ? 'Based on budgets · last day' : `Based on budgets · ${daysLeft} days left`} />
            <StatCard label="Savings rate" value={`${savingsRate}%`} sub={money.baseCurrency !== money.displayCurrency ? money.formatBase(totalIncome - totalExpenses) : `${yearTx.length} transactions`} badgeVariant={savingsRateVariant} />
          </>
        )}
      </div>

      {/* Streak banner */}
      {streak.current >= 3 && (
        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-5 py-3">
          <Flame className="h-5 w-5 shrink-0 text-primary" />
          <div>
            <p className="text-sm font-extrabold text-primary">{streak.current}-day logging streak 🔥</p>
            <p className="text-xs text-muted-foreground">
              {streak.current === streak.longest ? 'Personal best!' : `Best: ${streak.longest} days`} · Keep recording daily to stay on track.
            </p>
          </div>
        </div>
      )}

      {/* ── MOBILE-ONLY: compact overview before toggle ── */}

      {/* Recent activity (mobile) */}
      {recentTransactions.length > 0 && (
        <div className="mb-6 lg:hidden">
          <div className="mb-3 flex items-center justify-between gap-4">
            <h2 className="text-lg font-extrabold text-foreground">Recent</h2>
            <Link to="/transactions" className="text-sm font-bold text-primary hover:underline">View all →</Link>
          </div>
          <div className="rounded-2xl border border-border bg-card">
            {recentTransactions.map((tx, i) => (
              <div
                key={tx.id}
                className={`flex items-center justify-between gap-4 px-4 py-3.5 ${i < recentTransactions.length - 1 ? 'border-b border-border' : ''}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-foreground">{tx.description}</p>
                  <p className="text-xs text-muted-foreground">{tx.category} · {tx.date}</p>
                </div>
                <span className={`shrink-0 text-sm font-extrabold ${txAmountColor(tx.amount, tx.type)}`}>
                  {txAmountSign(tx.amount, tx.type)}{fmt(tx.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Budget warning (mobile — 1 max) */}
      {overPaceInsight && (
        <div className="mb-6 lg:hidden">
          <div className="rounded-2xl border border-[#FFCF73]/30 bg-[#FFCF73]/5 p-4">
            <p className="text-xs font-bold text-[#FFCF73]">Over pace</p>
            <p className="mt-1 text-sm text-foreground">{overPaceInsight.message}</p>
          </div>
        </div>
      )}

      {/* Goals preview (mobile — compact) */}
      {topGoals.length > 0 && (
        <div className="mb-6 lg:hidden">
          <div className="mb-3 flex items-center justify-between gap-4">
            <h2 className="text-lg font-extrabold text-foreground">Goals</h2>
            <Link to="/goals" className="text-sm font-bold text-primary hover:underline">View all →</Link>
          </div>
          <div className="space-y-2">
            {topGoals.slice(0, 2).map(goal => {
              const pct = goal.target_amount > 0 ? Math.min(100, Math.round((goal.current_amount / goal.target_amount) * 100)) : 0
              return (
                <div key={goal.id} className="flex items-center gap-4 rounded-2xl border border-border bg-card px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-foreground">{goal.name}</p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: goal.color }} />
                    </div>
                  </div>
                  <span className="shrink-0 text-sm font-extrabold text-foreground">{pct}%</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Mobile expand toggle */}
      <div className="mb-6 flex justify-center lg:hidden">
        <button
          type="button"
          onClick={() => setShowDetails(v => !v)}
          className="rounded-full border border-border bg-secondary px-6 py-2.5 text-xs font-bold text-muted-foreground transition-colors hover:text-foreground"
        >
          {showDetails ? '▲ See less' : '▼ See full dashboard'}
        </button>
      </div>

      {/* ── EXTENDED CONTENT — always on desktop, behind toggle on mobile ── */}
      <div className={showDetails ? '' : 'hidden lg:block'}>

        {/* Quick actions */}
        {!isNewUser && (
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {[
              { label: 'Add transaction', sub: 'Log income or expense', to: '/transactions', color: '#A9F5C7' },
              { label: 'Add goal', sub: 'Track a target', to: '/goals', color: '#93C5FD' },
              { label: 'Add subscription', sub: 'Recurring payment', to: '/subscriptions', color: '#FADBEA' },
              { label: 'Budget', sub: 'Check limits', to: '/budget', color: '#FFD276' },
              { label: 'Reports', sub: 'See trends', to: '/reports', color: '#C4AEFF' },
            ].map(action => (
              <Link
                key={action.label}
                to={action.to}
                className="flex flex-col gap-1 rounded-2xl border border-border bg-secondary px-4 py-3 transition-colors hover:border-primary/30 hover:bg-primary/5"
              >
                <span className="h-2 w-6 rounded-full" style={{ backgroundColor: action.color }} />
                <span className="mt-1 text-sm font-extrabold text-foreground">{action.label}</span>
                <span className="text-xs text-muted-foreground">{action.sub}</span>
              </Link>
            ))}
          </div>
        )}

        {/* Investment path + Spending overview */}
        <div className="mb-10 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.8fr)] lg:gap-8">
          <Card>
            <CardHeader className="pb-0">
              <CardTitle className="text-base text-primary">Investment path</CardTitle>
            </CardHeader>
            <CardContent className="p-5 pt-3 sm:p-8 sm:pt-5">
              <p className="max-w-lg text-4xl font-extrabold leading-[0.98] text-foreground sm:text-[2.75rem]">
                Turn leftovers into future capital.
              </p>
              <p className="mt-5 max-w-lg text-sm leading-5 text-muted-foreground">
                {monthlyContribution > 0
                  ? `Your current plan is ${fmt(monthlyContribution)}/month.`
                  : 'Add a monthly contribution in Investing to start projecting your path.'}
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:mt-11 sm:flex-row">
                <Button asChild><Link to="/investing">Open planner</Link></Button>
                <Button asChild variant="secondary"><Link to="/investing">Adjust risk</Link></Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Spending overview</CardTitle>
              <p className="text-sm text-muted-foreground">Where your money is going this year</p>
            </CardHeader>
            <CardContent className="space-y-4 px-5 pb-6 sm:px-8">
              {spendingOverviewRows.length > 0 ? spendingOverviewRows.map(row => (
                <Link
                  key={row.name}
                  to={`/transactions?q=${encodeURIComponent(row.name)}`}
                  className="block space-y-2 rounded-xl px-2 py-1.5 transition-colors hover:bg-secondary/60"
                >
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate font-bold text-foreground">{row.name}</span>
                    <span className="shrink-0 font-extrabold text-foreground">{fmt(row.amount)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full" style={{ width: `${row.pct}%`, backgroundColor: row.color }} />
                  </div>
                </Link>
              )) : (
                <div className="rounded-2xl border border-border bg-secondary p-4 text-sm text-muted-foreground">
                  Add expenses to see which category is taking the biggest share.
                </div>
              )}
              <p className="break-words text-xl font-extrabold leading-none text-foreground sm:text-2xl">
                {topSpending.amount > 0 ? `${fmt(topSpending.amount)} ${topSpending.name}` : 'No spending this year'}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Budget health + Smart insights */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-7">
          <Card>
            <CardHeader><CardTitle className="text-xl">Budget health</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {categoryRows.length > 0 ? categoryRows.map(category => (
                <div key={category.id} className="space-y-2">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate text-muted-foreground">{category.name}</span>
                    <span className="shrink-0 font-bold text-foreground">{fmt(category.spent)}</span>
                    <span className={`shrink-0 text-xs font-bold ${category.pct >= 90 ? 'text-[#FF8388]' : category.pct >= 70 ? 'text-[#FFCF73]' : 'text-primary'}`}>
                      {category.pct}%
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${category.pct}%`,
                        backgroundColor: category.pct >= 90 ? '#FF8388' : category.pct >= 70 ? '#FFCF73' : category.color,
                      }}
                    />
                  </div>
                </div>
              )) : (
                <p className="text-sm text-muted-foreground">No budget categories yet.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-xl">Decision insights</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {topSpending.amount > 0 && (() => {
                const topPct = totalCategorySpend > 0 ? Math.round((topSpending.amount / totalCategorySpend) * 100) : 0
                const topCatBudget = categories.find(c => c.name === topSpending.name)
                const dailyAllowance = (topCatBudget && topCatBudget.yearly_allocated > topSpending.amount && daysLeft > 0)
                  ? (topCatBudget.yearly_allocated - topSpending.amount) / daysLeft
                  : null
                return (
                  <div className="rounded-2xl border border-border bg-secondary p-4">
                    <p className="text-xs font-bold text-muted-foreground">Top category</p>
                    <p className="mt-1 text-sm font-bold text-foreground">{topSpending.name} is your largest spending category this year.</p>
                    <p className="mt-1 text-xs text-muted-foreground">{fmt(topSpending.amount)} spent · {topPct}% of total spending</p>
                    {dailyAllowance !== null && (
                      <p className="mt-1 text-xs text-primary">You can spend ~{fmt(dailyAllowance)}/day on {topSpending.name} for the rest of this month</p>
                    )}
                  </div>
                )
              })()}
              <div className="rounded-2xl border border-border bg-secondary p-4">
                <p className="text-xs font-bold text-muted-foreground">Monthly cashflow</p>
                <p className="mt-2 text-2xl font-extrabold text-foreground">
                  {(() => {
                    const diff = monthlyIncome - monthlySpent
                    if (diff === 0) return <span className="text-foreground">{fmt(0)}</span>
                    return diff > 0
                      ? <span className="text-primary">+{fmt(diff)}</span>
                      : <span className="text-[#FF8388]">-{fmt(-diff)}</span>
                  })()}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {fmt(monthlyIncome)} in · {fmt(monthlySpent)} out this month
                </p>
              </div>
              {categoryInsights.filter(i => i.overPace).slice(0, 1).map(insight => (
                <div key={insight.category} className="rounded-2xl border border-[#FFCF73]/30 bg-[#FFCF73]/5 p-4">
                  <p className="text-xs font-bold text-[#FFCF73]">Over pace</p>
                  <p className="mt-1 text-sm text-foreground">{insight.message}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Cash balance history chart */}
        {!txPending && !walletPending && transactions.length > 0 && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-xl">Cash balance history</CardTitle>
              <p className="text-sm text-muted-foreground">12-month rolling view of your wallet cash balance</p>
            </CardHeader>
            <CardContent className="px-2 pb-4 sm:px-6">
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={cashBalanceHistory} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="balGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#A9F5C7" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#A9F5C7" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    cursor={{ stroke: 'rgba(169,245,199,0.2)', strokeWidth: 1 }}
                    contentStyle={{ background: '#1a2236', border: '1px solid #2d3953', borderRadius: 12, fontSize: 12 }}
                    formatter={(v) => [fmt(typeof v === 'number' ? v : 0), 'Cash balance']}
                  />
                  <Area type="monotone" dataKey="amount" stroke="#A9F5C7" fill="url(#balGrad)" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#A9F5C7' }} />
                </AreaChart>
              </ResponsiveContainer>
              <p className="mt-2 text-center text-xs text-muted-foreground">
                Cashflow this month: income {fmt(monthlyIncome)}, expenses {fmt(monthlySpent)}, net {monthlyIncome >= monthlySpent ? `+${fmt(monthlyIncome - monthlySpent)}` : `-${fmt(monthlySpent - monthlyIncome)}`}.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Net worth + Budget pace + Upcoming bills */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-7">
          <Card>
            <CardHeader><CardTitle className="text-xl">Net worth</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between gap-4 rounded-2xl bg-secondary p-4">
                <span className="text-sm text-muted-foreground">Wallet cash</span>
                <strong className="text-foreground">{fmt(cashBalance)}</strong>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-2xl bg-secondary p-4">
                <span className="text-sm text-muted-foreground">Invested</span>
                <strong className="text-foreground">{fmt(invested)}</strong>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-2xl border border-primary/20 bg-primary/5 p-4">
                <span className="text-sm font-bold text-foreground">Total</span>
                <strong className="text-primary">{fmt(netWorth)}</strong>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-xl">Budget pace alerts</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {categoryInsights.length > 0 ? categoryInsights.map(insight => (
                <div key={insight.category} className="rounded-2xl bg-secondary p-4">
                  <div className="flex items-center justify-between gap-4">
                    <p className="font-extrabold text-foreground">{insight.category}</p>
                    <p className={insight.overPace ? 'text-sm font-bold text-[#FFCF73]' : 'text-sm font-bold text-primary'}>
                      {insight.usedPct}%
                    </p>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{insight.message}</p>
                </div>
              )) : (
                <p className="rounded-2xl bg-secondary p-4 text-sm text-muted-foreground">Add budgets and transactions to see pace alerts.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Financial calendar</CardTitle>
              <p className="text-sm text-muted-foreground">Bills, renewals &amp; goal deadlines</p>
            </CardHeader>
            <CardContent className="space-y-2 px-4 pb-5 sm:px-6">
              {(() => {
                const today = new Date().toISOString().slice(0, 10)
                const in30 = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)
                const in90 = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10)
                const billEvents = upcomingBills
                  .filter(r => r.next_due_date <= in30)
                  .map(r => ({
                    date: r.next_due_date,
                    label: r.description,
                    sub: money.format(r.original_amount ?? r.amount, r.original_currency ?? money.baseCurrency),
                    kind: 'bill' as const,
                  }))
                const goalEvents = goals
                  .filter(g => g.deadline && g.deadline >= today && g.deadline <= in90 && g.current_amount < g.target_amount)
                  .map(g => ({
                    date: g.deadline!,
                    label: g.name,
                    sub: `${Math.round((g.current_amount / g.target_amount) * 100)}% saved`,
                    kind: 'goal' as const,
                  }))
                const events = [...billEvents, ...goalEvents].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 7)
                if (events.length === 0) return (
                  <p className="rounded-2xl bg-secondary p-4 text-sm text-muted-foreground">No upcoming events in the next 30 days.</p>
                )
                return events.map((ev, i) => {
                  const daysAway = Math.ceil((new Date(ev.date).getTime() - Date.now()) / 86_400_000)
                  return (
                    <div key={i} className={`flex items-center justify-between gap-3 rounded-2xl px-4 py-3 ${ev.kind === 'bill' ? 'bg-secondary' : 'bg-primary/5 border border-primary/10'}`}>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs">{ev.kind === 'bill' ? '💳' : '🎯'}</span>
                          <p className="truncate text-sm font-bold text-foreground">{ev.label}</p>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">{ev.date} · {ev.sub}</p>
                      </div>
                      <span className={`shrink-0 text-xs font-extrabold ${daysAway <= 0 ? 'text-[#FF8388]' : daysAway <= 3 ? 'text-[#FFCF73]' : 'text-muted-foreground'}`}>
                        {daysAway <= 0 ? 'Today' : daysAway === 1 ? 'Tomorrow' : `${daysAway}d`}
                      </span>
                    </div>
                  )
                })
              })()}
            </CardContent>
          </Card>
        </div>

        {/* AI Insights */}
        {(!aiCardDismissed || getGeminiKey() || aiInsights) && (
          <Card className="mt-6">
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <CardTitle className="text-xl">AI Insights</CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  {getGeminiKey() ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={handleGetInsights}
                      disabled={loadingInsights}
                      className="gap-2"
                    >
                      {loadingInsights ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      {aiInsights ? 'Refresh' : 'Generate'}
                    </Button>
                  ) : (
                    <Link to="/settings" className="text-xs font-bold text-primary hover:underline">
                      Set up free API key →
                    </Link>
                  )}
                  {!getGeminiKey() && !aiInsights && (
                    <button
                      type="button"
                      aria-label="Dismiss AI Insights card"
                      onClick={() => { localStorage.setItem('finpath_ai_dismissed', '1'); setAiCardDismissed(true) }}
                      className="rounded-full p-1 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                FinPath AI analyses your actual spending data — categories, budgets, goals, cashflow — and gives you sharp, personalised advice from a CFP/CFA perspective. Powered by the free Gemini API.
              </p>
            </CardHeader>
            <CardContent className="px-5 pb-6 sm:px-8">
              {!getGeminiKey() ? (
                <div className="space-y-3">
                  <div className="rounded-2xl border border-border bg-secondary p-4">
                    <p className="mb-3 text-xs font-bold text-muted-foreground uppercase tracking-wide">Sample insights — locked</p>
                    <div className="space-y-2">
                      {[
                        'Detect unusual spending patterns',
                        'Forecast your goal completion timeline',
                        'Recommend better budget limits based on your history',
                        'Generate your monthly financial summary',
                      ].map(text => (
                        <div key={text} className="flex items-center gap-2.5 rounded-xl bg-muted/30 px-3 py-2">
                          <span className="text-sm">🔒</span>
                          <span className="text-sm text-muted-foreground">{text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Set up your free Gemini API key in{' '}
                    <Link to="/settings" className="font-bold text-primary hover:underline">Settings</Link>
                    {' '}to unlock these insights.
                  </p>
                </div>
              ) : loadingInsights ? (
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  Analysing your finances…
                </div>
              ) : insightsError ? (
                <p className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400">{insightsError}</p>
              ) : aiInsights ? (
                <div className="space-y-3">
                  {aiInsights.map((insight, i) => {
                    const styles = {
                      warning:     { border: 'border-[#FFCF73]/30',  bg: 'bg-[#FFCF73]/5',   text: 'text-[#FFCF73]',   icon: <AlertTriangle className="h-4 w-4" />, label: 'Warning' },
                      alert:       { border: 'border-red-500/30',    bg: 'bg-red-500/5',      text: 'text-red-400',     icon: <Bell className="h-4 w-4" />,          label: 'Alert' },
                      opportunity: { border: 'border-primary/30',    bg: 'bg-primary/5',      text: 'text-primary',     icon: <TrendingUp className="h-4 w-4" />,     label: 'Opportunity' },
                      tip:         { border: 'border-border',        bg: 'bg-secondary',      text: 'text-muted-foreground', icon: <Lightbulb className="h-4 w-4" />, label: 'Tip' },
                    }
                    const s = styles[insight.type] ?? styles.tip
                    return (
                      <div key={i} className={`rounded-2xl border p-4 ${s.border} ${s.bg}`}>
                        <div className={`mb-1.5 flex items-center gap-1.5 text-xs font-bold ${s.text}`}>
                          {s.icon}
                          {s.label}
                        </div>
                        <p className="font-extrabold text-foreground">{insight.title}</p>
                        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{insight.detail}</p>
                      </div>
                    )
                  })}
                  <p className="text-right text-xs text-muted-foreground/60">Powered by Gemini 2.5 Flash-Lite</p>
                </div>
              ) : (
                <div className="rounded-2xl border border-border bg-secondary p-4 text-sm text-muted-foreground">
                  Hit <span className="font-bold text-primary">Generate</span> to get personalised insights based on this month's activity.
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Goals progress widget (desktop) */}
        {goals.length > 0 && (
          <div className="mt-6">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-xl font-extrabold text-foreground">Goals in progress</h2>
              <Link to="/goals" className="text-sm font-bold text-primary hover:underline">View all →</Link>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {topGoals.map(goal => {
                const pct = goal.target_amount > 0 ? Math.min(100, Math.round((goal.current_amount / goal.target_amount) * 100)) : 0
                return (
                  <div key={goal.id} className="relative overflow-hidden rounded-2xl border border-border bg-card p-5">
                    <div className="pointer-events-none absolute inset-y-0 left-0 w-1 rounded-l-[inherit]" style={{ backgroundColor: goal.color }} />
                    <p className="truncate font-extrabold text-foreground">{goal.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{goal.category}</p>
                    <div className="mt-3 flex items-end justify-between gap-2">
                      <p className="text-lg font-extrabold text-foreground">{fmt(goal.current_amount)}</p>
                      <p className="text-sm font-bold text-muted-foreground">{pct}%</p>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: goal.color }} />
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">Target: {fmt(goal.target_amount)}</p>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Recent activity (desktop) */}
        {recentTransactions.length > 0 && (
          <div className="mt-6">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-xl font-extrabold text-foreground">Recent activity</h2>
              <Link to="/transactions" className="text-sm font-bold text-primary hover:underline">View all →</Link>
            </div>
            <div className="rounded-2xl border border-border bg-card">
              {recentTransactions.map((tx, i) => (
                <div
                  key={tx.id}
                  className={`flex items-center justify-between gap-4 px-5 py-3.5 ${i < recentTransactions.length - 1 ? 'border-b border-border' : ''}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-foreground">{tx.description}</p>
                    <p className="text-xs text-muted-foreground">{tx.category} · {tx.date}</p>
                  </div>
                  <span className={`shrink-0 text-sm font-extrabold ${txAmountColor(tx.amount, tx.type)}`}>
                    {txAmountSign(tx.amount, tx.type)}{fmt(tx.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>{/* end extended content */}
    </div>
  )
}
