import { useMemo, useState } from 'react'
import {
  useBudgetCategories,
  useBudgetRules,
  useTransactions,
  useUpdateBudgetCategory,
  useAddBudgetCategory,
  useDeleteBudgetCategory,
  useAddBudgetRule,
  useDeleteBudgetRule,
} from '@/lib/queries'
import { StatCard } from '@/components/shared/StatCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { getOverspendRisk, getCategoryUsedPct, isInBudgetPeriod } from '@/lib/budget'
import { useMoney } from '@/lib/currency'
import { formatNumberInput, parseNumberInput } from '@/lib/numberInput'
import { toast } from 'sonner'
import { Check, Pencil, Trash2, X } from 'lucide-react'
import type { BudgetRule } from '@/types'
import type { BudgetPeriod, RiskLevel } from '@/lib/budget'

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
  const money = useMoney()
  const fmt = money.formatDisplay
  const { data: categories = [] } = useBudgetCategories()
  const { data: rules = [] } = useBudgetRules()
  const { data: transactions = [] } = useTransactions()
  const updateCategory = useUpdateBudgetCategory()
  const addCategory = useAddBudgetCategory()
  const deleteCategory = useDeleteBudgetCategory()
  const addRule = useAddBudgetRule()
  const deleteRule = useDeleteBudgetRule()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<{ yearly_allocated: number; budget_period: BudgetPeriod; color: string }>({
    yearly_allocated: 0,
    budget_period: 'monthly',
    color: '#6c63ff',
  })

  const [showAdd, setShowAdd] = useState(false)
  const [addName, setAddName] = useState('')
  const [addAmount, setAddAmount] = useState('')
  const [addPeriod, setAddPeriod] = useState<BudgetPeriod>('monthly')
  const [addColor, setAddColor] = useState('#6c63ff')

  const [ruleName, setRuleName] = useState('')
  const [ruleCategory, setRuleCategory] = useState('')
  const [ruleType, setRuleType] = useState<BudgetRule['rule_type']>('cap')
  const [ruleValue, setRuleValue] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<null | { kind: 'category' | 'rule'; id: string; name: string }>(null)

  const currentYear = String(new Date().getFullYear())
  const expenseTransactions = transactions.filter(
    t => t.type !== 'income' && t.type !== 'transfer' && t.date.startsWith(currentYear)
  )

  const categoriesWithSpent = useMemo(() =>
    categories.map(cat => ({
      ...cat,
      budget_period: cat.budget_period ?? 'yearly',
      spent: expenseTransactions
        .filter(t => t.category === cat.name && isInBudgetPeriod(t.date, cat.budget_period ?? 'yearly'))
        .reduce((s, t) => s + t.amount, 0),
    })),
    [categories, expenseTransactions]
  )

  const totalAllocated = useMemo(() => categoriesWithSpent.reduce((s, c) => s + c.yearly_allocated, 0), [categoriesWithSpent])
  const totalSpent = useMemo(() => categoriesWithSpent.reduce((s, c) => s + c.spent, 0), [categoriesWithSpent])
  const remaining = totalAllocated - totalSpent
  const risk = totalAllocated > 0 ? getOverspendRisk(remaining, totalAllocated) : 'Low'
  const hasData = categories.length > 0

  const startEdit = (id: string, yearly_allocated: number, budget_period: BudgetPeriod, color: string) => {
    setEditingId(id)
    setEditDraft({ yearly_allocated: Number(money.fromBase(yearly_allocated, money.displayCurrency).toFixed(2)), budget_period, color })
  }

  const cancelEdit = () => setEditingId(null)

  const saveEdit = async () => {
    if (!editingId) return
    if (editDraft.yearly_allocated < 0) {
      toast.error('Budget must be zero or greater')
      return
    }
    try {
      await updateCategory.mutateAsync({
        id: editingId,
        ...editDraft,
        yearly_allocated: money.toBase(editDraft.yearly_allocated, money.displayCurrency),
      })
      setEditingId(null)
      toast.success('Category updated')
    } catch {
      toast.error('Failed to update category')
    }
  }

  const handleAdd = async () => {
    const amount = parseNumberInput(addAmount)
    if (!addName.trim() || !Number.isFinite(amount) || amount < 0) return
    try {
      await addCategory.mutateAsync({ name: addName.trim(), yearly_allocated: money.toBase(amount, money.displayCurrency), budget_period: addPeriod, color: addColor })
      setAddName('')
      setAddAmount('')
      setAddPeriod('monthly')
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

  const handleAddRule = async () => {
    const value = parseNumberInput(ruleValue)
    const category = ruleCategory || categories[0]?.name
    if (!ruleName.trim() || !category || !Number.isFinite(value) || value <= 0) return
    try {
      await addRule.mutateAsync({ name: ruleName.trim(), category, rule_type: ruleType, value })
      setRuleName('')
      setRuleCategory('')
      setRuleType('cap')
      setRuleValue('')
      toast.success('Budget rule added')
    } catch {
      toast.error('Failed to add budget rule')
    }
  }

  const confirmDeleteSelected = async () => {
    if (!deleteTarget) return
    if (deleteTarget.kind === 'category') await handleDelete(deleteTarget.id)
    else {
      deleteRule.mutate(deleteTarget.id)
      toast.success('Budget rule removed')
    }
    setDeleteTarget(null)
  }

  return (
    <div>
      <PageHeader
        title="Budget"
        subtitle="Choose monthly or yearly limits, then track usage in the period that matters."
      />
      <div className="mb-11 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
        <StatCard label="Planned budget" value={fmt(totalAllocated)} sub={money.baseCurrency !== money.displayCurrency ? money.formatBase(totalAllocated) : 'Current category limits'} />
        <StatCard label="Remaining" value={fmt(hasData ? remaining : 0)} sub={money.baseCurrency !== money.displayCurrency ? money.formatBase(hasData ? remaining : 0) : 'Safe inside active periods'} badgeVariant="success" />
        <StatCard label="Overspend risk" value={hasData ? risk : 'None'} sub={hasData ? 'Based on current period spending' : 'No categories yet'} badgeVariant={hasData ? riskVariant[risk] : undefined} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.8fr)] lg:gap-8">
        <Card>
          <CardHeader><CardTitle className="text-xl">Category allocation</CardTitle></CardHeader>
          <CardContent className="space-y-4 px-5 pb-6 sm:px-8 sm:pb-8">
            {categoriesWithSpent.length > 0 ? categoriesWithSpent.map(cat => {
              const pct = getCategoryUsedPct(cat.spent, cat.yearly_allocated)
              const barColor = getBarColor(pct, cat.color)
              const isEditing = editingId === cat.id

              if (isEditing) {
                return (
                  <div key={cat.id} className="space-y-3 rounded-xl border border-primary/30 bg-card p-4">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-foreground">{cat.name}</span>
                      <div className="flex gap-2">
                        <Button size="sm" className="h-7 px-3 text-xs" onClick={saveEdit} disabled={updateCategory.isPending}>
                          <Check className="mr-1 h-3.5 w-3.5" />
                          Save
                        </Button>
                        <Button size="sm" variant="secondary" className="h-7 px-3 text-xs" onClick={cancelEdit} aria-label="Cancel edit">
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                      <div>
                        <p className="mb-1 text-xs text-muted-foreground">Budget amount ({money.displayCurrency})</p>
                        <Input
                          aria-label="Budget amount"
                          inputMode="decimal"
                          className="h-8 bg-secondary text-sm font-bold"
                          value={formatNumberInput(editDraft.yearly_allocated)}
                          onChange={e => setEditDraft(d => ({ ...d, yearly_allocated: parseNumberInput(e.target.value) }))}
                        />
                      </div>
                      <div>
                        <p className="mb-1 text-xs text-muted-foreground">Period</p>
                        <select
                          aria-label="Budget period"
                          className="h-8 rounded-md border border-input bg-secondary px-3 text-sm font-bold text-foreground outline-none"
                          value={editDraft.budget_period}
                          onChange={e => setEditDraft(d => ({ ...d, budget_period: e.target.value as BudgetPeriod }))}
                        >
                          <option value="monthly">Monthly</option>
                          <option value="yearly">Yearly</option>
                        </select>
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
                      Spent this {editDraft.budget_period}: {fmt(cat.spent)}
                    </p>
                  </div>
                )
              }

              return (
                <div key={cat.id}>
                  <div className="mb-2 flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <span className="font-bold text-foreground">{cat.name}</span>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-xs text-muted-foreground">
                        {fmt(cat.spent)} of {fmt(cat.yearly_allocated)} {cat.budget_period}
                      </span>
                      <span className={`text-xs font-bold ${pct >= 90 ? 'text-red-400' : pct >= 70 ? 'text-amber-400' : 'text-muted-foreground'}`}>
                        {pct}%
                      </span>
                      <button
                        onClick={() => startEdit(cat.id, cat.yearly_allocated, cat.budget_period, cat.color)}
                        className="flex h-6 w-6 items-center justify-center rounded-md bg-secondary text-xs text-muted-foreground hover:text-foreground"
                        aria-label={`Edit ${cat.name}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget({ kind: 'category', id: cat.id, name: cat.name })}
                        disabled={deleteCategory.isPending}
                        className="flex h-6 w-6 items-center justify-center rounded-md bg-secondary text-xs text-destructive hover:text-red-300 disabled:opacity-50"
                        aria-label={`Delete ${cat.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <ColorBar value={pct} color={barColor} />
                </div>
              )
            }) : (
              <p className="text-sm text-muted-foreground">No budget categories yet.</p>
            )}

            {showAdd ? (
              <div className="space-y-3 rounded-xl border border-border bg-card p-4">
                <p className="text-sm font-bold text-foreground">New category</p>
                <Input
                  aria-label="Category name"
                  className="h-8 bg-secondary text-sm"
                  placeholder="Category name"
                  value={addName}
                  onChange={e => setAddName(e.target.value)}
                />
                <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                  <Input
                    aria-label="Budget amount"
                    inputMode="decimal"
                    className="h-8 bg-secondary text-sm font-bold"
                    placeholder={`Budget amount (${money.displayCurrency})`}
                    value={addAmount}
                    onChange={e => setAddAmount(formatNumberInput(e.target.value))}
                  />
                  <select
                    aria-label="New category budget period"
                    className="h-8 rounded-md border border-input bg-secondary px-3 text-sm font-bold text-foreground outline-none"
                    value={addPeriod}
                    onChange={e => setAddPeriod(e.target.value as BudgetPeriod)}
                  >
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
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
                className="w-full rounded-xl border border-dashed border-border py-3 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
              >
                + Add category
              </button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-xl">Budget rules</CardTitle></CardHeader>
          <CardContent className="space-y-5 px-5 pb-6 sm:px-8 sm:pb-8">
            <div className="space-y-3 rounded-2xl border border-border bg-secondary p-4">
              <Input
                aria-label="Budget rule name"
                className="bg-card"
                value={ruleName}
                onChange={event => setRuleName(event.target.value)}
                placeholder="Rule name"
              />
              <select
                aria-label="Budget rule category"
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm font-bold text-foreground outline-none"
                value={ruleCategory || categories[0]?.name || ''}
                onChange={event => setRuleCategory(event.target.value)}
              >
                {categories.map(category => <option key={category.id} value={category.name}>{category.name}</option>)}
              </select>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(100px,0.7fr)]">
                <select
                  aria-label="Budget rule type"
                  className="h-10 rounded-md border border-input bg-card px-3 text-sm font-bold text-foreground outline-none"
                  value={ruleType}
                  onChange={event => setRuleType(event.target.value as BudgetRule['rule_type'])}
                >
                  <option value="cap">Cap</option>
                  <option value="minimum">Minimum</option>
                  <option value="flexible">Flexible</option>
                  <option value="emergency_months">Emergency months</option>
                </select>
                <Input
                  aria-label="Budget rule value"
                  className="bg-card"
                  inputMode="decimal"
                  value={ruleValue}
                  onChange={event => setRuleValue(formatNumberInput(event.target.value))}
                  placeholder="Value"
                />
              </div>
              <Button className="w-full" onClick={handleAddRule} disabled={addRule.isPending || categories.length === 0}>
                Add budget rule
              </Button>
            </div>
            {rules.length > 0 ? rules.map(rule => (
              <div key={rule.id} className="flex items-center gap-4">
                <div className="h-10 w-10 shrink-0 rounded-2xl" style={{ backgroundColor: ruleColors[rule.rule_type] ?? '#A9F5C7' }} />
                <div className="min-w-0 flex-1">
                  <p className="text-base font-bold text-foreground">{rule.name}</p>
                  <p className="text-xs text-muted-foreground">{rule.category} - {rule.value}</p>
                </div>
                <button
                  aria-label={`Delete rule ${rule.name}`}
                  className="flex h-8 w-8 items-center justify-center rounded-md bg-secondary text-destructive hover:text-red-300"
                  onClick={() => setDeleteTarget({ kind: 'rule', id: rule.id, name: rule.name })}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )) : (
              <p className="text-sm text-muted-foreground">No budget rules yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={deleteTarget ? `Delete ${deleteTarget.name}?` : ''}
        description={deleteTarget?.kind === 'category'
          ? 'This removes the budget option. Existing transactions will keep their category text.'
          : 'This removes the budget rule from your planning panel.'}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDeleteSelected}
      />
    </div>
  )
}
