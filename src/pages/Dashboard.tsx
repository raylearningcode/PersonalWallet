import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useIsDesktop } from '@/hooks/useIsDesktop'
import { useTransactions, useInvestmentConfig, useBudgetCategories, useAppSettings, useWallets, useRecurringRules, useGoals } from '@/lib/queries'
import { StatCard } from '@/components/shared/StatCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { calculateSavingsRate } from '@/lib/stats'
import { useMoney, txAmountColor, txAmountSign } from '@/lib/currency'
import { isInBudgetPeriod } from '@/lib/budget'
import { getWalletBalances } from '@/lib/financeOs'
import { safeGet, todayLocal, toLocalDateStr } from '@/lib/utils'
import { getAiInsights, isAiConfigured, type InsightResult } from '@/lib/ai'
import { computeStreak } from '@/lib/streak'
import { Sparkles, Loader2, TrendingUp, AlertTriangle, Lightbulb, Bell, Flame, X, ChevronRight } from 'lucide-react'

export function Dashboard() {
  const money = useMoney()
  const isDesktop = useIsDesktop()
  const fmt = money.formatDisplay
  const { data: transactions = [], isPending: txPending } = useTransactions()
  const { data: investConfig } = useInvestmentConfig()
  const { data: categories = [], isPending: catPending } = useBudgetCategories()
  const { data: settings } = useAppSettings()
  const { data: wallets = [] } = useWallets()
  const { data: recurringRules = [] } = useRecurringRules()
  const { data: goals = [] } = useGoals()

  // ─── AI insights ──────────────────────────────────────────────────────
  const [aiInsights, setAiInsights] = useState<InsightResult[] | null>(null)
  const [loadingInsights, setLoadingInsights] = useState(false)
  const [insightsError, setInsightsError] = useState<string | null>(null)
  const [aiCardDismissed, setAiCardDismissed] = useState(() => safeGet('finpath_ai_dismissed') === '1')

  // ─── Computed ─────────────────────────────────────────────────────────
  const walletBalances = useMemo(() => getWalletBalances(wallets, transactions), [wallets, transactions])
  const year = new Date().getFullYear()
  const now = new Date()
  const monthStr = `${year}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const yearTx = transactions.filter(t => t.date.startsWith(String(year)))
  const monthTx = transactions.filter(t => t.date.startsWith(monthStr))
  const monthlyIncome = monthTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const monthlySpent = monthTx.filter(t => t.type !== 'income').reduce((s, t) => s + t.amount, 0)
  const annualIncome = yearTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const annualSpent = yearTx.filter(t => t.type !== 'income').reduce((s, t) => s + t.amount, 0)
  const savingsRate = calculateSavingsRate(annualIncome, annualSpent)
  const netWorth = [...walletBalances.values()].reduce((a, b) => a + b, 0) + (investConfig?.current_value ?? 0)
  const reviewCount = transactions.filter(t => t.needs_review).length
  const streak = useMemo(() => computeStreak(transactions.map(t => t.date)), [transactions])
  const daysLeft = new Date(year, now.getMonth() + 1, 0).getDate() - now.getDate() + 1
  const safeToSpend = daysLeft > 0 ? (() => {
    // Yearly budgets count as a monthly share (/12); spending in unbudgeted
    // categories doesn't consume budgeted money.
    let budgetTotal = 0
    let spentInBudgeted = 0
    for (const c of categories) {
      const period = c.budget_period ?? 'monthly'
      const monthlyShare = period === 'yearly' ? c.yearly_allocated / 12 : c.yearly_allocated
      if (monthlyShare <= 0) continue
      budgetTotal += monthlyShare
      spentInBudgeted += monthTx
        .filter(t => t.type !== 'income' && t.category === c.name && isInBudgetPeriod(t.date, period))
        .reduce((s, t) => s + t.amount, 0)
    }
    return Math.max(0, budgetTotal - spentInBudgeted)
  })() : 0

  // Budget health
  const categoryHealth = categories.filter(c => c.yearly_allocated > 0).map(c => {
    const spent = monthTx.filter(t => t.type !== 'income' && t.category === c.name && isInBudgetPeriod(t.date, c.budget_period)).reduce((s, t) => s + t.amount, 0)
    const pct = c.yearly_allocated > 0 ? Math.min(100, Math.round((spent / c.yearly_allocated) * 100)) : 0
    return { ...c, spent, pct }
  }).sort((a, b) => b.pct - a.pct).slice(0, 10)

  // Upcoming bills
  const upcomingBills = recurringRules.filter(r => r.active && r.type !== 'income').sort((a, b) => a.next_due_date.localeCompare(b.next_due_date)).slice(0, 7)

  // Recent activity
  const recentTx = transactions.slice(0, 8)

  // ─── Spending trend (last 7 days) ────────────────────────────────────
  const trendDays = useMemo(() => {
    const days: { date: string; label: string; total: number }[] = []
    const today = new Date()
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i)
      days.push({ date: toLocalDateStr(d), label: d.toLocaleDateString(undefined, { weekday: 'narrow' }), total: 0 })
    }
    for (const t of transactions) {
      if (t.type === 'income' || t.type === 'transfer' || t.is_system_generated) continue
      const day = days.find(d => d.date === t.date)
      if (day) day.total += t.amount
    }
    return days
  }, [transactions])
  const trendTotal = trendDays.reduce((s, d) => s + d.total, 0)
  const trendAvg = trendTotal / 7
  const trendMax = Math.max(...trendDays.map(d => d.total))

  // ─── AI handler ───────────────────────────────────────────────────────
  const handleGetInsights = async () => {
    setLoadingInsights(true)
    setInsightsError(null)
    try {
      const monthCategories = categories.map(c => {
        const spent = monthTx.filter(t => t.type !== 'income' && t.category === c.name).reduce((s, t) => s + t.amount, 0)
        return { name: c.name, spent, budget: c.budget_period === 'monthly' ? c.yearly_allocated : c.yearly_allocated / 12 }
      })
      const overBudget = monthCategories.filter(c => c.budget > 0 && c.spent > c.budget).map(c => ({ name: c.name, overage: c.spent - c.budget, pct: Math.round((c.spent / c.budget) * 100) }))
      const result = await getAiInsights({
        currency: money.displayCurrency, monthlyIncome, monthlySpent: monthlySpent, daysLeftInMonth: daysLeft,
        annualIncome, annualSpent: annualSpent, savingsRate, netWorth,
        cashBalance: [...walletBalances.values()].reduce((a, b) => a + b, 0), invested: investConfig?.current_value ?? 0,
        categories: monthCategories, goals: goals.map(g => ({ name: g.name, current: g.current_amount, target: g.target_amount, pct: g.target_amount > 0 ? Math.round((g.current_amount / g.target_amount) * 100) : 0 })), overBudget,
      })
      setAiInsights(result)
    } catch (e) { setInsightsError(e instanceof Error ? e.message : 'Failed to generate insights') }
    finally { setLoadingInsights(false) }
  }

  // ─── Greeting ─────────────────────────────────────────────────────────
  const hour = now.getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const name = settings?.user_name || ''

  if (txPending || catPending) {
    return (
      <div>
        <div className="mb-6 space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-[1.4rem] border border-border bg-card px-6 py-5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-4 h-8 w-28" />
              <Skeleton className="mt-6 h-3 w-32" />
            </div>
          ))}
        </div>
        <div className="mb-6">
          <Skeleton className="h-[120px] w-full rounded-2xl" />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Skeleton className="h-[200px] w-full rounded-2xl" />
          <Skeleton className="h-[200px] w-full rounded-2xl" />
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title={`${greeting}${name ? `, ${name}` : ''}`} subtitle={`${fmt(netWorth)} net worth · ${savingsRate}% savings rate · ${reviewCount > 0 ? `${reviewCount} to review` : 'all reviewed'}`} />

      {/* Hero stat cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Net worth" value={fmt(netWorth)} sub={investConfig?.current_value ? `${money.formatDisplay(investConfig.current_value)} invested` : 'No investments yet'} badgeVariant="success" />
        <StatCard label="This month" value={fmt(monthlySpent)} sub={monthlyIncome > 0 ? `of ${fmt(monthlyIncome)} income` : `${monthTx.length} transactions`} badgeVariant="warning" />
        <StatCard label="Safe to spend" value={fmt(safeToSpend)} sub={`${daysLeft} days left`} />
        <StatCard label="Savings rate" value={`${savingsRate}%`} sub={savingsRate >= 20 ? 'On track' : savingsRate >= 10 ? 'Could improve' : 'Needs attention'} badgeVariant={savingsRate >= 20 ? 'success' : savingsRate >= 10 ? 'warning' : 'danger'} />
      </div>

      {/* Review queue */}
      {reviewCount > 0 && (
        <div className="mb-6 flex items-center justify-between gap-4 rounded-2xl border border-[#FFCF73]/30 bg-[#FFCF73]/5 px-5 py-3">
          <p className="text-sm"><span className="font-extrabold text-[#FFCF73]">{reviewCount} transaction{reviewCount !== 1 ? 's' : ''} need{reviewCount === 1 ? 's' : ''} review</span></p>
          <Button asChild size="sm" variant="secondary"><Link to="/transactions?filter=needs_review">Review</Link></Button>
        </div>
      )}

      {/* Streak */}
      {streak.current >= 3 && (
        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-border bg-card px-5 py-3">
          <Flame className="h-5 w-5 text-[#FFCF73]" />
          <p className="text-sm"><span className="font-extrabold text-foreground">{streak.current}-day</span> <span className="text-muted-foreground">logging streak</span>{streak.longest > streak.current && <span className="text-muted-foreground"> · best: {streak.longest} days</span>}</p>
        </div>
      )}

      {/* Spending trend */}
      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Spending trend</CardTitle>
          <span className="text-xs font-bold text-muted-foreground">last 7 days</span>
        </CardHeader>
        <CardContent className="px-5 pb-6">
          {trendTotal === 0 ? (
            <p className="text-sm text-muted-foreground">No spending in the last 7 days.</p>
          ) : (
            <>
              <p className="text-sm font-extrabold text-foreground">{fmt(trendTotal)} total</p>
              <p className="mb-4 text-xs text-muted-foreground">{fmt(trendAvg)} avg / day</p>
              <div className="relative flex h-24 items-end gap-2" role="img" aria-label={`Daily spending for the last 7 days. ${fmt(trendTotal)} total.`}>
                {trendDays.map(d => {
                  const pct = d.total > 0 ? Math.max(8, (d.total / trendMax) * 100) : 0
                  const isMax = d.total === trendMax
                  return (
                    <div key={d.date} className="relative flex h-full flex-1 items-end justify-center">
                      <div className="group relative w-full max-w-10" style={{ height: `${pct}%` }}>
                        {isMax && (
                          <span className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-bold text-foreground">
                            {fmt(d.total)}
                          </span>
                        )}
                        <div
                          className="h-full w-full rounded-t-md bg-[#FF8388] transition-opacity group-hover:opacity-75"
                          title={`${d.date} · ${fmt(d.total)}`}
                        />
                      </div>
                    </div>
                  )
                })}
                {/* 7-day average marker */}
                <div
                  className="pointer-events-none absolute inset-x-0 border-t border-dashed border-muted-foreground/40"
                  style={{ bottom: `${Math.min(100, (trendAvg / trendMax) * 100)}%` }}
                  aria-hidden="true"
                />
              </div>
              <div className="mt-1.5 flex gap-2">
                {trendDays.map(d => (
                  <span
                    key={d.date}
                    className={`flex-1 text-center text-[10px] font-bold ${d.date === todayLocal() ? 'text-foreground' : 'text-muted-foreground'}`}
                  >
                    {d.date === todayLocal() ? 'Today' : d.label}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-right text-[10px] text-muted-foreground">dashed line = 7-day average</p>
            </>
          )}
          <span className="sr-only">
            {trendDays.map(d => `${d.date}: ${fmt(d.total)}`).join('; ')}
          </span>
        </CardContent>
      </Card>

      {/* Recent activity (first on mobile) + Budget health */}
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="order-1 lg:order-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Recent activity</CardTitle>
            <Link to="/transactions" className="text-xs font-bold text-primary hover:underline">View all <ChevronRight className="inline h-3 w-3" /></Link>
          </CardHeader>
          <CardContent className="space-y-1 px-5 pb-5">
            {recentTx.length === 0 ? (
              <p className="text-sm text-muted-foreground">No transactions yet.</p>
            ) : recentTx.slice(0, 5).map(tx => (
              <Link key={tx.id} to="/transactions" className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-secondary transition-colors">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-foreground">{tx.description}</p>
                  <p className="text-xs text-muted-foreground">{tx.category} · {tx.date.slice(5)}</p>
                </div>
                <span className={`shrink-0 text-sm font-extrabold ${txAmountColor(tx.amount, tx.type)}`}>{txAmountSign(tx.amount, tx.type)}{fmt(tx.amount)}</span>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card className="order-2 lg:order-1">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Budget health</CardTitle>
            <Link to="/budget" className="text-xs font-bold text-primary hover:underline">View all <ChevronRight className="inline h-3 w-3" /></Link>
          </CardHeader>
          <CardContent className="space-y-3 px-5 pb-5">
            {categoryHealth.length === 0 ? (
              <p className="text-sm text-muted-foreground">No budget categories yet.</p>
            ) : categoryHealth.map(c => {
              const barColor = c.pct >= 90 ? '#ef4444' : c.pct >= 70 ? '#f59e0b' : c.color
              return (
                <div key={c.id}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-bold text-foreground">{c.name}</span>
                    <span className="text-muted-foreground">{fmt(c.spent)} / {fmt(c.yearly_allocated)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full transition-all" style={{ width: `${c.pct}%`, backgroundColor: barColor }} /></div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      </div>

      {/* Upcoming bills */}
      {upcomingBills.length > 0 && (
        <Card className="mb-6">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Upcoming bills</CardTitle>
            <Link to="/subscriptions" className="text-xs font-bold text-primary hover:underline">Manage <ChevronRight className="inline h-3 w-3" /></Link>
          </CardHeader>
          <CardContent className="space-y-2 px-5 pb-5">
            {upcomingBills.map(rule => (
              <div key={rule.id} className="flex items-center justify-between rounded-lg border border-border px-4 py-2.5">
                <div>
                  <p className="text-sm font-bold text-foreground">{rule.description}</p>
                  <p className="text-xs text-muted-foreground">Due {rule.next_due_date} · {rule.category}</p>
                </div>
                <span className="text-sm font-extrabold text-foreground">{money.formatTx({ amount: rule.amount, original_amount: rule.original_amount, original_currency: rule.original_currency, type: rule.type } as any)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* AI Insights — hidden on mobile until a key is configured (no dead-end card) */}
      {!aiCardDismissed && (isAiConfigured() || isDesktop) && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /><CardTitle className="text-lg">AI Insights</CardTitle></div>
              <div className="flex items-center gap-2">
                {isAiConfigured() ? (
                  <Button size="sm" variant="secondary" onClick={handleGetInsights} disabled={loadingInsights} className="gap-2">{loadingInsights ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{aiInsights ? 'Refresh' : 'Generate'}</Button>
                ) : <span className="text-xs text-muted-foreground">API not configured</span>}
                <button type="button" aria-label="Dismiss" onClick={() => {
                  try {
                    localStorage.setItem('finpath_ai_dismissed', '1')
                    setAiCardDismissed(true)
                  } catch (err) {
                    console.error('Failed to save AI dismissal:', err)
                  }
                }} className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary"><X className="h-4 w-4" /></button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-5 pb-6 sm:px-8">
            {!isAiConfigured() ? <p className="text-sm text-muted-foreground">AI insights are unavailable — API endpoint not configured.</p>
            : loadingInsights ? <div className="flex items-center gap-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin text-primary" />Analysing your finances…</div>
            : insightsError ? <p className="rounded-xl border border-[#FF8388]/20 bg-[#FF8388]/5 p-4 text-sm text-[#FF8388]">{insightsError}</p>
            : aiInsights ? (
              <div className="space-y-3">
                {aiInsights.map((insight, i) => {
                  const s = insight.type === 'warning' ? { border: 'border-[#FFCF73]/30', bg: 'bg-[#FFCF73]/5', text: 'text-[#FFCF73]', icon: <AlertTriangle className="h-4 w-4" />, label: 'Warning' }
                    : insight.type === 'alert' ? { border: 'border-[#FF8388]/30', bg: 'bg-[#FF8388]/5', text: 'text-[#FF8388]', icon: <Bell className="h-4 w-4" />, label: 'Alert' }
                    : insight.type === 'opportunity' ? { border: 'border-primary/30', bg: 'bg-primary/5', text: 'text-primary', icon: <TrendingUp className="h-4 w-4" />, label: 'Opportunity' }
                    : { border: 'border-border', bg: 'bg-secondary', text: 'text-muted-foreground', icon: <Lightbulb className="h-4 w-4" />, label: 'Tip' }
                  return (
                    <div key={i} className={`rounded-xl border p-4 ${s.border} ${s.bg}`}>
                      <div className={`mb-1.5 flex items-center gap-1.5 text-xs font-bold ${s.text}`}>{s.icon}{s.label}</div>
                      <p className="font-extrabold text-foreground">{insight.title}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{insight.detail}</p>
                    </div>
                  )
                })}
              </div>
            ) : <p className="text-sm text-muted-foreground">Hit <span className="font-bold text-primary">Generate</span> to get personalised insights.</p>}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
