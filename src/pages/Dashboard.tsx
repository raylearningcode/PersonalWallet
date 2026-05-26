import { useMemo } from 'react'
import { useTransactions, useInvestmentConfig, useBudgetCategories } from '@/lib/queries'
import { StatCard } from '@/components/shared/StatCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { formatCurrency, calculateSavingsRate } from '@/lib/stats'

export function Dashboard() {
  const { data: transactions = [] } = useTransactions()
  const { data: investConfig } = useInvestmentConfig()
  const { data: categories = [] } = useBudgetCategories()

  const year = new Date().getFullYear()
  const yearTx = transactions.filter(t => t.date.startsWith(String(year)))

  const totalIncome = useMemo(
    () => yearTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0),
    [yearTx]
  )
  const totalExpenses = useMemo(
    () => yearTx.filter(t => t.type !== 'income').reduce((s, t) => s + t.amount, 0),
    [yearTx]
  )
  const balance = totalIncome - totalExpenses
  const savingsRate = calculateSavingsRate(totalIncome, totalExpenses)

  const spendingByCategory = useMemo(() => {
    const map: Record<string, number> = {}
    yearTx.filter(t => t.type !== 'income').forEach(t => {
      map[t.category] = (map[t.category] || 0) + t.amount
    })
    return Object.entries(map).map(([name, amount]) => ({
      name,
      amount,
      color: categories.find(c => c.name === name)?.color ?? '#6C63FF',
    }))
  }, [yearTx, categories])

  return (
    <div>
      <PageHeader
        title="Good morning, Rayhan"
        subtitle="Your yearly spending health, savings momentum, and investment progress."
      />
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard label="Total balance" value={formatCurrency(balance)} badge="+12.4% YoY" badgeVariant="success" />
        <StatCard label="Spent YTD" value={formatCurrency(totalExpenses)} badge="72% of yearly plan" />
        <StatCard label="Saved" value={formatCurrency(balance)} badge={`${savingsRate}% savings rate`} badgeVariant="success" />
        <StatCard
          label="Invested"
          value={formatCurrency(investConfig?.current_value ?? 0)}
          badge="ETF plan active"
        />
      </div>
      <div className="grid grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Investment path</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">Turn leftovers into future capital.</p>
            {investConfig && (
              <p className="text-sm text-foreground">
                Based on your current savings rate, invest around{' '}
                <span className="text-primary font-semibold">
                  {formatCurrency(investConfig.monthly_contribution)}/month
                </span>{' '}
                without touching your emergency fund.
              </p>
            )}
            {investConfig && (
              <p className="text-3xl font-bold text-primary mt-4">
                {formatCurrency(investConfig.current_value)}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Spending overview</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={spendingByCategory} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748B' }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748B' }} />
                <Tooltip
                  contentStyle={{ background: '#131929', border: '1px solid #1E2A3A', borderRadius: 8 }}
                  formatter={(v: number) => [formatCurrency(v), 'Spent']}
                />
                <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                  {spendingByCategory.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
