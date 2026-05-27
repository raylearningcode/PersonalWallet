import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useTransactions, useInvestmentConfig, useBudgetCategories, useAppSettings } from '@/lib/queries'
import { StatCard } from '@/components/shared/StatCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { calculateSavingsRate } from '@/lib/stats'
import { useMoney } from '@/lib/currency'
import { isInBudgetPeriod } from '@/lib/budget'

export function Dashboard() {
  const money = useMoney()
  const fmt = money.formatDisplay
  const { data: transactions = [] } = useTransactions()
  const { data: investConfig } = useInvestmentConfig()
  const { data: categories = [] } = useBudgetCategories()
  const { data: settings } = useAppSettings()

  const year = new Date().getFullYear()
  const yearTx = transactions.filter(t => t.date.startsWith(String(year)))

  const totalIncome = useMemo(
    () => yearTx.filter(t => t.type === 'income').reduce((sum, tx) => sum + tx.amount, 0),
    [yearTx]
  )
  const totalExpenses = useMemo(
    () => yearTx.filter(t => t.type !== 'income' && t.type !== 'transfer').reduce((sum, tx) => sum + tx.amount, 0),
    [yearTx]
  )
  const balance = totalIncome - totalExpenses
  const savingsRate = calculateSavingsRate(totalIncome, totalExpenses)
  const invested = investConfig?.current_value ?? 0
  const monthlyContribution = investConfig?.monthly_contribution ?? 0

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
    .slice(0, 3)
    .map(category => {
      const spent = yearTx
        .filter(tx => tx.type !== 'income' && tx.type !== 'transfer' && tx.category === category.name && isInBudgetPeriod(tx.date, category.budget_period ?? 'yearly'))
        .reduce((sum, tx) => sum + tx.amount, 0)
      const pct = category.yearly_allocated > 0 ? Math.min(100, Math.round((spent / category.yearly_allocated) * 100)) : 0
      return { ...category, spent, pct }
    })

  return (
    <div>
      <PageHeader
        title={`Good morning${settings?.user_name ? `, ${settings.user_name}` : ''}`}
        subtitle="Your yearly spending health, savings momentum, and investment progress."
      />
      <div className="mb-9 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
        <StatCard label="Total balance" value={fmt(balance)} sub={money.baseCurrency !== money.displayCurrency ? money.formatBase(balance) : `${savingsRate}% savings rate`} badgeVariant="success" />
        <StatCard label="Spent YTD" value={fmt(totalExpenses)} sub={money.baseCurrency !== money.displayCurrency ? money.formatBase(totalExpenses) : `${yearTx.length} transactions`} badgeVariant="warning" />
        <StatCard label="Saved" value={fmt(balance)} sub={`${savingsRate}% savings rate`} />
        <StatCard label="Invested" value={fmt(invested)} sub={money.baseCurrency !== money.displayCurrency && invested > 0 ? money.formatBase(invested) : invested > 0 ? 'Investment plan active' : 'No investment value yet'} badgeVariant="danger" />
      </div>
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
            <p className="text-xs leading-5 text-muted-foreground">
              Purpose: this is a quick daily check for the category pulling the most money, so you know where to review before opening Reports.
            </p>
          </CardContent>
        </Card>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-7">
        <Card>
          <CardHeader><CardTitle className="text-xl">Budget categories</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {categoryRows.length > 0 ? categoryRows.map(category => (
              <div key={category.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-sm sm:grid-cols-[minmax(0,1fr)_100px_102px] sm:gap-4">
                <span className="text-muted-foreground">{category.name}</span>
                <span className="font-bold text-foreground">{fmt(category.spent)}</span>
                <span className="col-span-2 h-2 rounded-full bg-muted sm:col-span-1">
                  <span className="block h-full rounded-full" style={{ width: `${category.pct}%`, backgroundColor: category.color }} />
                </span>
              </div>
            )) : (
              <p className="text-sm text-muted-foreground">No budget categories yet.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-xl">Smart insight</CardTitle></CardHeader>
          <CardContent>
            <p className="max-w-lg text-sm leading-5 text-muted-foreground">
              {topSpending.amount > 0
                ? `${topSpending.name} is currently your largest spending category this year.`
                : 'No spending insight yet. Add transactions to generate one.'}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
