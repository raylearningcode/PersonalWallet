import { useState } from 'react'
import { Navigate, useParams, useNavigate } from 'react-router-dom'
import { useGoals, useWallets, useUpdateGoal, useDeleteGoal, useAddTransaction, useAddRecurringRule } from '@/lib/queries'
import { useMoney } from '@/lib/currency'
import { useIsDesktop } from '@/hooks/useIsDesktop'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { MoneyKeypad } from '@/components/mobile/MoneyKeypad'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { formatNumberInput, parseNumberInput } from '@/lib/numberInput'
import { safeGet, todayLocal, toLocalDateStr } from '@/lib/utils'
import { toast } from 'sonner'
import { AlertTriangle, ArrowLeft, Bookmark, Check, Pencil, Trash2, TrendingUp, Zap } from 'lucide-react'
import { PINNED_GOAL_KEY } from '@/components/layout/Sidebar'
import type { Goal } from '@/types'

const GOAL_COLORS = ['#A9F5C7', '#FADBEA', '#FFF7B5', '#D9E8FF', '#F8DCDC', '#C4AEFF', '#FFD276', '#93C5FD']

const GOAL_CATEGORIES = ['Savings', 'Emergency Fund', 'Vacation', 'Home', 'Vehicle', 'Education', 'Travel', 'Gadget', 'Health', 'Retirement', 'Investment', 'Other']

type FormState = {
  name: string
  target_amount: string
  current_amount: string
  deadline: string
  color: string
  category: string
  notes: string
}

