import { useState } from 'react'
import { useInvestmentConfig } from '@/lib/queries'
import { StatCard } from '@/components/shared/StatCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'
import { calculateProjectedValue, generateGrowthData } from '@/lib/investing'
import { formatCurrency } from '@/lib/stats'

export function Investing() {
  useInvestmentConfig()

  const [monthly, setMonthly] = useState(430)
  const [rate, setRate] = useState(7)
  const [years, setYears] = useState(7)

  const projected = calculateProjectedValue(monthly, rate, years)
  const contributed = monthly * years * 12
  const gain = projected - contributed
  const growthData = generateGrowthData(monthly, rate, years)

  return (
    <div>
      <PageHeader
        title="Investing"
        subtitle="Simulate monthly contributions, expected returns, and long-term compound growth."
      />
      <div className="grid grid-cols-3 gap-4 mb-8">
        <StatCard
          label="Projected portfolio"
          value={formatCurrency(Math.round(projected))}
          sub={`Estimated in ${years} years`}
          badgeVariant="success"
        />
        <StatCard
          label="Total contributed"
          value={formatCurrency(contributed)}
          sub={`${formatCurrency(monthly)}/month × ${years * 12} months`}
        />
        <StatCard
          label="Total gain"
          value={formatCurrency(Math.round(gain))}
          badge={`${rate}% annual return`}
          badgeVariant={gain > 0 ? 'success' : 'default'}
        />
      </div>
      <div className="grid grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Growth simulation</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={growthData} margin={{ top: 5, right: 10, left: -5, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E2A3A" />
                <XAxis
                  dataKey="year"
                  tick={{ fontSize: 11, fill: '#64748B' }}
                  label={{ value: 'Years', position: 'insideBottomRight', offset: -5, fill: '#64748B', fontSize: 11 }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#64748B' }}
                  tickFormatter={v => `$${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  contentStyle={{ background: '#131929', border: '1px solid #1E2A3A', borderRadius: 8 }}
                  formatter={(v: number, name: string) => [
                    formatCurrency(v),
                    name === 'value' ? 'Portfolio value' : 'Contributed',
                  ]}
                />
                <Legend formatter={v => v === 'value' ? 'Portfolio value' : 'Contributed'} wrapperStyle={{ fontSize: 12, color: '#64748B' }} />
                <Line type="monotone" dataKey="value" stroke="#6C63FF" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="contributed" stroke="#22C55E" strokeWidth={2} dot={false} strokeDasharray="5 5" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Investment ROI simulator</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {[
              { label: 'Monthly contribution ($)', value: monthly, setter: setMonthly },
              { label: 'Annual return rate (%)', value: rate, setter: setRate },
              { label: 'Duration (years)', value: years, setter: setYears },
            ].map(({ label, value, setter }) => (
              <div key={label}>
                <Label className="text-sm text-muted-foreground">{label}</Label>
                <Input
                  type="number"
                  value={value}
                  onChange={e => setter(Number(e.target.value))}
                  className="mt-1 bg-background border-border"
                  min={0}
                />
              </div>
            ))}
            <div className="p-3 bg-background rounded-lg border border-border mt-2">
              <p className="text-xs text-muted-foreground mb-1">Final portfolio value</p>
              <p className="text-2xl font-bold text-primary">{formatCurrency(Math.round(projected))}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
