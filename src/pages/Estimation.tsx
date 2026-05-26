import { useState } from 'react'
import { useEstimationPlans, useUpsertEstimationPlan } from '@/lib/queries'
import { StatCard } from '@/components/shared/StatCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatCurrency, calculateSavingsRate } from '@/lib/stats'
import { toast } from 'sonner'

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]
const CURRENCIES = ['USD', 'IDR', 'EUR', 'GBP', 'JPY']

export function Estimation() {
  const { data: plans = [] } = useEstimationPlans()
  const upsert = useUpsertEstimationPlan()

  const [view, setView] = useState<'monthly' | 'yearly'>('monthly')
  const [currency, setCurrency] = useState('IDR')
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [year, setYear] = useState(new Date().getFullYear())
  const [income, setIncome] = useState(12800000)
  const [fixed, setFixed] = useState(4100000)
  const [variable, setVariable] = useState(3200000)
  const [notes, setNotes] = useState('')

  const multiplier = view === 'yearly' ? 12 : 1
  const saving = income - fixed - variable
  const savingsRate = calculateSavingsRate(income, fixed + variable)

  const handleSave = async () => {
    await upsert.mutateAsync({ month, year, estimated_income: income, fixed_expenses: fixed, variable_estimate: variable, currency, notes })
    toast.success('Estimation plan saved')
  }

  return (
    <div>
      <PageHeader
        title="Estimation planner"
        subtitle="Plan future months before they happen: income, fixed costs, expected spending, savings."
      />
      <div className="flex items-center gap-3 mb-6">
        <div className="flex bg-card border border-border rounded-lg p-1 gap-1">
          {(['monthly', 'yearly'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors capitalize ${
                view === v ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
        <Select value={currency} onValueChange={setCurrency}>
          <SelectTrigger className="w-28 bg-card border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Estimated income"
          value={formatCurrency(income * multiplier, currency)}
          sub={`${savingsRate}% saving rate`}
        />
        <StatCard label="Fixed expenses" value={formatCurrency(fixed * multiplier, currency)} sub="Rent, SaaS, utilities" />
        <StatCard label="Variable estimate" value={formatCurrency(variable * multiplier, currency)} sub="Food, transport, extras" />
        <StatCard
          label="Possible saving"
          value={formatCurrency(saving * multiplier, currency)}
          badge={`${savingsRate}% saving rate`}
          badgeVariant={saving > 0 ? 'success' : 'danger'}
        />
      </div>
      <div className="grid grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Income estimate</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm text-muted-foreground">Month</Label>
                <Select value={String(month)} onValueChange={v => setMonth(Number(v))}>
                  <SelectTrigger className="mt-1 bg-background border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => (
                      <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm text-muted-foreground">Year</Label>
                <Input
                  type="number" value={year}
                  onChange={e => setYear(Number(e.target.value))}
                  className="mt-1 bg-background border-border"
                />
              </div>
            </div>
            {[
              { label: `Estimated income (${currency})`, value: income, setter: setIncome },
              { label: `Fixed expenses (${currency})`, value: fixed, setter: setFixed },
              { label: `Variable estimate (${currency})`, value: variable, setter: setVariable },
            ].map(({ label, value, setter }) => (
              <div key={label}>
                <Label className="text-sm text-muted-foreground">{label}</Label>
                <Input
                  type="number" value={value}
                  onChange={e => setter(Number(e.target.value))}
                  className="mt-1 bg-background border-border"
                />
              </div>
            ))}
            <div>
              <Label className="text-sm text-muted-foreground">Notes (optional)</Label>
              <Input
                value={notes} onChange={e => setNotes(e.target.value)}
                className="mt-1 bg-background border-border"
                placeholder="Any notes for this month..."
              />
            </div>
            <Button onClick={handleSave} disabled={upsert.isPending} className="w-full">
              {upsert.isPending ? 'Saving...' : 'Save plan'}
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Past plans</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead>Period</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead className="text-right">Income</TableHead>
                  <TableHead className="text-right">Saving</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map(plan => (
                  <TableRow key={plan.id} className="border-border hover:bg-muted/10">
                    <TableCell className="text-foreground">{MONTHS[plan.month - 1]} {plan.year}</TableCell>
                    <TableCell className="text-muted-foreground">{plan.currency}</TableCell>
                    <TableCell className="text-right text-foreground">
                      {formatCurrency(plan.estimated_income, plan.currency)}
                    </TableCell>
                    <TableCell className="text-right text-green-400">
                      {formatCurrency(plan.estimated_income - plan.fixed_expenses - plan.variable_estimate, plan.currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
