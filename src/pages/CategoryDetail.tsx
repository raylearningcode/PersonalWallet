import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, ArrowLeft, MoreVertical } from 'lucide-react'
import { useBudgetCategories, useTransactions, useWallets } from '@/lib/queries'
import { useMoney } from '@/lib/currency'
import { getCategoryUsedPct, isInBudgetPeriod } from '@/lib/budget'
import { formatDate } from '@/lib/utils'
import { txAmountColor, txAmountSign } from '@/lib/currency'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { MoneyField } from '@/components/mobile/MoneyField'
import {
  useUpdateBudgetCategory,
  useDeleteBudgetCategory,
} from '@/lib/queries'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { parseNumberInput } from '@/lib/numberInput'
import type { BudgetPeriod } from '@/lib/budget'
import type { Transaction } from '@/types'

const PRESET_COLORS = [
  '#EF4444', '#F97316', '#EAB308', '#22C55E',
  '#14B8A6', '#3B82F6', '#8B5CF6', '#EC4899',
  '#64748B', '#A16207',
]

function getBarColor(pct: number, catColor: string): string {
  if (pct >= 90) return '#ef4444'
  if (pct >= 70) return '#f59e0b'
  return catColor
}

export function CategoryDetail() {
  const navigate = useNavigate()
  const { name: encodedName } = useParams<{ name: string }>()
  const categoryName = encodedName ? decodeURIComponent(encodedName) : ''
  const money = useMoney()
  const fmt = money.formatDisplay

  const [periodDate, setPeriodDate] = useState(() => { const d = new Date(); d.setDate(1); return d })
  const [editOpen, setEditOpen] = useState(false)
  const [editDraft, setEditDraft] = useState({ yearly_allocated: 0, budget_period: 'monthly' as BudgetPeriod, color: '#6c63ff' })
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const { data: categories = [], isPending: catPending } = useBudgetCategories()
  const { data: allTransactions = [], isPending: txPending } = useTransactions()
  const { data: wallets = [] } = useWallets()
  const updateCategory = useUpdateBudgetCategory()
  const deleteCategory = useDeleteBudgetCategory()
  const [detailTx, setDetailTx] = useState<Transaction | null>(null)

  const category = categories.find(c => c.name === categoryName)

  const today = new Date()
  const isCurrentMonth = periodDate.getFullYear() === today.getFullYear() && periodDate.getMonth() === today.getMonth()

  const categoryTransactions = useMemo(() => {
    if (!category) return []
    return allTransactions
      .filter(t =>
        t.type !== 'income' &&
        t.type !== 'transfer' &&
        t.category === categoryName &&
        isInBudgetPeriod(t.date, category.budget_period ?? 'monthly', periodDate)
      )
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [allTransactions, category, categoryName, periodDate])

  const spent = useMemo(() => categoryTransactions.reduce((s, t) => s + t.amount, 0), [categoryTransactions])

  const groupedByDate = useMemo(() => {
    if (!category) return []
    const groups = new Map<string, typeof categoryTransactions>()
    categoryTransactions.forEach(tx => {
      groups.set(tx.date, [...(groups.get(tx.date) ?? []), tx])
    })
    return [...groups.entries()]
  }, [category, categoryTransactions])

  const openEdit = () => {
    if (!category) return
    setEditDraft({
      yearly_allocated: category.yearly_allocated,
      budget_period: category.budget_period ?? 'monthly',
      color: category.color,
    })
    setMenuOpen(false)
    setEditOpen(true)
  }

  const saveEdit = async () => {
    if (!category) return
    if (!Number.isFinite(editDraft.yearly_allocated) || editDraft.yearly_allocated <= 0) {
      toast.error('Enter a valid budget amount')
      return
    }
    const id = category.id
    setEditOpen(false)
    try {
      await updateCategory.mutateAsync({ id, ...editDraft })
      toast.success('Category updated')
    } catch {
      toast.error('Failed to update category')
    }
  }

  const confirmDelete = async () => {
    if (!category) return
    const id = category.id
    setDeleteOpen(false)
    try {
      await deleteCategory.mutateAsync(id)
      toast.success('Category removed')
      navigate(-1)
    } catch {
      toast.error('Failed to remove category')
    }
  }

  const monthLabel = periodDate.toLocaleString('en', { month: 'long', year: 'numeric' })

  if (catPending) {
    return (
      <div className="space-y-4 py-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  if (!category) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-base font-bold text-foreground">Category not found</p>
        <p className="mt-1 text-sm text-muted-foreground">"{categoryName}" doesn't exist in your budget.</p>
        <Button className="mt-6" onClick={() => navigate(-1)}>Go back</Button>
      </div>
    )
  }

  const pct = getCategoryUsedPct(spent, category.yearly_allocated)
  const barColor = getBarColor(pct, category.color)
  const leftAmt = Math.max(0, category.yearly_allocated - spent)

  return (
    <div>
      {/* Header */}
      <div className="-mx-4 -mt-6 mb-6 flex items-center justify-between gap-2 border-b border-border bg-background/95 px-4 py-3">
        <button
          type="button"
          aria-label="Go back"
          onClick={() => navigate(-1)}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-secondary text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        {/* Month navigator */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => setPeriodDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-secondary text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[130px] text-center text-sm font-extrabold text-foreground">{monthLabel}</span>
          <button
            type="button"
            aria-label="Next month"
            disabled={isCurrentMonth}
            onClick={() => setPeriodDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-secondary text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <button
          type="button"
          aria-label="More options"
          onClick={() => setMenuOpen(true)}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-secondary text-muted-foreground transition-colors hover:text-foreground"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </div>

      {/* Desktop: summary rail + transactions */}
      <div className="lg:grid lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start lg:gap-5">
        <div className="lg:sticky lg:top-6">

      {/* Category header */}
      <div className="mb-6 flex items-center gap-4">
        <div
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-xl font-extrabold text-background"
          style={{ backgroundColor: category.color }}
        >
          {category.name.slice(0, 1)}
        </div>
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">{category.name}</h1>
          <p className="text-sm text-muted-foreground capitalize">
            {category.budget_period ?? 'monthly'} budget
            {category.yearly_allocated > 0 && ` · ${pct}% used`}
          </p>
        </div>
      </div>

      {/* Stats */}
      {category.yearly_allocated > 0 ? (
        <div className="mb-5 grid grid-cols-3 gap-3">
          <div className="rounded-2xl bg-secondary p-4 text-center">
            <p className="text-xs text-muted-foreground">Spent</p>
            <p className="mt-1 break-words text-base font-extrabold text-foreground">{fmt(spent)}</p>
          </div>
          <div className="rounded-2xl bg-secondary p-4 text-center">
            <p className="text-xs text-muted-foreground">Budget</p>
            <p className="mt-1 break-words text-base font-extrabold text-foreground">{fmt(category.yearly_allocated)}</p>
          </div>
          <div className="rounded-2xl bg-secondary p-4 text-center">
            <p className="text-xs text-muted-foreground">Left</p>
            <p className={`mt-1 break-words text-base font-extrabold ${leftAmt === 0 ? 'text-[#FF8388]' : 'text-primary'}`}>{fmt(leftAmt)}</p>
          </div>
        </div>
      ) : (
        <div className="mb-5 rounded-2xl border border-dashed border-border bg-secondary/40 px-5 py-4 text-center">
          <p className="text-sm font-bold text-foreground">No budget set for this category</p>
          <button
            type="button"
            onClick={openEdit}
            className="mt-2 text-xs font-bold text-primary hover:underline"
          >
            Set a budget →
          </button>
        </div>
      )}

      {/* Progress bar */}
      {category.yearly_allocated > 0 && (
        <div className="mb-6">
          <div className="h-3 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, pct)}%`, background: barColor }}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{fmt(spent)} spent</span>
            <span className={`text-xs font-bold ${pct >= 90 ? 'text-[#FF8388]' : pct >= 70 ? 'text-[#FFCF73]' : 'text-muted-foreground'}`}>{pct}%</span>
          </div>
        </div>
      )}

        </div>

        <div className="min-w-0">
      {/* Transaction list */}
      <div className="rounded-[1.4rem] border border-border bg-card px-4 py-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-foreground">Transactions</h2>
          <span className="text-xs text-muted-foreground">{categoryTransactions.length} total</span>
        </div>

        {txPending ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between gap-3 rounded-xl bg-secondary px-4 py-3">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        ) : categoryTransactions.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm font-bold text-foreground">No transactions this period</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {isCurrentMonth ? 'Nothing recorded in this category yet.' : 'No transactions for this month.'}
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {groupedByDate.map(([date, rows]) => (
              <div key={date}>
                <h3 className="mb-2 text-xs font-extrabold text-primary">{formatDate(date)}</h3>
                <div className="space-y-2">
                  {rows.map(tx => (
                    <button
                      key={tx.id}
                      type="button"
                      onClick={() => setDetailTx(tx)}
                      className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-secondary px-4 py-3 text-left transition-colors active:scale-[0.99] hover:border-primary/30"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-foreground">{tx.description}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{tx.category}</p>
                      </div>
                      <span className={`shrink-0 text-sm font-extrabold tabular-nums ${txAmountColor(tx.amount, tx.type)}`}>
                        {txAmountSign(tx.amount, tx.type)}{money.format(tx.original_amount ?? tx.amount, tx.original_currency ?? money.baseCurrency)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

        </div>
      </div>

      {/* Transaction detail sheet */}
      <Sheet open={detailTx !== null} onOpenChange={v => { if (!v) setDetailTx(null) }}>
        <SheetContent side="bottom" className="rounded-t-3xl border-border bg-background pb-safe-10">
          {detailTx && (
            <>
              <SheetHeader className="mb-4">
                <SheetTitle className="pr-8 text-lg">{detailTx.description}</SheetTitle>
              </SheetHeader>
              <div className="mb-5 text-center">
                <p className={`text-3xl font-extrabold tabular-nums ${txAmountColor(detailTx.amount, detailTx.type)}`}>
                  {txAmountSign(detailTx.amount, detailTx.type)}
                  {money.format(detailTx.original_amount ?? detailTx.amount, detailTx.original_currency ?? money.baseCurrency)}
                </p>
                {detailTx.original_currency && detailTx.original_currency !== money.baseCurrency && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    = {money.formatDisplay(detailTx.amount)}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-xl bg-secondary px-4 py-3">
                  <span className="text-xs text-muted-foreground">Type</span>
                  <span className="text-sm font-bold capitalize text-foreground">{detailTx.type}</span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-secondary px-4 py-3">
                  <span className="text-xs text-muted-foreground">Category</span>
                  <span className="text-sm font-bold text-foreground">{detailTx.category}</span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-secondary px-4 py-3">
                  <span className="text-xs text-muted-foreground">Date</span>
                  <span className="text-sm font-bold text-foreground">{formatDate(detailTx.date)}</span>
                </div>
                {detailTx.wallet_id && (
                  <div className="flex items-center justify-between rounded-xl bg-secondary px-4 py-3">
                    <span className="text-xs text-muted-foreground">Wallet</span>
                    <span className="text-sm font-bold text-foreground">
                      {wallets.find(w => w.id === detailTx.wallet_id)?.name ?? '—'}
                    </span>
                  </div>
                )}
                {detailTx.needs_review && (
                  <div className="flex items-center justify-between rounded-xl bg-[#FFCF73]/10 px-4 py-3">
                    <span className="text-xs text-muted-foreground">Status</span>
                    <span className="text-sm font-bold text-[#FFCF73]">Needs review</span>
                  </div>
                )}
              </div>
              <Button variant="secondary" className="mt-5 w-full" onClick={() => setDetailTx(null)}>
                Close
              </Button>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Menu sheet */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl border-border bg-background pb-safe-10">
          <h2 className="mb-4 text-lg font-extrabold text-foreground">{category.name}</h2>
          <div className="space-y-2">
            <button
              type="button"
              onClick={openEdit}
              className="flex w-full items-center gap-4 rounded-2xl border border-border bg-secondary p-4 text-left transition-colors active:scale-[0.99]"
            >
              <span className="font-bold text-foreground">Edit budget</span>
            </button>
            <button
              type="button"
              onClick={() => { setMenuOpen(false); setDeleteOpen(true) }}
              className="flex w-full items-center gap-4 rounded-2xl border border-[#FF8388]/30 bg-[#FF8388]/10 p-4 text-left transition-colors active:scale-[0.99]"
            >
              <span className="font-bold text-[#FF8388]">Delete category</span>
            </button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Edit sheet */}
      <Sheet open={editOpen} onOpenChange={v => setEditOpen(v)}>
        <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto rounded-t-3xl border-border bg-background pb-safe-10">
          <SheetHeader className="mb-5">
            <SheetTitle>Edit budget — {category.name}</SheetTitle>
          </SheetHeader>
          <div className="space-y-4">
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Amount ({money.baseCurrency})</p>
              <MoneyField
                ariaLabel="Budget amount"
                className="bg-secondary text-sm font-bold"
                value={String(editDraft.yearly_allocated || '')}
                currency={money.baseCurrency}
                onChange={v => setEditDraft(d => ({ ...d, yearly_allocated: parseNumberInput(v) }))}
              />
            </div>
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Period</p>
              <select
                aria-label="Budget period"
                className="h-11 w-full rounded-md border border-input bg-secondary px-3 text-sm font-bold text-foreground outline-none"
                value={editDraft.budget_period}
                onChange={e => setEditDraft(d => ({ ...d, budget_period: e.target.value as BudgetPeriod }))}
              >
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
            <div>
              <p className="mb-1.5 text-xs text-muted-foreground">Color</p>
              <div className="mb-2 flex flex-wrap gap-2">
                {PRESET_COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Select color ${c}`}
                    aria-pressed={editDraft.color === c}
                    className={`h-10 w-10 rounded-full border-2 transition-transform hover:scale-110 active:scale-95 ${editDraft.color === c ? 'border-foreground ring-1 ring-foreground/30' : 'border-transparent'}`}
                    style={{ backgroundColor: c }}
                    onClick={() => setEditDraft(d => ({ ...d, color: c }))}
                  />
                ))}
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <Button className="flex-1" onClick={saveEdit} disabled={updateCategory.isPending}>
                Save changes
              </Button>
              <Button variant="secondary" className="flex-1" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={deleteOpen}
        title={`Delete ${category.name}?`}
        description="This removes the budget category. Existing transactions will keep their category text."
        onCancel={() => setDeleteOpen(false)}
        onConfirm={confirmDelete}
      />
    </div>
  )
}
