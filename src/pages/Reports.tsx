import { useMemo, useState } from 'react'
import { useTransactions } from '@/lib/queries'
import { StatCard } from '@/components/shared/StatCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { formatCurrency, calculateSavingsRate } from '@/lib/stats'
import { ChevronDown, ChevronUp } from 'lucide-react'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const INSIGHTS = [
  { id: 'monthly', title: 'Monthly summary', badge: 'Ready to export', detail: 'Your monthly spending is consistent. May was your best month with the lowest discretionary spend across all categories.' },
  { id: 'tax', title: 'Tax prep', badge: '12 deductible items', detail: 'We found 12 potential deductible expenses including home office costs, online learning, and professional development subscriptions.' },
  { id: 'subscription', title: 'Subscription audit', badge: '3 possible cuts', detail: 'Netflix ($15), Spotify ($10), and one unused SaaS subscription total $35/month. Cutting these saves $420/year.' },
  { id: 'investment', title: 'Investment review', badge: 'Portfolio on track', detail: 'Your ETF contributions are on schedule. Continuing at $430/month at 7% return will reach the projected value in 7 years.' },
]

export function Reports() {
  const { data: transactions = [] } = useTransactions()
  const [openInsight, setOpenInsight] = useState<string | null>(null)

  const year = new Date().getFullYear()
  const yearTx = transactions.filter(t => t.date.startsWith(String(year)))

  const totalIncome = yearTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const totalExpenses = yearTx.filter(t => t.type !== 'income').reduce((s, t) => s + t.amount, 0)
  const savingsRate = calculateSavingsRate(totalIncome, totalExpenses)
  const avgMonthlySpend = Math.round(totalExpenses / 12)

  const topCategory = useMemo(() => {
    const map: Record<string, number> = {}
    yearTx.filter(t => t.type !== 'income').forEach(t => {
      map[t.category] = (map[t.category] || 0) + t.amount
    })
    return Object.entries(map).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'N/A'
  }, [yearTx])

  const monthlyData = useMemo(() =>
    MONTHS.map((name, i) => ({
      name,
      amount: yearTx
        .filter(t => t.type !== 'income' && new Date(t.date).getMonth() === i)
        .reduce((s, t) => s + t.amount, 0),
    })),
    [yearTx]
  )

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Understand patterns with annual summaries, exportable charts, and personal insights."
      />
      <div className="grid grid-cols-3 gap-4 mb-8">
        <StatCard label="Savings rate" value={`${savingsRate}%`} sub="Best month: March" badgeVariant="success" />
        <StatCard label="Avg. spend" value={formatCurrency(avgMonthlySpend)} sub="Down 6% from Q1" />
        <StatCard label="Top category" value={topCategory} sub="36% of total spending" />
      </div>
      <div className="grid grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Annual spending trend</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={monthlyData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748B' }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748B' }} />
                <Tooltip
                  contentStyle={{ background: '#131929', border: '1px solid #1E2A3A', borderRadius: 8 }}
                  formatter={(v: number) => [formatCurrency(v), 'Spent']}
                />
                <Bar dataKey="amount" fill="#6C63FF" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Insights library</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {INSIGHTS.map(insight => (
              <div key={insight.id} className="border border-border rounded-lg overflow-hidden">
                <button
                  className="w-full flex items-center justify-between p-3 text-left hover:bg-muted/20 transition-colors"
                  onClick={() => setOpenInsight(openInsight === insight.id ? null : insight.id)}
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{insight.title}</p>
                    <p className="text-xs text-muted-foreground">{insight.badge}</p>
                  </div>
                  {openInsight === insight.id
                    ? <ChevronUp size={14} className="text-muted-foreground shrink-0" />
                    : <ChevronDown size={14} className="text-muted-foreground shrink-0" />
                  }
                </button>
                {openInsight === insight.id && (
                  <div className="px-3 pb-3 pt-2 text-sm text-muted-foreground border-t border-border">
                    {insight.detail}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
