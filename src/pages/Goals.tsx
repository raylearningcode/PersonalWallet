import { useMemo, useState } from 'react'
import { useGoals, useAddGoal, useUpdateGoal, useDeleteGoal, useWallets } from '@/lib/queries'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatCard } from '@/components/shared/StatCard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { useMoney } from '@/lib/currency'
import { formatNumberInput, parseNumberInput } from '@/lib/numberInput'
import { toast } from 'sonner'
import { Bookmark, Plus, Pencil, Trash2, Target, TrendingUp } from 'lucide-react'
import { PINNED_GOAL_KEY } from '@/components/layout/Sidebar'
import type { Goal } from '@/types'

const GOAL_COLORS = ['#A9F5C7', '#FADBEA', '#FFF7B5', '#D9E8FF', '#F8DCDC', '#C4AEFF', '#FFD276', '#93C5FD']

const GOAL_CATEGORIES = ['Savings', 'Emergency Fund', 'Vacation', 'Home', 'Vehicle', 'Education', 'Retirement', 'Investment', 'Other']

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
  const { data: goals = [] } = useGoals()
  const { data: wallets = [] } = useWallets()
  const addGoal = useAddGoal()
  const updateGoal = useUpdateGoal()
  const deleteGoal = useDeleteGoal()

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [contributeTarget, setContributeTarget] = useState<Goal | null>(null)
  const [contributeAmount, setContributeAmount] = useState('')
  const [contributeWalletId, setContributeWalletId] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Goal | null>(null)
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
      target_amount: money.toBase(parseNumberInput(form.target_amount), money.displayCurrency),
      current_amount: money.toBase(parseNumberInput(form.current_amount) || 0, money.displayCurrency),
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
      target_amount: formatNumberInput(money.fromBase(goal.target_amount, money.displayCurrency)),
      current_amount: formatNumberInput(money.fromBase(goal.current_amount, money.displayCurrency)),
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
    if (!contributeTarget) return
    const amount = money.toBase(parseNumberInput(contributeAmount), money.displayCurrency)
    if (amount <= 0) return
    try {
      await updateGoal.mutateAsync({
        id: contributeTarget.id,
        current_amount: contributeTarget.current_amount + amount,
      })
      const walletName = wallets.find(w => w.id === contributeWalletId)?.name
      toast.success(walletName ? `Contribution from ${walletName} logged` : 'Contribution logged')
      setContributeTarget(null)
      setContributeAmount('')
      setContributeWalletId('')
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

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
        <StatCard label="Goals set" value={String(goals.length)} sub={`${completedGoals} completed`} badgeVariant="success" />
        <StatCard label="Total target" value={money.formatDisplay(totalTarget)} sub="Across all goals" />
        <StatCard label="Total saved" value={money.formatDisplay(totalSaved)} sub={`${overallPct}% of total target`} badgeVariant="warning" />
        <StatCard label="Still needed" value={money.formatDisplay(Math.max(0, totalTarget - totalSaved))} sub="Combined gap" />
      </div>

      {showForm && (
        <Card className="mb-8">
          <CardHeader className="pb-3">
            <CardTitle className="text-xl">{editingId ? 'Edit goal' : 'New goal'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 px-5 pb-6 sm:px-8">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label className="text-xs text-muted-foreground">Goal name *</Label>
                <Input
                  className={`mt-2 bg-secondary ${errors.name ? 'border-[#FF8388]' : ''}`}
                  value={form.name}
                  onChange={e => setField('name', e.target.value)}
                  placeholder="Emergency fund"
                />
                {errors.name && <p className="mt-1 text-xs text-[#FF8388]">{errors.name}</p>}
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Category</Label>
                <select
                  className="mt-2 h-10 w-full rounded-md border border-input bg-secondary px-3 text-sm font-bold text-foreground outline-none"
                  value={form.category}
                  onChange={e => setField('category', e.target.value)}
                >
                  {GOAL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Target amount ({money.displayCurrency}) *</Label>
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
                <Label className="text-xs text-muted-foreground">Already saved ({money.displayCurrency})</Label>
                <Input
                  className="mt-2 bg-secondary"
                  inputMode="decimal"
                  value={form.current_amount}
                  onChange={e => setField('current_amount', formatNumberInput(e.target.value))}
                  placeholder="0"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Target deadline</Label>
                <Input
                  type="date"
                  className="mt-2 bg-secondary"
                  value={form.deadline}
                  onChange={e => setField('deadline', e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Color</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {GOAL_COLORS.map(c => (
                    <button
                      key={c}
                      className={`h-7 w-7 rounded-full transition-transform ${form.color === c ? 'scale-125 ring-2 ring-foreground ring-offset-2 ring-offset-background' : ''}`}
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
          </CardContent>
        </Card>
      )}

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

            // Completion forecast
            const now = new Date()
            const monthsSoFar = goal.deadline
              ? Math.max(1, (new Date(goal.deadline).getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30))
              : 6
            const monthlyRate = goal.current_amount / Math.max(1, monthsSoFar)
            const monthsToComplete = monthlyRate > 0 ? Math.ceil(remaining / monthlyRate) : null
            const requiredMonthly = goal.deadline && daysLeft !== null && daysLeft > 0
              ? Math.ceil(remaining / Math.max(1, daysLeft / 30))
              : null

            return (
              <Card key={goal.id} className="relative overflow-hidden">
                <div className="pointer-events-none absolute inset-y-0 left-0 w-1 rounded-l-[inherit]" style={{ backgroundColor: goal.color }} />
                <CardContent className="p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ backgroundColor: goal.color + '33', color: goal.color }}>{goal.category}</span>
                      {(() => {
                        const urgency = getGoalUrgency(goal)
                        if (!urgency) return null
                        return (
                          <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-bold ${urgency === 'urgent' ? 'bg-[#FF8388]/20 text-[#FF8388]' : 'bg-[#FFCF73]/20 text-[#FFCF73]'}`}>
                            {urgency === 'urgent' ? '⚡ Urgent' : '⚠ Behind'}
                          </span>
                        )
                      })()}
                      <h3 className="mt-2 truncate text-lg font-extrabold text-foreground">{goal.name}</h3>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        className={`min-h-[44px] min-w-[44px] rounded-xl p-2.5 transition-colors ${pinnedGoalId === goal.id ? 'text-primary' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}
                        onClick={() => pinGoal(goal.id)}
                        title={pinnedGoalId === goal.id ? 'Unpin from sidebar' : 'Pin to sidebar'}
                        aria-label={pinnedGoalId === goal.id ? 'Unpin from sidebar' : 'Pin to sidebar'}
                      >
                        <Bookmark className="h-4 w-4" fill={pinnedGoalId === goal.id ? 'currentColor' : 'none'} />
                      </button>
                      <button
                        type="button"
                        className="min-h-[44px] min-w-[44px] rounded-xl p-2.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                        onClick={() => startEdit(goal)}
                        title="Edit goal"
                        aria-label={`Edit ${goal.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className="min-h-[44px] min-w-[44px] rounded-xl p-2.5 text-muted-foreground hover:bg-secondary hover:text-[#FF8388] disabled:opacity-40"
                        onClick={() => setDeleteTarget(goal)}
                        disabled={deleteGoal.isPending}
                        title="Delete goal"
                        aria-label={`Delete ${goal.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
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
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: goal.color }}
                      />
                    </div>
                  </div>

                  {done ? (
                    <div className="mt-3 flex items-center gap-2 rounded-xl bg-primary/10 px-3 py-2">
                      <TrendingUp className="h-4 w-4 text-primary" />
                      <p className="text-sm font-bold text-primary">Goal reached!</p>
                    </div>
                  ) : (
                    <>
                      <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
                        <span>{money.formatDisplay(remaining)} remaining</span>
                        {daysLeft !== null && (
                          <span className={daysLeft <= 0 ? 'font-bold text-[#FF8388]' : daysLeft < 14 ? 'font-bold text-[#FFCF73]' : ''}>
                            {daysLeft > 0 ? `${daysLeft}d left` : 'Deadline passed'}
                          </span>
                        )}
                      </div>
                      {/* Completion forecast */}
                      {daysLeft !== null && daysLeft <= 0 ? (
                        <div className="mt-2 space-y-1 rounded-xl border border-[#FF8388]/20 bg-[#FF8388]/5 px-3 py-2">
                          <p className="text-xs font-bold text-[#FF8388]">Deadline passed — recovery options:</p>
                          <p className="text-xs text-muted-foreground">Extend deadline by 6 months</p>
                          {monthlyRate > 0 && (
                            <p className="text-xs text-muted-foreground">Increase monthly contribution to {money.formatDisplay(Math.ceil(remaining / 6))}/month</p>
                          )}
                        </div>
                      ) : (
                        <div className="mt-2 space-y-0.5">
                          {monthsToComplete !== null && (
                            <p className="text-xs text-muted-foreground">At this pace, goal completes in ~{monthsToComplete} month{monthsToComplete !== 1 ? 's' : ''}</p>
                          )}
                          {requiredMonthly !== null && (
                            <p className="text-xs text-primary">To finish by deadline, save {money.formatDisplay(requiredMonthly)}/month</p>
                          )}
                        </div>
                      )}
                    </>
                  )}

                  {goal.notes && <p className="mt-3 text-xs text-muted-foreground">{goal.notes}</p>}

                  {!done && (
                    contributeTarget?.id === goal.id ? (
                      <div className="mt-4 space-y-2">
                        <select
                          aria-label="Wallet source"
                          className="h-9 w-full rounded-xl border border-input bg-secondary px-3 text-sm font-bold text-foreground outline-none"
                          value={contributeWalletId}
                          onChange={e => setContributeWalletId(e.target.value)}
                        >
                          <option value="">From: no specific wallet</option>
                          {wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                        </select>
                        <div className="flex gap-2">
                          <Input
                            className="h-9 bg-secondary text-sm"
                            inputMode="decimal"
                            placeholder={`Amount (${money.displayCurrency})`}
                            value={contributeAmount}
                            onChange={e => setContributeAmount(formatNumberInput(e.target.value))}
                            autoFocus
                          />
                          <Button size="sm" className="shrink-0" onClick={handleContribute} disabled={updateGoal.isPending}>Log</Button>
                          <Button size="sm" variant="secondary" className="shrink-0" onClick={() => { setContributeTarget(null); setContributeAmount(''); setContributeWalletId('') }}>✕</Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="mt-4 w-full"
                        onClick={() => { setContributeTarget(goal); setContributeAmount('') }}
                      >
                        Log contribution
                      </Button>
                    )
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={deleteTarget ? `Delete "${deleteTarget.name}"?` : ''}
        description="This will permanently remove this goal and its progress."
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  )
}
