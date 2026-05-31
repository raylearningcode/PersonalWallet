import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarChart2, Calculator, RefreshCw, Settings, Target, TrendingUp } from 'lucide-react'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { useGoals } from '@/lib/queries'
import { PINNED_GOAL_KEY } from './Sidebar'

const MORE_NAV = [
  { to: '/goals', label: 'Goals', Icon: Target, color: '#A9F5C7' },
  { to: '/subscriptions', label: 'Subs', Icon: RefreshCw, color: '#FADBEA' },
  { to: '/investing', label: 'Investing', Icon: TrendingUp, color: '#FFD276' },
  { to: '/estimation', label: 'Planning', Icon: Calculator, color: '#C4AEFF' },
  { to: '/reports', label: 'Reports', Icon: BarChart2, color: '#93C5FD' },
  { to: '/settings', label: 'Settings', Icon: Settings, color: '#F8DCDC' },
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
      <SheetContent side="bottom" className="rounded-t-3xl border-border bg-background pb-10">
        {/* Handle bar */}
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-muted" />

        <h2 className="mb-5 text-lg font-extrabold text-foreground">More</h2>

        {/* App-style icon grid */}
        <div className="mb-6 grid grid-cols-3 gap-4">
          {MORE_NAV.map(({ to, label, Icon, color }) => (
            <button
              key={to}
              onClick={() => handleNav(to)}
              className="flex flex-col items-center gap-2 rounded-2xl p-3 transition-colors active:scale-95 hover:bg-secondary"
            >
              <div
                className="flex h-14 w-14 items-center justify-center rounded-2xl shadow-sm"
                style={{ backgroundColor: color + '33', border: `1.5px solid ${color}55` }}
              >
                <Icon className="h-6 w-6" style={{ color }} />
              </div>
              <span className="text-xs font-bold text-foreground">{label}</span>
            </button>
          ))}
        </div>

        {/* Goal progress card */}
        <div className="rounded-2xl border border-border bg-card px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Current goal</p>
              <p className="mt-0.5 truncate text-base font-extrabold text-foreground">{displayGoal?.name ?? 'No goal set'}</p>
            </div>
            <span className="shrink-0 rounded-full bg-primary/10 px-3 py-1 text-sm font-extrabold text-primary">{goalPct}%</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${goalPct}%` }}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