const emptyForm = (goal?: Goal): FormState => ({
  name: goal?.name ?? '',
  target_amount: goal ? formatNumberInput(goal.target_amount) : '',
  current_amount: goal ? formatNumberInput(goal.current_amount) : '',
  deadline: goal?.deadline ?? '',
  color: goal?.color ?? GOAL_COLORS[0],
  category: goal?.category ?? 'Savings',
  notes: goal?.notes ?? '',
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

export function GoalDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isDesktop = useIsDesktop()
  const money = useMoney()

  const { data: goals = [] } = useGoals()
  const { data: wallets = [] } = useWallets()
  const updateGoal = useUpdateGoal()
  const deleteGoal = useDeleteGoal()
  const addTransaction = useAddTransaction()
  const addRecurringRule = useAddRecurringRule()

  const [contributeAmount, setContributeAmount] = useState('')
  const [contributeWalletId, setContributeWalletId] = useState(() => '')
  const [contributeRepeat, setContributeRepeat] = useState(false)
  const [contributeKeypad, setContributeKeypad] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})
  const [formKeypad, setFormKeypad] = useState<'target_amount' | 'current_amount' | null>(null)
  const [pinnedGoalId, setPinnedGoalId] = useState(() => safeGet(PINNED_GOAL_KEY) ?? '')

  // Desktop redirects to /goals — desktop uses the sheet
  if (isDesktop) {
    return <Navigate to="/goals" replace />
  }

  const goal = goals.find(g => g.id === id)

  if (!goal) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center px-6">
        <p className="text-base font-bold text-foreground">Goal not found</p>
        <p className="mt-1 text-sm text-muted-foreground">This goal may have been deleted.</p>
        <Button className="mt-2" onClick={() => navigate('/goals')}>Back to Goals</Button>
      </div>
    )
  }

  const pct = goal.target_amount > 0 ? Math.min(100, Math.round((goal.current_amount / goal.target_amount) * 100)) : 0
  const done = goal.current_amount >= goal.target_amount
  const remaining = Math.max(0, goal.target_amount - goal.current_amount)
  const daysLeft = goal.deadline ? Math.ceil((new Date(goal.deadline).getTime() - Date.now()) / 86_400_000) : null
  const urgency = getGoalUrgency(goal)
  const requiredMonthly = goal.deadline && daysLeft !== null && daysLeft > 0
    ? Math.ceil(remaining / Math.max(1, daysLeft / 30))
    : null
  const now = new Date()
  const monthsSoFar = goal.deadline
    ? Math.max(1, (new Date(goal.deadline).getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30))
    : 6
  const monthlyRate = goal.current_amount / Math.max(1, monthsSoFar)
  const monthsToComplete = monthlyRate > 0 && !done ? Math.ceil(remaining / monthlyRate) : null

  const pinGoal = (goalId: string) => {
    const newId = pinnedGoalId === goalId ? '' : goalId
    setPinnedGoalId(newId)
    if (newId) localStorage.setItem(PINNED_GOAL_KEY, newId)
    else localStorage.removeItem(PINNED_GOAL_KEY)
    window.dispatchEvent(new CustomEvent('finpath-goal-pinned'))
    toast.success(newId ? 'Pinned to sidebar' : 'Unpinned from sidebar')
  }

  const handleContribute = async () => {
    const amount = parseNumberInput(contributeAmount)
    if (amount <= 0) { toast.error('Enter a valid amount'); return }
    const target = goal
    const wallet = wallets.find(w => w.id === contributeWalletId)
    const newAmount = target.current_amount + amount
    const today = todayLocal()
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
            next_due_date: toLocalDateStr(nextMonth),
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
          ? 'Contribution logged + monthly repeat created'
          : wallet ? `Contribution from ${wallet.name} logged` : 'Contribution logged'
      )
    } catch {
      toast.error('Failed to log contribution')
    }
  }

  const handleDelete = async () => {
    try {
      await deleteGoal.mutateAsync(goal.id)
      toast.success('Goal deleted')
      setDeleteOpen(false)
      navigate('/goals')
    } catch {
      toast.error('Failed to delete goal')
    }
  }

  const openEdit = () => {
    setForm(emptyForm(goal))
    setErrors({})
    setEditOpen(true)
  }

  const setField = (key: keyof FormState, value: string) => {
    setForm(f => ({ ...f, [key]: value }))
    setErrors(e => ({ ...e, [key]: undefined }))
  }

  const handleEditSubmit = async () => {
    const next: Partial<Record<keyof FormState, string>> = {}
    if (!form.name.trim()) next.name = 'Required'
    if (parseNumberInput(form.target_amount) <= 0) next.target_amount = 'Enter a target amount'
    setErrors(next)
    if (Object.keys(next).length > 0) return

    const payload = {
      name: form.name.trim(),
      target_amount: parseNumberInput(form.target_amount),
      current_amount: parseNumberInput(form.current_amount) || 0,
      deadline: form.deadline || null,
      color: form.color,
      category: form.category,
      notes: form.notes.trim(),
    }
    setEditOpen(false)
    try {
      await updateGoal.mutateAsync({ id: goal.id, ...payload })
      toast.success('Goal updated')
    } catch {
      setEditOpen(true)
      toast.error('Failed to save goal')
    }
  }

  return (
    <div className="pb-32">
      {/* Header */}
      <div className="-mx-4 -mt-2 mb-2 flex items-center justify-between gap-2 border-b border-border bg-background/95 px-4 py-3">
        <button
          type="button"
          aria-label="Go back"
          onClick={() => navigate('/goals')}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-secondary text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="flex-1 truncate text-center text-sm font-extrabold text-foreground">{goal.name}</h1>
        <button
          type="button"
          className={`flex h-10 w-10 items-center justify-center rounded-full border border-border bg-secondary transition-colors ${pinnedGoalId === goal.id ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
          onClick={() => pinGoal(goal.id)}
          aria-label={pinnedGoalId === goal.id ? 'Unpin from sidebar' : 'Pin to sidebar'}
        >
          <Bookmark className="h-4 w-4" fill={pinnedGoalId === goal.id ? 'currentColor' : 'none'} />
        </button>
      </div>

      <div className="px-1">
        {/* Badges */}
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ backgroundColor: goal.color + '33', color: goal.color }}>{goal.category}</span>
          {urgency && (
            <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${urgency === 'urgent' ? 'bg-[#FF8388]/20 text-[#FF8388]' : 'bg-[#FFCF73]/20 text-[#FFCF73]'}`}>
              {urgency === 'urgent' ? <Zap className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
              {urgency === 'urgent' ? 'Urgent' : 'Behind'}
            </span>
          )}
        </div>

        {/* Goal name */}
        <h2 className="mb-2 text-2xl font-extrabold text-foreground">{goal.name}</h2>

        {/* Progress */}
        <div className="mb-2 text-center">
          <p className={`text-5xl font-extrabold tracking-tight ${done ? 'text-primary' : 'text-foreground'}`}>{pct}%</p>
          <p className="mt-1 text-sm text-muted-foreground">{money.formatDisplay(goal.current_amount)} of {money.formatDisplay(goal.target_amount)}</p>
          <div className="mx-auto mt-3 h-3 w-full max-w-xs overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: goal.color }} />
          </div>
          {done && (
            <div className="mx-auto mt-3 flex max-w-xs items-center justify-center gap-2 rounded-xl bg-primary/10 px-4 py-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <p className="text-sm font-bold text-primary">Goal reached!</p>
            </div>
          )}
        </div>

        {/* Stats grid */}
        <div className="mb-2 grid grid-cols-2 gap-3">
          {[
            { label: 'Saved', value: money.formatDisplay(goal.current_amount) },
            { label: 'Target', value: money.formatDisplay(goal.target_amount) },
            { label: 'Remaining', value: money.formatDisplay(remaining) },
            { label: 'Deadline', value: goal.deadline ? (daysLeft !== null && daysLeft <= 0 ? 'Passed' : daysLeft !== null ? `${daysLeft}d left` : goal.deadline) : 'None' },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-xl border border-border bg-secondary/50 px-3 py-3 text-center">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
              <p className="mt-1 text-sm font-extrabold text-foreground">{value}</p>
            </div>
          ))}
        </div>

        {/* Pace info */}
        {!done && (
          <div className="mb-2 space-y-1.5 rounded-xl border border-border bg-secondary/50 px-4 py-3 text-sm">
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

        {goal.notes && (
          <p className="mb-2 text-sm text-muted-foreground">{goal.notes}</p>
        )}

        {/* Contribute section */}
        {!done && (
          <div className="mb-2 space-y-3">
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
            <Input
              readOnly
              className="h-11 w-full bg-secondary"
              placeholder={`Amount (${money.baseCurrency})`}
              value={contributeAmount}
              onChange={e => setContributeAmount(formatNumberInput(e.target.value))}
              onClick={() => setContributeKeypad(true)}
              onFocus={() => setContributeKeypad(true)}
            />
            {contributeKeypad && (
              <MoneyKeypad
                value={contributeAmount}
                onChange={setContributeAmount}
                currency={money.baseCurrency}
                onDone={() => setContributeKeypad(false)}
                doneLabel="Done"
              />
            )}
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

      {/* Action buttons — sticky bottom */}
      <div className="fixed bottom-0 left-0 right-0 z-10 border-t border-border bg-background px-4 pt-4 pb-safe-4">
        <div className="flex gap-2">
          <Button
            className="h-14 flex-1 gap-2"
            variant="secondary"
            onClick={openEdit}
          >
            <Pencil className="h-4 w-4" />Edit
          </Button>
          <Button
            className="h-14 px-5 gap-2 border border-[#FF8388]/30 bg-[#FF8388]/10 text-[#FF8388] hover:bg-[#FF8388]/20"
            variant="ghost"
            onClick={() => setDeleteOpen(true)}
            aria-label="Delete goal"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Edit Sheet */}
      <Sheet open={editOpen} onOpenChange={open => { if (!open) { setEditOpen(false); setFormKeypad(null) } }}>
        <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto rounded-t-3xl pb-safe-10">
          <SheetHeader className="mb-2 text-left">
            <SheetTitle className="text-xl">Edit goal</SheetTitle>
            <SheetDescription className="sr-only">Edit goal form</SheetDescription>
          </SheetHeader>
          <div className="space-y-2">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
                  readOnly
                  value={form.target_amount}
                  placeholder="0"
                  onClick={() => setFormKeypad('target_amount')}
                  onFocus={() => setFormKeypad('target_amount')}
                />
                {errors.target_amount && <p className="mt-1 text-xs text-[#FF8388]">{errors.target_amount}</p>}
                {formKeypad === 'target_amount' && (
                  <MoneyKeypad
                    value={form.target_amount}
                    onChange={v => setField('target_amount', v)}
                    currency={money.baseCurrency}
                    onDone={() => setFormKeypad(null)}
                    doneLabel="Done"
                  />
                )}
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Already saved ({money.baseCurrency})</Label>
                <Input
                  className="mt-2 bg-secondary"
                  readOnly
                  value={form.current_amount}
                  placeholder="0"
                  onClick={() => setFormKeypad('current_amount')}
                  onFocus={() => setFormKeypad('current_amount')}
                />
                {formKeypad === 'current_amount' && (
                  <MoneyKeypad
                    value={form.current_amount}
                    onChange={v => setField('current_amount', v)}
                    currency={money.baseCurrency}
                    onDone={() => setFormKeypad(null)}
                    doneLabel="Done"
                  />
                )}
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
                    const d = new Date()
                    if (shortcut.endOfYear) {
                      d.setMonth(11); d.setDate(31)
                    } else {
                      d.setMonth(d.getMonth() + (shortcut.months ?? 0))
                    }
                    const value = toLocalDateStr(d)
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
              <Button onClick={handleEditSubmit} disabled={updateGoal.isPending}>
                Save changes
              </Button>
              <Button variant="secondary" onClick={() => { setEditOpen(false); setFormKeypad(null) }}>Cancel</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={deleteOpen}
        title={`Delete "${goal.name}"?`}
        description="This will permanently remove this goal and its progress."
        onCancel={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
      />
    </div>
  )
}
