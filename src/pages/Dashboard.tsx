import { useEffect, useRef, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useIsDesktop } from '@/hooks/useIsDesktop'
import { useTransactions, useInvestmentConfig, useBudgetCategories, useAppSettings, useWallets, useRecurringRules, useGoals, useNetWorthSnapshots, useSaveNetWorthSnapshot } from '@/lib/queries'
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
import { getAiInsights, isAiConfigured, type InsightInput, type InsightResult } from '@/lib/ai'
import { computeStreak } from '@/lib/streak'
import { Sparkles, Loader2, TrendingUp, AlertTriangle, Lightbulb, Bell, Flame, X, ChevronRight } from 'lucide-react'

const DIGEST_KEY = 'finpath_ai_digest'
const DIGEST_MAX_AGE_MS = 7 * 86_400_000

/** Shared context builder for both manual insights and the weekly digest. */
function buildInsightInput(deps: {
  currency: string
  categories: ReturnType<typeof useBudgetCategories>['data']
  monthTx: ReturnType<typeof useTransactions>['data']
  daysLeft: number
  annualIncome: number
  annualSpent: number
  savingsRate: number
  netWorth: number
  cashBalance: number
  invested: number
  goals: ReturnType<typeof useGoals>['data']
}): InsightInput {
  const cats = deps.categories ?? []
  const tx = deps.monthTx ?? []
  const monthCategories = cats.map(c => {
    const spent = tx.filter(t => t.type !== 'income' && t.category === c.name).reduce((s, t) => s + t.amount, 0)
    return { name: c.name, spent, budget: c.budget_period === 'monthly' ? c.yearly_allocated : c.yearly_allocated / 12 }
  })
  const overBudget = monthCategories.filter(c => c.budget > 0 && c.spent > c.budget).map(c => ({ name: c.name, overage: c.spent - c.budget, pct: Math.round((c.spent / c.budget) * 100) }))
  return {
    currency: deps.currency,
    monthlyIncome: tx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0),
    monthlySpent: tx.filter(t => t.type !== 'income').reduce((s, t) => s + t.amount, 0),
    daysLeftInMonth: deps.daysLeft,
    annualIncome: deps.annualIncome,
    annualSpent: deps.annualSpent,
    savingsRate: deps.savingsRate,
    netWorth: deps.netWorth,
    cashBalance: deps.cashBalance,
    invested: deps.invested,
    categories: monthCategories,
    goals: (deps.goals ?? []).map(g => ({ name: g.name, current: g.current_amount, target: g.target_amount, pct: g.target_amount > 0 ? Math.round((g.current_amount / g.target_amount) * 100) : 0 })),
    overBudget,
  }
}

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
  const { data: snapshots = [] } = useNetWorthSnapshots()
  const saveSnapshot = useSaveNetWorthSnapshot()

  // ─── AI insights ──────────────────────────────────────────────────────
  const [aiInsights, setAiInsights] = useState<InsightResult[] | null>(null)
  const [loadingInsights, setLoadingInsights] = useState(false)
  const [insightsError, setInsightsError] = useState<string | null>(null)
  const [aiCardDismissed, setAiCardDismissed] = useState(() => safeGet('finpath_ai_dismissed') === '1')
  const [digestAuto, setDigestAuto] = useState(false)

  // ─── Weekly digest ─────────────────────────────────────────────────────
  // Once a week, when a Gemini key is configured and data exists: reuse the
  // cached digest if fresh, otherwise generate silently in the background.
  const digestAttemptedRef = useRef(false)
  useEffect(() => {
    if (digestAttemptedRef.current) return
    if (!isAiConfigured() || categories.length === 0 || transactions.length === 0) return
    digestAttemptedRef.current = true
    let cached: { at: number; insights: InsightResult[] } | null = null
    try { cached = JSON.parse(localStorage.getItem(DIGEST_KEY) ?? 'null') } catch { cached = null }
    if (cached && Date.now() - cached.at < DIGEST_MAX_AGE_MS) {
      if (cached.insights.length > 0) { setAiInsights(cached.insights); setDigestAuto(true) }
      return
    }
    ;(async () => {
      try {
        const insights = await getAiInsights(buildInsightInput({
          currency: money.displayCurrency, categories, monthTx, daysLeft,
          annualIncome, annualSpent, savingsRate, netWorth,
          cashBalance: [...walletBalances.values()].reduce((a, b) => a + b, 0),
          invested: investConfig?.current_value ?? 0,
          goals,
        }))
        try { localStorage.setItem(DIGEST_KEY, JSON.stringify({ at: Date.now(), insights })) } catch { /* ignore */ }
        if (insights.length > 0) { setAiInsights(insights); setDigestAuto(true) }
      } catch { /* silent — the manual Generate button still works */ }
    })()
  }, [categories.length, transactions.length])

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

  // ─── Net worth curve (last 6 months) ─────────────────────────────────
  // Anchored by stored monthly snapshots where they exist, back-projected
  // from today's net worth + monthly cashflow everywhere else — so the
  // curve builds automatically and stays accurate as history grows.
  const netWorthSeries = useMemo(() => {
    const now = new Date()
    const months: { key: string; label: string; value: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleDateString(undefined, { month: 'short' }),
        value: 0,
      })
    }
    const snapMap = new Map(snapshots.map(s => [s.month, Number(s.value)]))
    const flow = new Map<string, number>()
    for (const t of transactions) {
      if (t.is_system_generated) continue
      const delta = t.type === 'income' ? t.amount : t.type === 'expense' ? -t.amount : 0
      const key = t.date.slice(0, 7)
      flow.set(key, (flow.get(key) ?? 0) + delta)
    }
    let current = netWorth
    for (let i = months.length - 1; i >= 0; i--) {
      const snap = snapMap.get(months[i].key)
      if (snap !== undefined) current = snap
      months[i].value = current
      current -= flow.get(months[i].key) ?? 0
    }
    return months
  }, [transactions, netWorth, snapshots])

  // Keep this month's snapshot fresh (idempotent upsert; guests are a no-op)
  const lastSnapshotRef = useRef('')
  useEffect(() => {
    if (netWorth === 0 || transactions.length === 0) return
    const key = `${monthStr}:${netWorth}`
    if (lastSnapshotRef.current === key) return
    lastSnapshotRef.current = key
    saveSnapshot.mutate({ month: monthStr, value: netWorth })
  }, [netWorth, monthStr, transactions.length, saveSnapshot])
  const nwMin = Math.min(...netWorthSeries.map(m => m.value), 0)
  const nwMax = Math.max(...netWorthSeries.map(m => m.value), 1)
  const nwRange = Math.max(nwMax - nwMin, 1)

  // ─── AI handler ───────────────────────────────────────────────────────
  const handleGetInsights = async () => {
    setLoadingInsights(true)
    setInsightsError(null)
    try {
      setDigestAuto(false)
      const result = await getAiInsights(buildInsightInput({
        currency: money.displayCurrency, categories, monthTx, daysLeft,
        annualIncome, annualSpent, savingsRate, netWorth,
        cashBalance: [...walletBalances.values()].reduce((a, b) => a + b, 0),
        invested: investConfig?.current_value ?? 0,
        goals,
      }))
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
        <div className="mb-2 space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="mb-2 grid grid-cols-2 gap-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-[1.4rem] border border-border bg-card px-5 py-3">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-2 h-8 w-28" />
              <Skeleton className="mt-2 h-3 w-32" />
            </div>
          ))}
        </div>
        <div className="mb-2">
          <Skeleton className="h-[120px] w-full rounded-2xl" />
        </div>
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
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
      <div className="mb-2 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <StatCard label="Net worth" value={fmt(netWorth)} sub={investConfig?.current_value ? `${money.formatDisplay(investConfig.current_value)} invested` : 'No investments yet'} badgeVariant="success" />
        <StatCard label="This month" value={fmt(monthlySpent)} sub={monthlyIncome > 0 ? `of ${fmt(monthlyIncome)} income` : `${monthTx.length} transactions`} badgeVariant="warning" />
        <StatCard label="Safe to spend" value={fmt(safeToSpend)} sub={`${daysLeft} days left`} />
        <StatCard label="Savings rate" value={`${savingsRate}%`} sub={savingsRate >= 20 ? 'On track' : savingsRate >= 10 ? 'Could improve' : 'Needs attention'} badgeVariant={savingsRate >= 20 ? 'success' : savingsRate >= 10 ? 'warning' : 'danger'} />
      </div>

      {/* Review queue */}
      {reviewCount > 0 && (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-2xl border border-[#FFCF73]/30 bg-[#FFCF73]/5 px-5 py-3">
          <p className="text-sm"><span className="font-extrabold text-[#FFCF73]">{reviewCount} transaction{reviewCount !== 1 ? 's' : ''} need{reviewCount === 1 ? 's' : ''} review</span></p>
          <Button asChild size="sm" variant="secondary"><Link to="/transactions?filter=needs_review">Review</Link></Button>
        </div>
      )}

      {/* Streak */}
      {streak.current >= 3 && (
        <div className="mb-2 flex items-center gap-3 rounded-2xl border border-border bg-card px-5 py-3">
          <Flame className="h-5 w-5 text-[#FFCF73]" />
          <p className="text-sm"><span className="font-extrabold text-foreground">{streak.current}-day</span> <span className="text-muted-foreground">logging streak</span>{streak.longest > streak.current && <span className="text-muted-foreground"> · best: {streak.longest} days</span>}</p>
        </div>
      )}

      {/* Spending trend + net worth curve — side by side on desktop */}
      <div className="mb-2 lg:grid lg:grid-cols-2 lg:gap-2">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Spending trend</CardTitle>
          <span className="text-xs font-bold text-muted-foreground">last 7 days</span>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          {trendTotal === 0 ? (
            <p className="text-sm text-muted-foreground">No spending in the last 7 days.</p>
          ) : (
            <>
              <p className="text-sm font-extrabold text-foreground">{fmt(trendTotal)} total</p>
              <p className="mb-2 text-xs text-muted-foreground">{fmt(trendAvg)} avg / day</p>
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

      {/* Net worth curve */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Net worth</CardTitle>
          <span className="text-xs font-bold text-muted-foreground">last 6 months</span>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          {transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Log transactions to see your net worth curve.</p>
          ) : (
            <>
              <div className="mb-3 flex items-end gap-2">
                <span className="text-xl font-extrabold tabular-nums text-foreground">{fmt(netWorth)}</span>
                <span className="mb-1 text-xs text-muted-foreground">today</span>
              </div>
              <svg viewBox="0 0 300 84" className="h-24 w-full text-primary" role="img" aria-label={`Net worth over the last 6 months. ${fmt(netWorth)} today.`} preserveAspectRatio="none">
                <polyline
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  points={netWorthSeries.map((m, i) => {
                    const x = (i / (netWorthSeries.length - 1)) * 288 + 6
                    const y = 72 - ((m.value - nwMin) / nwRange) * 60
                    return `${x},${y}`
                  }).join(' ')}
                />
                {netWorthSeries.map((m, i) => {
                  const x = (i / (netWorthSeries.length - 1)) * 288 + 6
                  const y = 72 - ((m.value - nwMin) / nwRange) * 60
                  return (
                    <circle key={m.key} cx={x} cy={y} r="3" fill="currentColor" opacity="0.85">
                      <title>{`${m.label}: ${fmt(m.value)}`}</title>
                    </circle>
                  )
                })}
              </svg>
              <div className="flex justify-between text-[10px] font-bold text-muted-foreground">
                {netWorthSeries.map(m => (
                  <span key={m.key} className={m.key === netWorthSeries[netWorthSeries.length - 1].key ? 'text-foreground' : ''}>{m.label}</span>
                ))}
              </div>
            </>
          )}
          <span className="sr-only">
            {netWorthSeries.map(m => `${m.label}: ${fmt(m.value)}`).join('; ')}
          </span>
        </CardContent>
      </Card>
      </div>

      {/* Recent activity (first on mobile) + Budget health */}
      <div className="mb-2 grid grid-cols-1 items-start gap-2 lg:grid-cols-2">
        <Card className="order-1 lg:order-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Recent activity</CardTitle>
            <Link to="/transactions" className="text-xs font-bold text-primary hover:underline">View all <ChevronRight className="inline h-3 w-3" /></Link>
          </CardHeader>
          <CardContent className="space-y-1 px-5 pb-3">
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

        <div className="order-2 flex flex-col gap-2 lg:order-1">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Budget health</CardTitle>
            <Link to="/budget" className="text-xs font-bold text-primary hover:underline">View all <ChevronRight className="inline h-3 w-3" /></Link>
          </CardHeader>
          <CardContent className="space-y-3 px-5 pb-3">
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

        {/* Upcoming bills */}
        {upcomingBills.length > 0 && (
          <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Upcoming bills</CardTitle>
            <Link to="/subscriptions" className="text-xs font-bold text-primary hover:underline">Manage <ChevronRight className="inline h-3 w-3" /></Link>
          </CardHeader>
          <CardContent className="space-y-2 px-5 pb-3">
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
        </div>
      </div>

      {/* AI Insights — hidden on mobile until a key is configured (no dead-end card) */}
      {!aiCardDismissed && (isAiConfigured() || isDesktop) && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /><CardTitle className="text-lg">AI Insights</CardTitle>
                {digestAuto && <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-extrabold text-primary">Weekly digest · auto</span>}
              </div>
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
          <CardContent className="px-4 pb-3 sm:px-6">
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
