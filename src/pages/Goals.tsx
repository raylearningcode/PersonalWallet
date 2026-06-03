import { useMemo, useState } from 'react'
import { useGoals, useAddGoal, useUpdateGoal, useDeleteGoal, useWallets, useAddTransaction, useAddRecurringRule } from '@/lib/queries'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatCard } from '@/components/shared/StatCard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { MoneyInput } from '@/components/shared/MoneyInput'
import { useMoney } from '@/lib/currency'
import { formatNumberInput, parseNumberInput } from '@/lib/numberInput'
import { toast } from 'sonner'
import { AlertTriangle, Bookmark, Check, ChevronRight, Plus, Pencil, Trash2, Target, TrendingUp, Copy, Zap } from 'lucide-react'
import { PINNED_GOAL_KEY } from '@/components/layout/Sidebar'
import type { Goal } from '@/types'
import { useIsDesktop } from '@/hooks/useIsDesktop'

const GOAL_COLORS = ['#A9F5C7', '#FADBEA', '#FFF7B5', '#D9E8FF', '#F8DCDC', '#C4AEFF', '#FFD276', '#93C5FD']

const GOAL_CATEGORIES = ['Savings', 'Emergency Fund', 'Vacation', 'Home', 'Vehicle', 'Education', 'Travel', 'Gadget', 'Health', 'Retirement', 'Investment', 'Other']

const GOAL_TEMPLATES: { name: string; category: string; color: string; emoji: string }[] = [
  { name: 'Emergency fund', category: 'Emergency Fund', color: '#FF8388', emoji: '🆘' },
  { name: 'Travel fund', category: 'Travel', color: '#93C5FD', emoji: '✈️' },
  { name: 'New laptop', category: 'Gadget', color: '#C4AEFF', emoji: '💻' },
  { name: 'Tuition', category: 'Education', color: '#FFD276', emoji: '🎓' },
  { name: 'Rent deposit', category: 'Home', color: '#A9F5C7', emoji: '🏠' },
  { name: 'New phone', category: 'Gadget', color: '#FADBEA', emoji: '📱' },
]

type FormState = {
  name: string
  target_amount: string
  current_amount: string
  deadline: string
  color: string
  category: string
  notes: string
}

const emptyForm = (): FormState => ({
  name: '',
  target_amount: '',
  current_amount: '',
  deadline: '',
  color: GOAL_COLORS[0],
  category: 'Savings',
  notes: '',
})

function getGoalUrgency(goal: Goal): 'urgent' | 'behind' | null {
  if (goal.current_amount >= goal.target_amount || !goal.deadline) return null
  const daysLeft = Math.ceil((new Date(goal.deadline).getTime() - Date.now()) / 86_400_000)
  const pct = goal.target_amount > 0 ? goal.current_amount / goal.target_amount : 0
  if (daysLeft <= 0) return 'urgent'
  if (daysLeft <= 30 && pct < 0.8) return 'urgent'
  if (daysLeft <= 60 && pct < 0.5) return 'behind'
  return null
}

