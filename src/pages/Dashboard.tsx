import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useTransactions, useInvestmentConfig, useBudgetCategories } from '@/lib/queries'
import { StatCard } from '@/components/shared/StatCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { calculateSavingsRate } from '@/lib/stats'
import { useCurrency } from '@/lib/currency'

export function Dashboard() {
  const fmt = useCurrency()
  const { data: transactions = [] } = useTransactions()
  const { data: investConfig } = useInvestmentConfig()
  const { data: categories = [] } = useBudgetCategories()

  const year = new Date().getFullYear()
  const yearTx = transactions.filter(t => t.date.startsWith(String(year)))

  const totalIncome = useMemo(
    () => yearTx.filter(t => t.type === 'income').reduce((sum, tx) => sum + tx.amount, 0),
    [yearTx]
  )
  const totalExpenses = useMemo(
    () => yearTx.filter(t => t.type !== 'income').reduce((sum, tx) => sum + tx.amount, 0),
    [yearTx]
  )
  const balance = totalIncome - totalExpenses
  const savingsRate = calculateSavingsRate(totalIncome, totalExpenses)
  const invested = investConfig?.current_value ?? 0
  const monthlyContribution = investConfig?.monthly_contribution ?? 0

  const spendingByCategory = useMemo(() => {
    const map: Record<string, number> = {}
    yearTx.filter(t => t.type !== 'income').forEach(t => {
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
  const categoryRows = categories
    .filter(category => category.yearly_allocated > 0)
    .slice(0, 3)
    .map(category => {
      const spent = yearTx
        .filter(tx => tx.type !== 'income' && tx.category === category.name)
        .reduce((sum, tx) => sum + tx.amount, 0)
      const pct = category.yearly_allocated > 0 ? Math.min(100, Math.round((spent / category.yearly_allocated) * 100)) : 0
      return { ...category, spent, pct }
    })

  return (
    <div>
      <PageHeader
        title="Good morning, Rayhan"
        subtitle="Your yearly spending health, savings momentum, and investment progress."
      />
      <div className="mb-9 grid grid-cols-2 gap-6 lg:grid-cols-4">
        <StatCard label="Total balance" value={fmt(balance)} sub={`${savingsRate}% savings rate`} badgeVariant="success" />
        <StatCard label="Spent YTD" value={fmt(totalExpenses)} sub={`${yearTx.length} transactions`} badgeVariant="warning" />
        <StatCard label="Saved" value={fmt(balance)} sub={`${savingsRate}% savings rate`} />
        <StatCard label="Invested" value={fmt(invested)} sub={invested > 0 ? 'Investment plan active' : 'No investment value yet'} badgeVariant="danger" />
      </div>
      <div className="mb-10 grid grid-cols-1 gap-8 lg:grid-cols-[1.45fr_0.8fr]">
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-base text-primary">Investment path</CardTitle>
          </CardHeader>
          <CardContent className="p-8 pt-5">
            <p className="max-w-lg text-[2.75rem] font-extrabold leading-[0.98] text-foreground">
              Turn leftovers into future capital.
            </p>
            <p className="mt-5 max-w-lg text-sm leading-5 text-muted-foreground">
              {monthlyContribution > 0
                ? `Your current plan is ${fmt(monthlyContribution)}/month.`
                : 'Add a monthly contribution in Investing to start projecting your path.'}
            </p>
            <div className="mt-11 flex gap-3">
              <Button asChild><Link to="/investing">Open planner</Link></Button>
              <Button asChild variant="secondary"><Link to="/investing">Adjust risk</Link></Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Spending overview</CardTitle>
          </CardHeader>
          <CardContent className="px-8 pb-6">
            <div className="flex h-[170px] items-end justify-between gap-3">
              {(spendingByCategory.length > 0 ? spendingByCategory : Array.from({ length: 6 }, (_, index) => ({
                name: `empty-${index}`,
                amount: 0,
                color: '#2D3953',
              }))).map(entry => (
                <div
                  key={entry.name}
                  className="w-5 rounded-full"
                  style={{
                    height: `${spendingByCategory.length > 0 ? Math.max(36, (entry.amount / Math.max(topSpending.amount, 1)) * 150) : 36}px`,
                    backgroundColor: entry.color,
                  }}
                />
              ))}
            </div>
            <p className="mt-[-4px] text-[1.7rem] font-extrabold leading-none text-foreground">
              {topSpending.amount > 0 ? `${fmt(topSpending.amount)} ${topSpending.name}` : fmt(0) + ' category'}
            </p>
          </CardContent>
        </Card>
      </div>
      <div className="grid grid-cols-1 gap-7 lg:grid-cols-[1fr_1.1fr]">
        <Card>
          <CardHeader><CardTitle className="text-xl">Budget categories</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {categoryRows.length > 0 ? categoryRows.map(category => (
              <div key={category.id} className="grid grid-cols-[1fr_100px_102px] items-center gap-4 text-sm">
                <span className="text-muted-foreground">{category.name}</span>
                <span className="font-bold text-foreground">{fmt(category.spent)}</span>
                <span className="h-2 rounded-full bg-muted">
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
