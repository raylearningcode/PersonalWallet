import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarChart2, Calculator, PieChart, RefreshCw, Settings, TrendingUp } from 'lucide-react'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { useGoals } from '@/lib/queries'
import { PINNED_GOAL_KEY } from './Sidebar'

const MORE_NAV = [
  { to: '/budget', label: 'Budget', Icon: PieChart },
  { to: '/subscriptions', label: 'Subscriptions', Icon: RefreshCw },
  { to: '/investing', label: 'Investing', Icon: TrendingUp },
  { to: '/estimation', label: 'Planning', Icon: Calculator },
  { to: '/reports', label: 'Reports', Icon: BarChart2 },
  { to: '/settings', label: 'Settings', Icon: Settings },
]

interface MoreSheetProps {
  open: boolean
  onClose: () => void
}

export function MoreSheet({ open, onClose }: MoreSheetProps) {
  const { data: goals = [] } = useGoals()
  const navigate = useNavigate()

  const [pinnedGoalId, setPinnedGoalId] = useState(() => localStorage.getItem(PINNED_GOAL_KEY) ?? '')

  useEffect(() => {
    const handler = () => setPinnedGoalId(localStorage.getItem(PINNED_GOAL_KEY) ?? '')
    window.addEventListener('finpath-goal-pinned', handler)
    return () => window.removeEventListener('finpath-goal-pinned', handler)
  }, [])

  const displayGoal = useMemo(() => {
    if (pinnedGoalId) {
      const found = goals.find(g => g.id === pinnedGoalId)
      if (found) return found
    }
    return goals.find(g => g.current_amount < g.target_amount) ?? goals[0] ?? null
  }, [goals, pinnedGoalId])

  const goalPct = displayGoal && displayGoal.target_amount > 0
    ? Math.min(100, Math.round((displayGoal.current_amount / displayGoal.target_amount) * 100))
    : 0

  const handleNav = (to: string) => {
    navigate(to)
    onClose()
  }

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="bottom" className="rounded-t-2xl border-border bg-background pb-8">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-foreground">More</h2>
        </div>
        <div className="mb-6 flex flex-col gap-2">
          {MORE_NAV.map(({ to, label, Icon }) => (
            <button
              key={to}
              onClick={() => handleNav(to)}
              className="flex items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-bold text-foreground hover:bg-secondary"
            >
              <Icon className="h-5 w-5 text-primary" />
              {label}
            </button>
          ))}
        </div>
        <div className="rounded-2xl border border-border bg-card px-5 py-5">
          <p className="text-xs text-muted-foreground">{new Date().getFullYear()} goal</p>
          <p className="mt-2 text-xl font-extrabold text-foreground">{displayGoal?.name ?? 'No goal set'}</p>
          <p className="mt-1 text-sm text-primary">{goalPct}% completed</p>
          <div className="mt-3 h-2 rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${goalPct}%` }} />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