export function Goals() {
  const money = useMoney()
  const isDesktop = useIsDesktop()
  const { data: goals = [] } = useGoals()
  const { data: wallets = [] } = useWallets()
  const addGoal = useAddGoal()
  const updateGoal = useUpdateGoal()
  const deleteGoal = useDeleteGoal()
  const addTransaction = useAddTransaction()
  const addRecurringRule = useAddRecurringRule()

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [sheetGoal, setSheetGoal] = useState<Goal | null>(null)
  const [contributeAmount, setContributeAmount] = useState('')
  const [contributeWalletId, setContributeWalletId] = useState('')
  const [contributeRepeat, setContributeRepeat] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Goal | null>(null)
  const [duplicateTarget, setDuplicateTarget] = useState<Goal | null>(null)
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})
  const [pinnedGoalId, setPinnedGoalId] = useState(() => localStorage.getItem(PINNED_GOAL_KEY) ?? '')

  const pinGoal = (goalId: string) => {
    const newId = pinnedGoalId === goalId ? '' : goalId
    setPinnedGoalId(newId)
    if (newId) localStorage.setItem(PINNED_GOAL_KEY, newId)
    else localStorage.removeItem(PINNED_GOAL_KEY)
    window.dispatchEvent(new CustomEvent('finpath-goal-pinned'))
    toast.success(newId ? 'Pinned to sidebar' : 'Unpinned from sidebar')
  }

  const totalTarget = useMemo(() => goals.reduce((s, g) => s + g.target_amount, 0), [goals])
  const totalSaved = useMemo(() => goals.reduce((s, g) => s + g.current_amount, 0), [goals])
  const overallPct = totalTarget > 0 ? Math.min(100, Math.round((totalSaved / totalTarget) * 100)) : 0
  const completedGoals = goals.filter(g => g.current_amount >= g.target_amount).length
  const urgentGoals = useMemo(() => goals.filter(g => getGoalUrgency(g) === 'urgent').length, [goals])
  const behindGoals = useMemo(() => goals.filter(g => getGoalUrgency(g) === 'behind').length, [goals])

  const setField = (key: keyof FormState, value: string) => {
    setForm(f => ({ ...f, [key]: value }))
    setErrors(e => ({ ...e, [key]: undefined }))
  }

  const validate = (): boolean => {
    const next: typeof errors = {}
    if (!form.name.trim()) next.name = 'Required'
    if (parseNumberInput(form.target_amount) <= 0) next.target_amount = 'Enter a target amount'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async () => {
    if (!validate()) return
    const payload = {
      name: form.name.trim(),
      target_amount: parseNumberInput(form.target_amount),
      current_amount: parseNumberInput(form.current_amount) || 0,
      deadline: form.deadline || null,
      color: form.color,
      category: form.category,
      notes: form.notes.trim(),
    }
    const prevEditingId = editingId
    setShowForm(false)  // optimistic close — no double-click needed
    setEditingId(null)
    setForm(emptyForm())
    setErrors({})
    try {
      if (prevEditingId) {
        await updateGoal.mutateAsync({ id: prevEditingId, ...payload })
        toast.success('Goal updated')
      } else {
        await addGoal.mutateAsync(payload)
        toast.success('Goal created')
      }
    } catch {
      setShowForm(true)  // reopen on failure
      setEditingId(prevEditingId)
      toast.error('Failed to save goal')
    }
  }

  const startEdit = (goal: Goal) => {
    setEditingId(goal.id)
    setForm({
      name: goal.name,
      target_amount: formatNumberInput(goal.target_amount),
      current_amount: formatNumberInput(goal.current_amount),
      deadline: goal.deadline ?? '',
      color: goal.color,
      category: goal.category,
      notes: goal.notes ?? '',
    })
    setShowForm(true)
    setErrors({})
  }

  const cancelForm = () => {
    setShowForm(false)
    setEditingId(null)
    setForm(emptyForm())
    setErrors({})
  }

  const handleContribute = async () => {
    if (!sheetGoal) return
    const amount = parseNumberInput(contributeAmount)
    if (amount <= 0) { toast.error('Enter a valid amount'); return }
    const target = sheetGoal
    const wallet = wallets.find(w => w.id === contributeWalletId)
    const newAmount = target.current_amount + amount
    const today = new Date().toISOString().slice(0, 10)
    setContributeAmount('')
    setContributeWalletId('')
    setContributeRepeat(false)
    try {
      await updateGoal.mutateAsync({ id: target.id, current_amount: newAmount })
      if (wallet) {
        await addTransaction.mutateAsync({
          user_id: null,
          description: `Goal: ${target.name}`,
          amount,
          original_amount: parseNumberInput(contributeAmount),
          original_currency: money.baseCurrency,
          type: 'expense',
          category: 'Goals',
          wallet_id: wallet.id,
          transfer_wallet_id: null,
          recurring_rule_id: null,
          recurring_due_date: null,
          date: today,
          needs_review: false,
        })
        if (contributeRepeat) {
          const nextMonth = new Date(today)
          nextMonth.setMonth(nextMonth.getMonth() + 1)
          await addRecurringRule.mutateAsync({
            user_id: null,
            description: `Goal: ${target.name}`,
            amount,
            original_amount: parseNumberInput(contributeAmount),
            original_currency: money.baseCurrency,
            type: 'expense',
            category: 'Goals',
            wallet_id: wallet.id,
            transfer_wallet_id: null,
            start_date: today,
            next_due_date: nextMonth.toISOString().slice(0, 10),
            frequency: 'monthly',
            end_date: target.deadline ?? null,
            installment_total: null,
            installment_paid: 0,
            active: true,
          })
        }
      }
      toast.success(
        contributeRepeat && wallet
          ? `Contribution logged + monthly repeat created`
          : wallet ? `Contribution from ${wallet.name} logged` : 'Contribution logged'
      )
    } catch {
      toast.error('Failed to log contribution')
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteGoal.mutateAsync(deleteTarget.id)
      toast.success('Goal deleted')
      setDeleteTarget(null)
    } catch {
      toast.error('Failed to delete goal')
    }
  }

  const handleDuplicateGoal = (goal: Goal) => {
    setDuplicateTarget(goal)
  }

  const confirmDuplicate = async (keepProgress: boolean) => {
    if (!duplicateTarget) return
    try {
      await addGoal.mutateAsync({
        name: `${duplicateTarget.name} (copy)`,
        target_amount: duplicateTarget.target_amount,
        current_amount: keepProgress ? duplicateTarget.current_amount : 0,
        deadline: duplicateTarget.deadline,
        color: duplicateTarget.color,
        category: duplicateTarget.category,
        notes: duplicateTarget.notes,
      })
      toast.success('Goal duplicated')
    } catch {
      toast.error('Failed to duplicate goal')
    } finally {
      setDuplicateTarget(null)
    }
  }

  const renderGoalForm = !showForm ? null : (
    <div className="space-y-4">
      {!editingId && (
        <div>
          <p className="mb-2 text-xs font-bold text-muted-foreground">Start from a template</p>
          <div className="flex flex-wrap gap-2">
            {GOAL_TEMPLATES.map(t => (
              <button
                key={t.name}
                type="button"
                onClick={() => setForm(f => ({ ...f, name: t.name, category: t.category, color: t.color }))}
                className="flex items-center gap-1.5 rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-bold text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground active:scale-95"
              >
                <span>{t.emoji}</span>{t.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label className="text-xs text-muted-foreground">Goal name *</Label>
          <Input
            className={`mt-2 bg-secondary ${errors.name ? 'border-[#FF8388]' : ''}`}
            value={form.name}
            autoFocus
            onChange={e => setField('name', e.target.value)}
            placeholder="Emergency fund"
          />
          {errors.name && <p className="mt-1 text-xs text-[#FF8388]">{errors.name}</p>}
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Category</Label>
          <select
            className="mt-2 h-11 w-full rounded-md border border-input bg-secondary px-3 text-sm font-bold text-foreground outline-none"
            value={form.category}
            onChange={e => setField('category', e.target.value)}
          >
            {GOAL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Target amount ({money.baseCurrency}) *</Label>
          <Input
            className={`mt-2 bg-secondary ${errors.target_amount ? 'border-[#FF8388]' : ''}`}
            inputMode="decimal"
            value={form.target_amount}
            onChange={e => setField('target_amount', formatNumberInput(e.target.value))}
            placeholder="0"
          />
          {errors.target_amount && <p className="mt-1 text-xs text-[#FF8388]">{errors.target_amount}</p>}
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Already saved ({money.baseCurrency})</Label>
          <Input
            className="mt-2 bg-secondary"
            inputMode="decimal"
            value={form.current_amount}
            onChange={e => setField('current_amount', formatNumberInput(e.target.value))}
            placeholder="0"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Target deadline <span className="font-normal opacity-60">(optional)</span></Label>
          <Input
            type="date"
            className="mt-2 bg-secondary"
            value={form.deadline}
            onChange={e => setField('deadline', e.target.value)}
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[
              { label: '+3 mo', months: 3 },
              { label: '+6 mo', months: 6 },
              { label: '+1 yr', months: 12 },
              { label: 'End of year', endOfYear: true },
            ].map(shortcut => {
              const target = new Date()
              if (shortcut.endOfYear) {
                target.setMonth(11); target.setDate(31)
              } else {
                target.setMonth(target.getMonth() + (shortcut.months ?? 0))
              }
              const value = target.toISOString().slice(0, 10)
              return (
                <button
                  key={shortcut.label}
                  type="button"
                  onClick={() => setField('deadline', value)}
                  className="rounded-full border border-border bg-secondary px-2.5 py-1 text-[11px] font-bold text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary active:scale-95"
                >
                  {shortcut.label}
                </button>
              )
            })}
          </div>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Color</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {GOAL_COLORS.map(c => (
              <button
                key={c}
                className={`h-11 w-11 rounded-full transition-transform active:scale-95 ${form.color === c ? 'scale-125 ring-2 ring-foreground ring-offset-2 ring-offset-background' : ''}`}
                style={{ backgroundColor: c }}
                onClick={() => setField('color', c)}
              />
            ))}
          </div>
        </div>
      </div>
      <div>
        <Label className="text-xs text-muted-foreground">Notes</Label>
        <Input
          className="mt-2 bg-secondary"
          value={form.notes}
          onChange={e => setField('notes', e.target.value)}
          placeholder="Optional context"
        />
      </div>
      <div className="flex gap-3">
        <Button onClick={handleSubmit} disabled={addGoal.isPending || updateGoal.isPending}>
          {editingId ? 'Save changes' : 'Create goal'}
        </Button>
        <Button variant="secondary" onClick={cancelForm}>Cancel</Button>
      </div>
    </div>
  )

  return (
    <div>
      <PageHeader
        title="Goals"
        subtitle="Track savings targets, monitor progress, and log contributions toward each goal."
        action={
          !showForm ? (
            <Button className="gap-2" onClick={() => { setShowForm(true); setEditingId(null); setForm(emptyForm()) }}>
              <Plus className="h-4 w-4" /> Add goal
            </Button>
          ) : undefined
        }
      />

      <div className="mb-8 hidden lg:grid lg:grid-cols-4 lg:gap-6">
        <StatCard
          label="Goals set"
          value={String(goals.length)}
          sub={urgentGoals > 0 ? `${urgentGoals} urgent · ${completedGoals} done` : behindGoals > 0 ? `${behindGoals} behind · ${completedGoals} done` : `${completedGoals} completed`}
          badgeVariant={urgentGoals > 0 ? 'danger' : behindGoals > 0 ? 'warning' : 'success'}
        />
        <StatCard label="Total target" value={money.formatDisplay(totalTarget)} sub={money.formatRef(totalTarget) ?? 'Across all goals'} />
        <StatCard label="Total saved" value={money.formatDisplay(totalSaved)} sub={money.formatRef(totalSaved) ?? `${overallPct}% of total target`} badgeVariant="warning" />
        <StatCard label="Still needed" value={money.formatDisplay(Math.max(0, totalTarget - totalSaved))} sub={money.formatRef(Math.max(0, totalTarget - totalSaved)) ?? 'Combined gap'} />
      </div>

      {/* "What should I save this month?" card */}
      {goals.filter(g => g.current_amount < g.target_amount && g.deadline).length > 0 && (
        <div className="mb-8 hidden rounded-2xl border border-primary/20 bg-primary/5 px-5 py-4 lg:block">
          <p className="mb-3 text-xs font-bold text-primary">Monthly savings guide</p>
          <div className="space-y-2">
            {goals
              .filter(g => g.current_amount < g.target_amount && g.deadline)
              .map(g => {
                const daysLeft = Math.ceil((new Date(g.deadline!).getTime() - Date.now()) / 86_400_000)
                if (daysLeft <= 0) return null
                const remaining = g.target_amount - g.current_amount
                const monthsLeft = Math.max(1, daysLeft / 30)
                const monthlyNeeded = Math.ceil(remaining / monthsLeft)
                return (
                  <div key={g.id} className="flex items-center justify-between gap-4">
                    <p className="truncate text-sm text-muted-foreground">{g.name}</p>
                    <span className="shrink-0 text-sm font-bold text-foreground">{money.formatDisplay(monthlyNeeded)}/mo</span>
                  </div>
                )
              })
              .filter(Boolean)}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Based on your deadlines — adjust contributions anytime.</p>
        </div>
      )}

      {showForm && isDesktop && (
        <Card className="mb-8">
          <CardHeader className="pb-3">
            <CardTitle className="text-xl">{editingId ? 'Edit goal' : 'New goal'}</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-6 sm:px-8">
            {renderGoalForm}
          </CardContent>
        </Card>
      )}
      <Sheet open={!!(showForm && !isDesktop)} onOpenChange={open => { if (!open) cancelForm() }}>
        <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto rounded-t-3xl pb-10">
          <SheetHeader className="mb-4 text-left">
            <SheetTitle className="text-xl">{editingId ? 'Edit goal' : 'New goal'}</SheetTitle>
            <SheetDescription className="sr-only">Goal form</SheetDescription>
          </SheetHeader>
          {renderGoalForm}
        </SheetContent>
      </Sheet>

      {goals.length === 0 && !showForm ? (
        <Card>
          <CardContent className="flex flex-col items-center px-8 py-16 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
              <Target className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-extrabold text-foreground">No goals yet</h3>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              Create your first savings goal — whether it's an emergency fund, vacation, or a big purchase.
            </p>
            <Button className="mt-6 gap-2" onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4" /> Add your first goal
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {goals.map(goal => {
            const pct = goal.target_amount > 0 ? Math.min(100, Math.round((goal.current_amount / goal.target_amount) * 100)) : 0
            const done = goal.current_amount >= goal.target_amount
            const remaining = Math.max(0, goal.target_amount - goal.current_amount)
            const daysLeft = goal.deadline ? Math.ceil((new Date(goal.deadline).getTime() - Date.now()) / 86_400_000) : null
            const urgency = getGoalUrgency(goal)

            return (
              <Card key={goal.id} className="relative overflow-hidden">
                <div className="pointer-events-none absolute inset-y-0 left-0 w-1 rounded-l-[inherit]" style={{ backgroundColor: goal.color }} />
                <CardContent className="p-0">
                  {/* Tappable card body → opens detail sheet */}
                  <button
                    type="button"
                    onClick={() => { setSheetGoal(goal); setContributeAmount(''); setContributeWalletId(wallets[0]?.id ?? '') }}
                    className="w-full rounded-[inherit] p-5 text-left transition-colors hover:bg-secondary/30 active:scale-[0.995] sm:p-6"
                    aria-label={`Open ${goal.name} details`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ backgroundColor: goal.color + '33', color: goal.color }}>{goal.category}</span>
                          {urgency && (
                            <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${urgency === 'urgent' ? 'bg-[#FF8388]/20 text-[#FF8388]' : 'bg-[#FFCF73]/20 text-[#FFCF73]'}`}>
                              {urgency === 'urgent' ? <Zap className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                              {urgency === 'urgent' ? 'Urgent' : 'Behind'}
                            </span>
                          )}
                        </div>
                        <h3 className="mt-2 line-clamp-2 text-lg font-extrabold text-foreground">{goal.name}</h3>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors ${pinnedGoalId === goal.id ? 'text-primary' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}
                          onClick={e => { e.stopPropagation(); pinGoal(goal.id) }}
                          aria-label={pinnedGoalId === goal.id ? 'Unpin from sidebar' : 'Pin to sidebar'}
                        >
                          <Bookmark className="h-4 w-4" fill={pinnedGoalId === goal.id ? 'currentColor' : 'none'} />
                        </button>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="flex items-end justify-between gap-2">
                        <div>
                          <p className="text-2xl font-extrabold text-foreground">{money.formatDisplay(goal.current_amount)}</p>
                          <p className="text-xs text-muted-foreground">of {money.formatDisplay(goal.target_amount)}</p>
                        </div>
                        <p className={`text-xl font-extrabold ${done ? 'text-primary' : 'text-foreground'}`}>{pct}%</p>
                      </div>
                      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: goal.color }} />
                      </div>
                    </div>

                    {done ? (
                      <div className="mt-3 flex items-center gap-2 rounded-xl bg-primary/10 px-3 py-2">
                        <TrendingUp className="h-4 w-4 text-primary" />
                        <p className="text-sm font-bold text-primary">Goal reached!</p>
                      </div>
                    ) : (
                      <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                        <div className="flex flex-wrap gap-3">
                          <span>{money.formatDisplay(remaining)} remaining</span>
                          {daysLeft !== null && (
                            <span className={daysLeft <= 0 ? 'font-bold text-[#FF8388]' : daysLeft < 14 ? 'font-bold text-[#FFCF73]' : ''}>
                              {daysLeft > 0 ? `${daysLeft}d left` : 'Deadline passed'}
                            </span>
                          )}
                        </div>
                        {daysLeft !== null && daysLeft > 0 && remaining > 0 && (
                          <p className="font-bold text-foreground">
                            Need {money.formatDisplay(Math.ceil(remaining / (daysLeft / 30)))}/month
                          </p>
                        )}
                      </div>
                    )}
                  </button>
                  {!done && (
                    <div className="border-t border-border px-5 py-3 sm:px-6">
                      <button
                        type="button"
                        onClick={() => { setSheetGoal(goal); setContributeAmount(''); setContributeWalletId(wallets[0]?.id ?? '') }}
                        className="w-full rounded-xl bg-primary/10 py-2.5 text-sm font-extrabold text-primary transition-colors hover:bg-primary/20 active:scale-[0.98]"
                        aria-label={`Log contribution to ${goal.name}`}
                      >
                        + Contribute
                      </button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Goal detail sheet */}
      <Sheet open={!!sheetGoal} onOpenChange={open => { if (!open) { setSheetGoal(null); setContributeAmount(''); setContributeWalletId(''); setContributeRepeat(false) } }}>
        <SheetContent side={isDesktop ? 'right' : 'bottom'} className={isDesktop ? 'w-full max-w-md overflow-y-auto border-border px-0 pb-0' : 'max-h-[92dvh] overflow-y-auto rounded-t-3xl px-0 pb-0'}>
          {sheetGoal && (() => {
            const g = sheetGoal
            const pct = g.target_amount > 0 ? Math.min(100, Math.round((g.current_amount / g.target_amount) * 100)) : 0
            const done = g.current_amount >= g.target_amount
            const remaining = Math.max(0, g.target_amount - g.current_amount)
            const daysLeft = g.deadline ? Math.ceil((new Date(g.deadline).getTime() - Date.now()) / 86_400_000) : null
            const urgency = getGoalUrgency(g)
            const requiredMonthly = g.deadline && daysLeft !== null && daysLeft > 0
              ? Math.ceil(remaining / Math.max(1, daysLeft / 30))
              : null
            const now = new Date()
            const monthsSoFar = g.deadline
              ? Math.max(1, (new Date(g.deadline).getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30))
              : 6
            const monthlyRate = g.current_amount / Math.max(1, monthsSoFar)
            const monthsToComplete = monthlyRate > 0 && !done ? Math.ceil(remaining / monthlyRate) : null

            return (
              <div>
                <div className="px-6 pb-4 pt-2">
                  <SheetHeader className="mb-4 text-left">
                    <div className="flex flex-wrap items-center gap-1.5 mb-1">
                      <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ backgroundColor: g.color + '33', color: g.color }}>{g.category}</span>
                      {urgency && (
                        <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${urgency === 'urgent' ? 'bg-[#FF8388]/20 text-[#FF8388]' : 'bg-[#FFCF73]/20 text-[#FFCF73]'}`}>
                          {urgency === 'urgent' ? <Zap className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                          {urgency === 'urgent' ? 'Urgent' : 'Behind'}
                        </span>
                      )}
                    </div>
                    <SheetTitle className="text-xl font-extrabold">{g.name}</SheetTitle>
                    <SheetDescription className="sr-only">Goal details</SheetDescription>
                  </SheetHeader>

                  {/* Progress */}
                  <div className="mb-5 text-center">
                    <p className={`text-5xl font-extrabold tracking-tight ${done ? 'text-primary' : 'text-foreground'}`}>{pct}%</p>
                    <p className="mt-1 text-sm text-muted-foreground">{money.formatDisplay(g.current_amount)} of {money.formatDisplay(g.target_amount)}</p>
                    <div className="mx-auto mt-3 h-3 w-full max-w-xs overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: g.color }} />
                    </div>
                    {done && (
                      <div className="mx-auto mt-3 flex max-w-xs items-center justify-center gap-2 rounded-xl bg-primary/10 px-4 py-2">
                        <TrendingUp className="h-4 w-4 text-primary" />
                        <p className="text-sm font-bold text-primary">Goal reached!</p>
                      </div>
                    )}
                  </div>

                  {/* Stats grid */}
                  <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      { label: 'Saved', value: money.formatDisplay(g.current_amount) },
                      { label: 'Target', value: money.formatDisplay(g.target_amount) },
                      { label: 'Remaining', value: money.formatDisplay(remaining) },
                      { label: 'Deadline', value: g.deadline ? (daysLeft !== null && daysLeft <= 0 ? 'Passed' : daysLeft !== null ? `${daysLeft}d left` : g.deadline) : 'None' },
                    ].map(({ label, value }) => (
                      <div key={label} className="rounded-xl border border-border bg-secondary/50 px-3 py-3 text-center">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
                        <p className="mt-1 text-sm font-extrabold text-foreground">{value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Pace info */}
                  {!done && (
                    <div className="mb-5 space-y-1.5 rounded-xl border border-border bg-secondary/50 px-4 py-3 text-sm">
                      {monthsToComplete !== null && (
                        <p className="text-muted-foreground">At this pace: completes in ~{monthsToComplete} month{monthsToComplete !== 1 ? 's' : ''}</p>
                      )}
                      {requiredMonthly !== null && (
                        <p className="font-bold text-primary">Save {money.formatDisplay(requiredMonthly)}/month to meet deadline</p>
                      )}
                      {daysLeft !== null && daysLeft <= 0 && (
                        <p className="font-bold text-[#FF8388]">Deadline passed — consider extending it</p>
                      )}
                    </div>
                  )}

                  {g.notes && (
                    <p className="mb-5 text-sm text-muted-foreground">{g.notes}</p>
                  )}

                  {/* Contribute section */}
                  {!done && (
                    <div className="mb-5 space-y-3">
                      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Log contribution</p>
                      <select
                        aria-label="Wallet source"
                        className="h-11 w-full rounded-xl border border-input bg-secondary px-3 text-sm font-bold text-foreground outline-none"
                        value={contributeWalletId}
                        onChange={e => setContributeWalletId(e.target.value)}
                      >
                        <option value="">From: no specific wallet</option>
                        {wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                      </select>
                      <MoneyInput
                        className="h-11 w-full bg-secondary"
                        placeholder={`Amount (${money.baseCurrency})`}
                        value={contributeAmount}
                        onValueChange={setContributeAmount}
                      />
                      {contributeWalletId && (
                        <button
                          type="button"
                          onClick={() => setContributeRepeat(r => !r)}
                          className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${contributeRepeat ? 'border-primary/40 bg-primary/10' : 'border-border bg-secondary hover:border-primary/30'}`}
                        >
                          <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${contributeRepeat ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}>
                            {contributeRepeat && <Check className="h-3 w-3" />}
                          </span>
                          <div className="min-w-0">
                            <p className={`text-sm font-bold ${contributeRepeat ? 'text-primary' : 'text-foreground'}`}>Repeat monthly</p>
                            <p className="text-xs text-muted-foreground">Create a recurring rule for this amount</p>
                          </div>
                        </button>
                      )}
                      <Button
                        className="h-14 w-full"
                        onClick={handleContribute}
                        disabled={updateGoal.isPending || addTransaction.isPending || addRecurringRule.isPending || !contributeAmount}
                      >
                        {contributeRepeat ? 'Log + set monthly repeat' : 'Log contribution'}
                      </Button>
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                <div className="sticky bottom-0 border-t border-border bg-background px-6 py-4">
                  <div className="flex gap-2">
                    <Button
                      className="h-14 flex-1 gap-2"
                      variant="secondary"
                      onClick={() => { setSheetGoal(null); startEdit(g) }}
                    >
                      <Pencil className="h-4 w-4" />Edit
                    </Button>
                    <Button
                      className="h-14 px-4 gap-2"
                      variant="secondary"
                      onClick={() => { setSheetGoal(null); handleDuplicateGoal(g) }}
                      aria-label="Duplicate goal"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      className="h-14 px-5 gap-2 border border-[#FF8388]/30 bg-[#FF8388]/10 text-[#FF8388] hover:bg-[#FF8388]/20"
                      variant="ghost"
                      onClick={() => { setSheetGoal(null); setDeleteTarget(g) }}
                      aria-label="Delete goal"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )
          })()}
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={deleteTarget ? `Delete "${deleteTarget.name}"?` : ''}
        description="This will permanently remove this goal and its progress."
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />

      {duplicateTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/75 px-4 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-[1.3rem] border border-border bg-card p-5 shadow-2xl">
            <h2 className="text-lg font-extrabold text-foreground">Duplicate goal?</h2>
            <p className="mt-2 text-sm leading-5 text-muted-foreground">
              Copy <span className="font-bold text-foreground">{duplicateTarget.name}</span>. Keep saved progress or start fresh?
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => confirmDuplicate(false)}
                className="w-full rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90 active:opacity-80"
              >
                Reset to 0
              </button>
              <button
                type="button"
                onClick={() => confirmDuplicate(true)}
                className="w-full rounded-xl border border-border bg-secondary py-2.5 text-sm font-bold text-foreground transition-colors hover:bg-muted active:opacity-80"
              >
                Keep current progress ({money.formatDisplay(duplicateTarget.current_amount)})
              </button>
              <button
                type="button"
                onClick={() => setDuplicateTarget(null)}
                className="w-full py-2 text-sm text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
