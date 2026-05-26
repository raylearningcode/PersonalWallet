import { useMemo, useState } from 'react'
import {
  useBudgetCategories,
  useBudgetRules,
  useTransactions,
  useUpdateBudgetCategory,
  useAddBudgetCategory,
  useDeleteBudgetCategory,
} from '@/lib/queries'
import { StatCard } from '@/components/shared/StatCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getOverspendRisk, getCategoryUsedPct } from '@/lib/budget'
import { useCurrency } from '@/lib/currency'
import { toast } from 'sonner'
import type { RiskLevel } from '@/lib/budget'

const ruleColors: Record<string, string> = {
  cap: '#A9F5C7',
  minimum: '#93C5FD',
  flexible: '#C4AEFF',
  emergency_months: '#FFD276',
}

const riskVariant: Record<RiskLevel, 'success' | 'warning' | 'danger'> = {
  Low: 'success', Medium: 'warning', High: 'danger',
}

function getBarColor(pct: number, catColor: string): string {
  if (pct >= 90) return '#ef4444'
  if (pct >= 70) return '#f59e0b'
  return catColor
}

function ColorBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-3 overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full transition-all duration-300"
        style={{ width: `${Math.min(100, value)}%`, background: color }}
      />
    </div>
  )
}

export function Budget() {
  const fmt = useCurrency()
  const { data: categories = [] } = useBudgetCategories()
  const { data: rules = [] } = useBudgetRules()
  const { data: transactions = [] } = useTransactions()
  const updateCategory = useUpdateBudgetCategory()
  const addCategory = useAddBudgetCategory()
  const deleteCategory = useDeleteBudgetCategory()

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<{ yearly_allocated: number; color: string }>({
    yearly_allocated: 0,
    color: '#6c63ff',
  })

  // Add category state
  const [showAdd, setShowAdd] = useState(false)
  const [addName, setAddName] = useState('')
  const [addAmount, setAddAmount] = useState('')
  const [addColor, setAddColor] = useState('#6c63ff')

  const year = new Date().getFullYear()
  const yearExpenses = transactions.filter(
    t => t.type !== 'income' && t.date.startsWith(String(year))
  )

  const totalAllocated = useMemo(() => categories.reduce((s, c) => s + c.yearly_allocated, 0), [categories])
  const totalSpent = useMemo(() => yearExpenses.reduce((s, t) => s + t.amount, 0), [yearExpenses])
  const remaining = totalAllocated - totalSpent
  const risk = totalAllocated > 0 ? getOverspendRisk(remaining, totalAllocated) : 'Low'
  const hasData = categories.length > 0

  const categoriesWithSpent = useMemo(() =>
    categories.map(cat => ({
      ...cat,
      spent: yearExpenses
        .filter(t => t.category === cat.name)
        .reduce((s, t) => s + t.amount, 0),
    })),
    [categories, yearExpenses]
  )

  const startEdit = (id: string, yearly_allocated: number, color: string) => {
    setEditingId(id)
    setEditDraft({ yearly_allocated, color })
  }

  const cancelEdit = () => setEditingId(null)

  const saveEdit = async () => {
    if (!editingId) return
    if (editDraft.yearly_allocated <= 0) {
      toast.error('Budget must be greater than zero')
      return
    }
    try {
      await updateCategory.mutateAsync({ id: editingId, ...editDraft })
      setEditingId(null)
      toast.success('Category updated')
    } catch {
      toast.error('Failed to update category')
    }
  }

  const handleAdd = async () => {
    const amount = Number(addAmount.replace(/[^\d.]/g, ''))
    if (!addName.trim() || !Number.isFinite(amount) || amount <= 0) return
    try {
      await addCategory.mutateAsync({ name: addName.trim(), yearly_allocated: amount, color: addColor })
      setAddName('')
      setAddAmount('')
      setAddColor('#6c63ff')
      setShowAdd(false)
      toast.success('Category added')
    } catch {
      toast.error('Failed to add category')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteCategory.mutateAsync(id)
      toast.success('Category removed')
    } catch {
      toast.error('Failed to remove category')
    }
  }

  return (
    <div>
      <PageHeader
        title="Budget"
        subtitle="Design your yearly plan, control monthly limits, and see what is safe to spend."
      />
      <div className="mb-11 grid grid-cols-1 gap-6 sm:grid-cols-3">
        <StatCard label="Yearly budget" value={fmt(totalAllocated)} sub="Allocated across categories" />
        <StatCard label="Remaining" value={fmt(hasData ? remaining : 0)} sub="Safe to spend this year" badgeVariant="success" />
        <StatCard label="Overspend risk" value={hasData ? risk : 'None'} sub={hasData ? 'Based on current spending' : 'No categories yet'} badgeVariant={hasData ? riskVariant[risk] : undefined} />
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.45fr_0.8fr]">
        <Card>
          <CardHeader><CardTitle className="text-xl">Category allocation</CardTitle></CardHeader>
          <CardContent className="space-y-4 px-8 pb-8">
            {categoriesWithSpent.length > 0 ? categoriesWithSpent.map(cat => {
              const pct = getCategoryUsedPct(cat.spent, cat.yearly_allocated)
              const barColor = getBarColor(pct, cat.color)
              const isEditing = editingId === cat.id

              if (isEditing) {
                return (
                  <div key={cat.id} className="rounded-xl border border-primary/30 bg-card p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-foreground">{cat.name}</span>
                      <div className="flex gap-2">
                        <Button size="sm" className="h-7 px-3 text-xs" onClick={saveEdit} disabled={updateCategory.isPending}>
                          ✓ Save
                        </Button>
                        <Button size="sm" variant="secondary" className="h-7 px-3 text-xs" onClick={cancelEdit}>
                          ✗
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
                      <div>
                        <p className="mb-1 text-xs text-muted-foreground">Yearly budget</p>
                        <Input
                          aria-label="Yearly budget"
                          type="number"
                          className="h-8 bg-secondary text-sm font-bold"
                          value={editDraft.yearly_allocated}
                          onChange={e => setEditDraft(d => ({ ...d, yearly_allocated: Number(e.target.value) }))}
                        />
                      </div>
                      <div>
                        <p className="mb-1 text-xs text-muted-foreground">Color</p>
                        <input
                          type="color"
                          aria-label="Category color"
                          className="h-8 w-8 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
                          value={editDraft.color}
                          onChange={e => setEditDraft(d => ({ ...d, color: e.target.value }))}
                        />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Spent so far: {fmt(cat.spent)}
                    </p>
                  </div>
                )
              }

              return (
                <div key={cat.id}>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-foreground">{cat.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">
                        {fmt(cat.spent)} of {fmt(cat.yearly_allocated)}
                      </span>
                      <span className={`text-xs font-bold ${pct >= 90 ? 'text-red-400' : pct >= 70 ? 'text-amber-400' : 'text-muted-foreground'}`}>
                        {pct}%
                      </span>
                      <button
                        onClick={() => startEdit(cat.id, cat.yearly_allocated, cat.color)}
                        className="flex h-6 w-6 items-center justify-center rounded-md bg-secondary text-xs text-muted-foreground hover:text-foreground"
                        aria-label={`Edit ${cat.name}`}
                      >
                        ✏
                      </button>
                      <button
                        onClick={() => handleDelete(cat.id)}
                        disabled={deleteCategory.isPending}
                        className="flex h-6 w-6 items-center justify-center rounded-md bg-secondary text-xs text-destructive hover:text-red-300 disabled:opacity-50"
                        aria-label={`Delete ${cat.name}`}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                  <ColorBar value={pct} color={barColor} />
                </div>
              )
            }) : (
              <p className="text-sm text-muted-foreground">No budget categories yet.</p>
            )}

            {/* Add category inline form */}
            {showAdd ? (
              <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                <p className="text-sm font-bold text-foreground">New category</p>
                <Input
                  aria-label="Category name"
                  className="h-8 bg-secondary text-sm"
                  placeholder="Category name"
                  value={addName}
                  onChange={e => setAddName(e.target.value)}
                />
                <div className="flex gap-3 items-center">
                  <Input
                    aria-label="Yearly amount"
                    type="number"
                    className="h-8 bg-secondary text-sm font-bold flex-1"
                    placeholder="Yearly amount"
                    value={addAmount}
                    onChange={e => setAddAmount(e.target.value)}
                  />
                  <input
                    type="color"
                    aria-label="Category color"
                    className="h-8 w-8 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
                    value={addColor}
                    onChange={e => setAddColor(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <Button className="h-8 flex-1 text-xs" onClick={handleAdd} disabled={addCategory.isPending}>
                    Add category
                  </Button>
                  <Button variant="secondary" className="h-8 text-xs" onClick={() => setShowAdd(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowAdd(true)}
                className="w-full rounded-xl border border-dashed border-border py-3 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
              >
                + Add category
              </button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-xl">Budget rules</CardTitle></CardHeader>
          <CardContent className="space-y-9 px-8">
            {rules.length > 0 ? rules.map(rule => (
              <div key={rule.id} className="flex items-center gap-4">
                <div className="h-10 w-10 shrink-0 rounded-2xl" style={{ backgroundColor: ruleColors[rule.rule_type] ?? '#A9F5C7' }} />
                <div>
                  <p className="text-base font-bold text-foreground">{rule.name}</p>
                  <p className="text-xs text-muted-foreground">{rule.category}</p>
                </div>
              </div>
            )) : (
              <p className="text-sm text-muted-foreground">No budget rules yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
