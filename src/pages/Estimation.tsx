import { useEffect, useMemo, useRef, useState } from 'react'
import { useEstimationPlans, useUpsertEstimationPlan } from '@/lib/queries'
import { StatCard } from '@/components/shared/StatCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { calculateSavingsRate } from '@/lib/stats'
import { useMoney } from '@/lib/currency'
import { formatNumberInput, parseNumberInput } from '@/lib/numberInput'
import { toast } from 'sonner'

type EstimatePeriod = 'monthly' | 'yearly'

type EstimateItem = {
  id: string
  name: string
  amount: number
  period: EstimatePeriod
}

type WishlistItem = {
  id: string
  name: string
  amount: number
  type: string
  note: string
}

export function Estimation() {
  const money = useMoney()
  const upsert = useUpsertEstimationPlan()
  const { data: plans } = useEstimationPlans()
  const initialized = useRef(false)

  const [incomeItems, setIncomeItems] = useState<EstimateItem[]>([])
  const [expenseItems, setExpenseItems] = useState<EstimateItem[]>([])
  const [incomeSource, setIncomeSource] = useState('')
  const [incomeAmount, setIncomeAmount] = useState('')
  const [incomePeriod, setIncomePeriod] = useState<EstimatePeriod>('monthly')
  const [expenseDetail, setExpenseDetail] = useState('')
  const [expenseAmount, setExpenseAmount] = useState('')
  const [expensePeriod, setExpensePeriod] = useState<EstimatePeriod>('monthly')
  const [notes, setNotes] = useState('')
  const [wishlistItems, setWishlistItems] = useState<WishlistItem[]>([])
  const [wishlistName, setWishlistName] = useState('')
  const [wishlistAmount, setWishlistAmount] = useState('')
  const [wishlistType, setWishlistType] = useState('Want')
  const [wishlistNote, setWishlistNote] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<null | { list: 'income' | 'expense' | 'wishlist'; id: string; name: string }>(null)

  useEffect(() => {
    if (initialized.current || !plans) return
    initialized.current = true
    const now = new Date()
    const current = plans.find(p => p.month === now.getMonth() + 1 && p.year === now.getFullYear())
    if (!current?.notes) return
    try {
      const parsed = JSON.parse(current.notes) as {
        text?: string
        incomeItems?: EstimateItem[]
        expenseItems?: EstimateItem[]
        wishlistItems?: WishlistItem[]
      }
      if (parsed.text !== undefined) setNotes(parsed.text)
      if (Array.isArray(parsed.incomeItems)) setIncomeItems(parsed.incomeItems)
      if (Array.isArray(parsed.expenseItems)) setExpenseItems(parsed.expenseItems)
      if (Array.isArray(parsed.wishlistItems)) setWishlistItems(parsed.wishlistItems)
    } catch {
      setNotes(current.notes)
    }
  }, [plans])

  const monthlyIncome = useMemo(() => incomeItems.reduce((sum, item) => sum + (item.period === 'monthly' ? item.amount : item.amount / 12), 0), [incomeItems])
  const yearlyIncome = useMemo(() => incomeItems.reduce((sum, item) => sum + (item.period === 'monthly' ? item.amount * 12 : item.amount), 0), [incomeItems])
  const monthlyExpenses = useMemo(() => expenseItems.reduce((sum, item) => sum + (item.period === 'monthly' ? item.amount : item.amount / 12), 0), [expenseItems])
  const yearlyExpenses = useMemo(() => expenseItems.reduce((sum, item) => sum + (item.period === 'monthly' ? item.amount * 12 : item.amount), 0), [expenseItems])
  const yearlySaving = yearlyIncome - yearlyExpenses
  const savingsRate = calculateSavingsRate(monthlyIncome, monthlyExpenses)
  const wishlistTotal = useMemo(() => wishlistItems.reduce((sum, item) => sum + item.amount, 0), [wishlistItems])

  const addIncome = () => {
    const amount = parseNumberInput(incomeAmount)
    if (!incomeSource.trim() || amount <= 0) return
    setIncomeItems(current => [...current, { id: crypto.randomUUID(), name: incomeSource.trim(), amount: money.toBase(amount, money.displayCurrency), period: incomePeriod }])
    setIncomeSource('')
    setIncomeAmount('')
  }

  const addExpense = () => {
    const amount = parseNumberInput(expenseAmount)
    if (!expenseDetail.trim() || amount <= 0) return
    setExpenseItems(current => [...current, { id: crypto.randomUUID(), name: expenseDetail.trim(), amount: money.toBase(amount, money.displayCurrency), period: expensePeriod }])
    setExpenseDetail('')
    setExpenseAmount('')
  }

  const addWishlistItem = () => {
    const amount = parseNumberInput(wishlistAmount)
    if (!wishlistName.trim() || amount <= 0) return
    setWishlistItems(current => [...current, {
      id: crypto.randomUUID(),
      name: wishlistName.trim(),
      amount: money.toBase(amount, money.displayCurrency),
      type: wishlistType,
      note: wishlistNote.trim(),
    }])
    setWishlistName('')
    setWishlistAmount('')
    setWishlistType('Want')
    setWishlistNote('')
  }

  const handleSave = async () => {
    await upsert.mutateAsync({
      month: new Date().getMonth() + 1,
      year: new Date().getFullYear(),
      estimated_income: monthlyIncome,
      fixed_expenses: monthlyExpenses,
      variable_estimate: 0,
      currency: money.baseCurrency,
      notes: JSON.stringify({ text: notes, incomeItems, expenseItems, wishlistItems }),
    })
    toast.success('Estimation plan saved')
  }

  const confirmDeleteSelected = () => {
    if (!deleteTarget) return
    if (deleteTarget.list === 'income') setIncomeItems(current => current.filter(item => item.id !== deleteTarget.id))
    if (deleteTarget.list === 'expense') setExpenseItems(current => current.filter(item => item.id !== deleteTarget.id))
    if (deleteTarget.list === 'wishlist') setWishlistItems(current => current.filter(item => item.id !== deleteTarget.id))
    setDeleteTarget(null)
  }

  return (
    <div>
      <PageHeader
        title="Estimation planner"
        subtitle="Plan future months one item at a time: income sources, expected expenses, notes, and wishlist."
        action={(
          <div className="flex h-11 items-center gap-5 rounded-full border border-border bg-secondary px-6 text-sm">
            <span className="text-muted-foreground">Main currency</span>
            <span className="min-w-10 text-right font-extrabold text-primary" aria-label="Main currency">
              {money.baseCurrency}
            </span>
          </div>
        )}
      />
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
        <StatCard label="Monthly income" value={money.formatDisplay(monthlyIncome)} sub={`${incomeItems.length} income items`} badgeVariant="success" />
        <StatCard label="Monthly expenses" value={money.formatDisplay(monthlyExpenses)} sub={`${expenseItems.length} expense items`} badgeVariant="warning" />
        <StatCard label="Yearly saving" value={money.formatDisplay(yearlySaving)} sub={`${savingsRate}% monthly saving rate`} />
        <StatCard label="Yearly income" value={money.formatDisplay(yearlyIncome)} sub={`Expenses ${money.formatDisplay(yearlyExpenses)}`} />
      </div>
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-7">
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-xl">Income sources</CardTitle>
            <p className="text-sm text-muted-foreground">Add where money is expected to come from.</p>
          </CardHeader>
          <CardContent className="space-y-4 p-5 sm:p-6">
            <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(120px,0.55fr)_minmax(120px,0.5fr)_auto]">
              <div>
                <Label className="text-xs text-muted-foreground">Income source</Label>
                <Input aria-label="Income source" className="mt-2 bg-secondary" value={incomeSource} onChange={event => setIncomeSource(event.target.value)} placeholder="Part-time work" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Income amount ({money.displayCurrency})</Label>
                <Input aria-label="Income amount" className="mt-2 bg-secondary" inputMode="decimal" value={incomeAmount} onChange={event => setIncomeAmount(formatNumberInput(event.target.value))} placeholder="0" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Period</Label>
                <select aria-label="Income period" className="mt-2 h-10 w-full rounded-md border border-input bg-secondary px-3 text-sm font-bold text-foreground outline-none" value={incomePeriod} onChange={event => setIncomePeriod(event.target.value as EstimatePeriod)}>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
              <Button onClick={addIncome}>Add</Button>
            </div>
            <ItemList items={incomeItems} empty="No income sources yet." fmt={money.formatDisplay} onDelete={(id, name) => setDeleteTarget({ list: 'income', id, name })} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-xl">Expected expenses</CardTitle>
            <p className="text-sm text-muted-foreground">Add rent, bills, subscriptions, food, trips, and other planned costs.</p>
          </CardHeader>
          <CardContent className="space-y-4 p-5 sm:p-6">
            <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(120px,0.55fr)_minmax(120px,0.5fr)_auto]">
              <div>
                <Label className="text-xs text-muted-foreground">Expense detail</Label>
                <Input aria-label="Expense detail" className="mt-2 bg-secondary" value={expenseDetail} onChange={event => setExpenseDetail(event.target.value)} placeholder="Apartment rent" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Expense amount ({money.displayCurrency})</Label>
                <Input aria-label="Expense amount" className="mt-2 bg-secondary" inputMode="decimal" value={expenseAmount} onChange={event => setExpenseAmount(formatNumberInput(event.target.value))} placeholder="0" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Period</Label>
                <select aria-label="Expense period" className="mt-2 h-10 w-full rounded-md border border-input bg-secondary px-3 text-sm font-bold text-foreground outline-none" value={expensePeriod} onChange={event => setExpensePeriod(event.target.value as EstimatePeriod)}>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
              <Button onClick={addExpense}>Add</Button>
            </div>
            <ItemList items={expenseItems} empty="No expected expenses yet." fmt={money.formatDisplay} onDelete={(id, name) => setDeleteTarget({ list: 'expense', id, name })} />
          </CardContent>
        </Card>
      </div>
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]">
        <Card>
          <CardHeader className="pb-0">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-xl">Wishlist</CardTitle>
                <p className="text-sm text-muted-foreground">Track what the item is for, expected cost, and a small note.</p>
              </div>
              <p className="text-sm font-extrabold text-primary">{money.formatDisplay(wishlistTotal)}</p>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 p-5 sm:p-6">
            <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(110px,0.45fr)_minmax(120px,0.45fr)]">
              <div>
                <Label className="text-xs text-muted-foreground">Wishlist item</Label>
                <Input aria-label="Wishlist item" className="mt-2 bg-secondary" value={wishlistName} onChange={event => setWishlistName(event.target.value)} placeholder="MacBook upgrade" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Amount ({money.displayCurrency})</Label>
                <Input aria-label="Wishlist amount" className="mt-2 bg-secondary" inputMode="decimal" value={wishlistAmount} onChange={event => setWishlistAmount(formatNumberInput(event.target.value))} placeholder="0" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Type</Label>
                <select aria-label="Wishlist type" className="mt-2 h-10 w-full rounded-md border border-input bg-secondary px-3 text-sm font-bold text-foreground outline-none" value={wishlistType} onChange={event => setWishlistType(event.target.value)}>
                  <option value="Want">Want</option>
                  <option value="Need">Need</option>
                  <option value="Work">Work</option>
                  <option value="Travel">Travel</option>
                  <option value="Gift">Gift</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs text-muted-foreground">Note</Label>
                <Input aria-label="Wishlist note" className="mt-2 bg-secondary" value={wishlistNote} onChange={event => setWishlistNote(event.target.value)} placeholder="What this is for" />
              </div>
              <Button onClick={addWishlistItem}>Add wishlist item</Button>
            </div>
            {wishlistItems.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {wishlistItems.map(item => (
                  <div key={item.id} className="rounded-2xl border border-border bg-secondary p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-extrabold text-foreground">{item.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{item.type}</p>
                      </div>
                      <button className="text-sm text-muted-foreground hover:text-foreground" onClick={() => setDeleteTarget({ list: 'wishlist', id: item.id, name: item.name })}>Remove</button>
                    </div>
                    <p className="mt-3 text-lg font-extrabold text-primary">{money.formatDisplay(item.amount)}</p>
                    {item.note && <p className="mt-2 text-sm text-muted-foreground">{item.note}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-2xl border border-border bg-secondary p-4 text-sm text-muted-foreground">No wishlist items yet.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-xl">Plan notes</CardTitle>
            <p className="text-sm text-muted-foreground">Add anything that could change the estimate.</p>
          </CardHeader>
          <CardContent className="space-y-4 p-5 sm:p-6">
            <div>
              <Label className="text-xs text-muted-foreground">Notes</Label>
              <textarea
                aria-label="Notes"
                className="mt-2 min-h-[160px] w-full resize-y rounded-2xl border border-input bg-secondary px-4 py-3 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                value={notes}
                onChange={event => setNotes(event.target.value)}
                placeholder="Optional notes"
              />
            </div>
            <Button className="w-full" onClick={handleSave} disabled={upsert.isPending}>
              {upsert.isPending ? 'Saving...' : 'Save plan'}
            </Button>
          </CardContent>
        </Card>
      </div>
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={deleteTarget ? `Delete ${deleteTarget.name}?` : ''}
        description="This removes the item from this estimate only."
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDeleteSelected}
      />
    </div>
  )
}

function ItemList({ items, empty, fmt, onDelete }: {
  items: { id: string; name: string; amount: number; period: EstimatePeriod }[]
  empty: string
  fmt: (amount: number) => string
  onDelete: (id: string, name: string) => void
}) {
  if (items.length === 0) return <p className="rounded-2xl border border-border bg-secondary p-4 text-sm text-muted-foreground">{empty}</p>

  return (
    <div className="space-y-2">
      {items.map(item => (
        <div key={item.id} className="flex items-center justify-between rounded-2xl border border-border bg-secondary px-4 py-3">
          <div>
            <p className="font-bold text-foreground">{item.name}</p>
            <p className="text-xs capitalize text-muted-foreground">{item.period}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-extrabold text-foreground">{fmt(item.amount)}</span>
            <button className="text-sm text-muted-foreground hover:text-foreground" onClick={() => onDelete(item.id, item.name)}>Remove</button>
          </div>
        </div>
      ))}
    </div>
  )
}
