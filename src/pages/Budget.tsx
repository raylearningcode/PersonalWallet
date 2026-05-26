import { useMemo } from 'react'
import { useBudgetCategories, useBudgetRules, useTransactions } from '@/lib/queries'
import { StatCard } from '@/components/shared/StatCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/stats'
import { getOverspendRisk, getCategoryUsedPct } from '@/lib/budget'
import type { RiskLevel } from '@/lib/budget'

function ColorBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-2 bg-muted rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-300"
        style={{ width: `${Math.min(100, value)}%`, background: color }}
      />
    </div>
  )
}

const ruleColors: Record<string, string> = {
  cap: 'bg-blue-500/20 text-blue-400 border-0',
  minimum: 'bg-green-500/20 text-green-400 border-0',
  flexible: 'bg-yellow-500/20 text-yellow-400 border-0',
  emergency_months: 'bg-purple-500/20 text-purple-400 border-0',
}

const riskVariant: Record<RiskLevel, 'success' | 'warning' | 'danger'> = {
  Low: 'success', Medium: 'warning', High: 'danger',
}

export function Budget() {
  const { data: categories = [] } = useBudgetCategories()
  const { data: rules = [] } = useBudgetRules()
  const { data: transactions = [] } = useTransactions()

  const year = new Date().getFullYear()
  const yearExpenses = transactions.filter(
    t => t.type !== 'income' && t.date.startsWith(String(year))
  )

  const totalAllocated = useMemo(() => categories.reduce((s, c) => s + c.yearly_allocated, 0), [categories])
  const totalSpent = useMemo(() => yearExpenses.reduce((s, t) => s + t.amount, 0), [yearExpenses])
  const remaining = totalAllocated - totalSpent
  const risk = getOverspendRisk(remaining, totalAllocated)

  const categoriesWithSpent = useMemo(() =>
    categories.map(cat => ({
      ...cat,
      spent: yearExpenses
        .filter(t => t.category === cat.name)
        .reduce((s, t) => s + t.amount, 0),
    })),
    [categories, yearExpenses]
  )

  return (
    <div>
      <PageHeader
        title="Budget"
        subtitle="Design your yearly plan, control monthly limits, and see what is safe to spend."
      />
      <div className="grid grid-cols-3 gap-4 mb-8">
        <StatCard label="Yearly budget" value={formatCurrency(totalAllocated)} sub="Allocated across categories" />
        <StatCard label="Remaining" value={formatCurrency(remaining)} sub="Safe to spend this year" />
        <StatCard label="Overspend risk" value={risk} badgeVariant={riskVariant[risk]} badge={`${risk} risk level`} />
      </div>
      <div className="grid grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Category allocation</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {categoriesWithSpent.map(cat => {
              const pct = getCategoryUsedPct(cat.spent, cat.yearly_allocated)
              return (
                <div key={cat.id}>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="text-foreground">{cat.name}</span>
                    <span className="text-muted-foreground">{pct}% used</span>
                  </div>
                  <ColorBar value={pct} color={cat.color} />
                </div>
              )
            })}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Budget rules</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {rules.map(rule => (
              <div key={rule.id} className="flex items-center justify-between p-3 bg-background rounded-lg border border-border">
                <div>
                  <p className="text-sm font-medium text-foreground">{rule.name}</p>
                  <p className="text-xs text-muted-foreground">{rule.category}</p>
                </div>
                <Badge className={`text-xs ${ruleColors[rule.rule_type] ?? ''}`}>
                  {rule.rule_type.replace('_', ' ')}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
