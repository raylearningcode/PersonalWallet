import { useMemo, useState } from 'react'
import { useTransactions } from '@/lib/queries'
import { StatCard } from '@/components/shared/StatCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/currency'
import { calculateSavingsRate } from '@/lib/stats'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function Reports() {
  const { data: transactions = [] } = useTransactions()
  const [openInsight, setOpenInsight] = useState<string | null>(null)

  const year = new Date().getFullYear()
  const yearTx = transactions.filter(t => t.date.startsWith(String(year)))
  const hasData = yearTx.length > 0

  const totalIncome = yearTx.filter(t => t.type === 'income').reduce((sum, tx) => sum + tx.amount, 0)
  const totalExpenses = yearTx.filter(t => t.type !== 'income').reduce((sum, tx) => sum + tx.amount, 0)
  const savingsRate = calculateSavingsRate(totalIncome, totalExpenses)
  const avgMonthlySpend = Math.round(totalExpenses / 12)

  const categoryTotals = useMemo(() => {
    const map: Record<string, number> = {}
    yearTx.filter(t => t.type !== 'income').forEach(t => {
      map[t.category] = (map[t.category] || 0) + t.amount
    })
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [yearTx])
  const topCategory = categoryTotals[0]?.[0] ?? ''

  const monthlyData = MONTHS.map((name, index) => {
    const amount = yearTx
      .filter(tx => tx.type !== 'income' && new Date(tx.date).getMonth() === index)
      .reduce((sum, tx) => sum + tx.amount, 0)
    return { name, amount }
  })
  const maxMonthlySpend = Math.max(...monthlyData.map(month => month.amount), 1)

  const insights = [
    {
      id: 'monthly',
      title: 'Monthly summary',
      badge: hasData ? `${yearTx.length} transactions` : 'No data yet',
      detail: hasData ? `Total spending this year is ${formatCurrency(totalExpenses, 'IDR')}.` : 'Add transactions to generate a monthly summary.',
    },
    {
      id: 'category',
      title: 'Top category',
      badge: topCategory || 'Empty',
      detail: topCategory ? `${topCategory} is currently the largest expense category.` : 'No expense categories found yet.',
    },
    {
      id: 'saving',
      title: 'Savings review',
      badge: `${savingsRate}% rate`,
      detail: hasData ? `Current savings rate is ${savingsRate}%.` : 'No income or expense data yet.',
    },
  ]

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Understand patterns with annual summaries, exportable charts, and personal insights."
      />
      <div className="mb-11 grid grid-cols-3 gap-6">
        <StatCard label="Savings rate" value={`${savingsRate}%`} sub={hasData ? 'Based on current year' : 'No data yet'} badgeVariant="success" />
        <StatCard label="Avg. spend" value={formatCurrency(avgMonthlySpend, 'IDR')} sub="Monthly average" />
        <StatCard label="Top category" value={topCategory || 'Empty'} sub={hasData ? 'Highest expense category' : 'No spending yet'} badgeVariant="warning" />
      </div>
      <div className="grid grid-cols-[1.45fr_0.8fr] gap-8">
        <Card>
          <CardHeader><CardTitle className="text-xl">Annual spending trend</CardTitle></CardHeader>
          <CardContent className="flex h-[332px] items-end gap-8 px-9 pb-11">
            {monthlyData.map((month, index) => (
              <div
                key={month.name}
                className={`w-5 rounded-full ${index === new Date().getMonth() ? 'bg-[#93C5FD]' : 'bg-muted'}`}
                style={{ height: `${hasData ? Math.max(22, (month.amount / maxMonthlySpend) * 100) : 22}%` }}
                title={`${month.name}: ${formatCurrency(month.amount, 'IDR')}`}
              />
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-xl">Insights library</CardTitle></CardHeader>
          <CardContent className="space-y-8 px-8">
            {insights.map(insight => (
              <div key={insight.id}>
                <div className="flex items-center justify-between gap-4">
                  <button className="text-left" onClick={() => setOpenInsight(openInsight === insight.id ? null : insight.id)}>
                    <p className="font-bold text-foreground">{insight.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{insight.badge}</p>
                  </button>
                  <button
                    className="rounded-full border border-border px-4 py-1 text-xs text-muted-foreground"
                    onClick={() => setOpenInsight(openInsight === insight.id ? null : insight.id)}
                  >
                    Open
                  </button>
                </div>
                {openInsight === insight.id && <p className="mt-3 text-sm text-muted-foreground">{insight.detail}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
