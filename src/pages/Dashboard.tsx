import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useTransactions, useInvestmentConfig, useBudgetCategories, useAppSettings, useWallets } from '@/lib/queries'
import { StatCard } from '@/components/shared/StatCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { calculateSavingsRate } from '@/lib/stats'
import { useMoney } from '@/lib/currency'
import { isInBudgetPeriod } from '@/lib/budget'
import { getCategoryInsights, getDaysRemainingInMonth, getSafeToSpend, getWalletBalances } from '@/lib/financeOs'

export function Dashboard() {
  const money = useMoney()
  const fmt = money.formatDisplay
  const { data: transactions = [] } = useTransactions()
  const { data: investConfig } = useInvestmentConfig()
  const { data: categories = [] } = useBudgetCategories()
  const { data: settings } = useAppSettings()
  const { data: wallets = [] } = useWallets()

  const year = new Date().getFullYear()
  const now = new Date()
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

  return (
    <div>
      <PageHeader
        title={`Good morning${settings?.user_name ? `, ${settings.user_name}` : ''}`}
        subtitle="Your financial health at a glance."
      />

      {/* Hero stat cards */}
      <div className="mb-9 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
        <StatCard
          label="Net worth"
          value={fmt(netWorth)}
          sub={money.baseCurrency !== money.displayCurrency ? money.formatBase(netWorth) : 'Cash + investments'}
          badgeVariant="success"
        />
        <StatCard
          label="This month"
          value={fmt(monthlySpent)}
          sub={monthlyIncome > 0 ? `of ${fmt(monthlyIncome)} income` : `${daysLeft} days remaining`}
          badgeVariant="warning"
        />
        <StatCard
          label="Safe to spend"
          value={fmt(safeToSpend)}
          sub={`Based on budgets · ${daysLeft}d left`}
        />
        <StatCard
          label="Savings rate"
          value={`${savingsRate}%`}
          sub={money.baseCurrency !== money.displayCurrency ? money.formatBase(totalIncome - totalExpenses) : `${yearTx.length} transactions`}
          badgeVariant="danger"
        />
      </div>

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
              <div key={row.name} className="space-y-2">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate font-bold text-foreground">{row.name}</span>
                  <span className="shrink-0 font-extrabold text-foreground">{fmt(row.amount)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full" style={{ width: `${row.pct}%`, backgroundColor: row.color }} />
                </div>
              </div>
            )) : (
              <div className="rounded-2xl border border-border bg-secondary p-4 text-sm text-muted-foreground">
                Add expenses to see which category is taking the biggest share.
              </div>
            )}
            <p className="break-words text-xl font-extrabold leading-none text-foreground sm:text-2xl">
              {topSpending.amount > 0 ? `${fmt(topSpending.amount)} ${topSpending.name}` : fmt(0) + ' category'}
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
          <CardHeader><CardTitle className="text-xl">Smart insights</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {topSpending.amount > 0 && (
              <div className="rounded-2xl border border-border bg-secondary p-4">
                <p className="text-xs font-bold text-muted-foreground">Top category</p>
                <p className="mt-1 text-sm text-foreground">
                  {topSpending.name} is your largest spending category this year.
                </p>
              </div>
            )}
            <div className="rounded-2xl border border-border bg-secondary p-4">
              <p className="text-xs font-bold text-muted-foreground">Monthly cashflow</p>
              <p className="mt-2 text-2xl font-extrabold text-foreground">
                {monthlyIncome > monthlySpent
                  ? <span className="text-primary">+{fmt(monthlyIncome - monthlySpent)}</span>
                  : <span className="text-[#FF8388]">-{fmt(monthlySpent - monthlyIncome)}</span>
                }
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

      {/* Net worth breakdown + Budget pace alerts */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-7">
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
      </div>
    </div>
  )
}
