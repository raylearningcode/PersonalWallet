import { useMemo, useState } from 'react'
import { useEstimationPlans, useUpsertEstimationPlan } from '@/lib/queries'
import { StatCard } from '@/components/shared/StatCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { calculateSavingsRate } from '@/lib/stats'
import { useCurrency } from '@/lib/currency'
import { toast } from 'sonner'

type EstimateItem = {
  id: string
  name: string
  amount: number
}

const parseNumber = (value: string) => {
  const parsed = Number(value.replace(/[^\d.]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

export function Estimation() {
  const fmt = useCurrency()
  const { data: plans = [] } = useEstimationPlans()
  const upsert = useUpsertEstimationPlan()

  const [view, setView] = useState<'monthly' | 'yearly'>('monthly')
  const [currency, setCurrency] = useState('IDR')
  const [incomeItems, setIncomeItems] = useState<EstimateItem[]>([])
  const [expenseItems, setExpenseItems] = useState<EstimateItem[]>([])
  const [incomeSource, setIncomeSource] = useState('')
  const [incomeAmount, setIncomeAmount] = useState('')
  const [expenseDetail, setExpenseDetail] = useState('')
  const [expenseAmount, setExpenseAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [wishlist, setWishlist] = useState('')

  const income = useMemo(() => incomeItems.reduce((sum, item) => sum + item.amount, 0), [incomeItems])
  const expenses = useMemo(() => expenseItems.reduce((sum, item) => sum + item.amount, 0), [expenseItems])
  const multiplier = view === 'yearly' ? 12 : 1
  const saving = income - expenses
  const savingsRate = calculateSavingsRate(income, expenses)
  const latestPlan = plans[0]

  const addIncome = () => {
    const amount = parseNumber(incomeAmount)
    if (!incomeSource.trim() || amount <= 0) return
    setIncomeItems(current => [...current, { id: crypto.randomUUID(), name: incomeSource.trim(), amount }])
    setIncomeSource('')
    setIncomeAmount('')
  }

  const addExpense = () => {
    const amount = parseNumber(expenseAmount)
    if (!expenseDetail.trim() || amount <= 0) return
    setExpenseItems(current => [...current, { id: crypto.randomUUID(), name: expenseDetail.trim(), amount }])
    setExpenseDetail('')
    setExpenseAmount('')
  }

  const handleSave = async () => {
    await upsert.mutateAsync({
      month: new Date().getMonth() + 1,
      year: new Date().getFullYear(),
      estimated_income: income,
      fixed_expenses: expenses,
      variable_estimate: 0,
      currency,
      notes: [
        notes,
        incomeItems.length ? `Income: ${incomeItems.map(item => `${item.name} ${fmt(item.amount)}`).join(', ')}` : '',
        expenseItems.length ? `Expenses: ${expenseItems.map(item => `${item.name} ${fmt(item.amount)}`).join(', ')}` : '',
      ].filter(Boolean).join('\n'),
    })
    toast.success('Estimation plan saved')
  }

  return (
    <div>
      <PageHeader
        title="Estimation planner"
        subtitle="Plan future months one item at a time: income sources, expected expenses, notes, and wishlist."
        action={(
          <div className="flex h-11 items-center gap-5 rounded-full border border-border bg-secondary px-6 text-sm">
            <span className="text-muted-foreground">Main currency</span>
            <input
              aria-label="Main currency"
              className="w-14 bg-transparent font-extrabold text-primary outline-none"
              value={currency}
              onChange={event => setCurrency(event.target.value.toUpperCase())}
            />
          </div>
        )}
      />
      <div className="mb-6 flex gap-3">
        {(['monthly', 'yearly'] as const).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`h-10 min-w-24 rounded-full px-6 text-sm capitalize transition-colors ${
              view === v ? 'bg-primary text-primary-foreground' : 'border border-border bg-secondary text-muted-foreground'
            }`}
          >
            {v}
          </button>
        ))}
      </div>
      <div className="mb-8 grid grid-cols-2 gap-6 lg:grid-cols-4">
        <StatCard label="Estimated income" value={fmt(income * multiplier)} sub={`${incomeItems.length} income items`} badgeVariant="success" />
        <StatCard label="Planned expenses" value={fmt(expenses * multiplier)} sub={`${expenseItems.length} expense items`} badgeVariant="warning" />
        <StatCard label="Possible saving" value={fmt(saving * multiplier)} sub={`${savingsRate}% saving rate`} />
        <StatCard label="Latest saved" value={fmt(latestPlan?.estimated_income ?? 0)} sub="Saved income estimate" />
      </div>
      <div className="mb-6 grid grid-cols-1 gap-7 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-xl">Income sources</CardTitle>
            <p className="text-sm text-muted-foreground">Add where money is expected to come from.</p>
          </CardHeader>
          <CardContent className="space-y-4 p-6">
            <div className="grid grid-cols-[1fr_0.65fr_auto] items-end gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Income source</Label>
                <Input aria-label="Income source" className="mt-2 bg-secondary" value={incomeSource} onChange={event => setIncomeSource(event.target.value)} placeholder="Part-time work" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Income amount</Label>
                <Input aria-label="Income amount" className="mt-2 bg-secondary" inputMode="decimal" value={incomeAmount} onChange={event => setIncomeAmount(event.target.value)} placeholder="0" />
              </div>
              <Button onClick={addIncome}>Add</Button>
            </div>
            <ItemList items={incomeItems} empty="No income sources yet." fmt={fmt} onDelete={id => setIncomeItems(current => current.filter(item => item.id !== id))} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-xl">Expected expenses</CardTitle>
            <p className="text-sm text-muted-foreground">Add rent, bills, subscriptions, food, trips, and other planned costs.</p>
          </CardHeader>
          <CardContent className="space-y-4 p-6">
            <div className="grid grid-cols-[1fr_0.65fr_auto] items-end gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Expense detail</Label>
                <Input aria-label="Expense detail" className="mt-2 bg-secondary" value={expenseDetail} onChange={event => setExpenseDetail(event.target.value)} placeholder="Apartment rent" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Expense amount</Label>
                <Input aria-label="Expense amount" className="mt-2 bg-secondary" inputMode="decimal" value={expenseAmount} onChange={event => setExpenseAmount(event.target.value)} placeholder="0" />
              </div>
              <Button onClick={addExpense}>Add</Button>
            </div>
            <ItemList items={expenseItems} empty="No expected expenses yet." fmt={fmt} onDelete={id => setExpenseItems(current => current.filter(item => item.id !== id))} />
          </CardContent>
        </Card>
      </div>
      <div className="mb-6 grid grid-cols-1 gap-4 rounded-[1.4rem] border border-border bg-card p-6 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
        <div>
          <Label className="text-xs text-muted-foreground">Notes</Label>
          <Input aria-label="Notes" className="mt-2 bg-secondary" value={notes} onChange={event => setNotes(event.target.value)} placeholder="Optional notes" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Wanted item list</Label>
          <Input aria-label="Wanted item list" className="mt-2 bg-secondary" value={wishlist} onChange={event => setWishlist(event.target.value)} placeholder="Add wanted items" />
        </div>
        <Button onClick={handleSave} disabled={upsert.isPending}>
          {upsert.isPending ? 'Saving...' : 'Save plan'}
        </Button>
      </div>
    </div>
  )
}

function ItemList({ items, empty, fmt, onDelete }: {
  items: { id: string; name: string; amount: number }[]
  empty: string
  fmt: (amount: number) => string
  onDelete: (id: string) => void
}) {
  if (items.length === 0) return <p className="rounded-2xl border border-border bg-secondary p-4 text-sm text-muted-foreground">{empty}</p>

  return (
    <div className="space-y-2">
      {items.map(item => (
        <div key={item.id} className="flex items-center justify-between rounded-2xl border border-border bg-secondary px-4 py-3">
          <div>
            <p className="font-bold text-foreground">{item.name}</p>
            <p className="text-xs text-muted-foreground">{fmt(item.amount)}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-extrabold text-foreground">{fmt(item.amount)}</span>
            <button className="text-sm text-muted-foreground hover:text-foreground" onClick={() => onDelete(item.id)}>Remove</button>
          </div>
        </div>
      ))}
    </div>
  )
}
