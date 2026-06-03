import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarChart2, Monitor, Plus, RefreshCw, Settings, Target, Wallet } from 'lucide-react'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { useGoals } from '@/lib/queries'
import { PINNED_GOAL_KEY } from './Sidebar'

const MORE_NAV_GROUPS = [
  {
    label: 'Daily',
    items: [
      { to: '/goals', label: 'Goal contribution', Icon: Target, color: '#A9F5C7' },
      { to: '/subscriptions', label: 'Recurring bills', Icon: RefreshCw, color: '#FADBEA' },
      { to: '/settings?section=wallets', label: 'Wallets & cash', Icon: Wallet, color: '#A9F5C7' },
    ],
  },
  {
    label: 'Review',
    items: [
      { to: '/reports', label: 'Reports', Icon: BarChart2, color: '#93C5FD' },
    ],
  },
  {
    label: 'Advanced',
    items: [
      { to: '/settings', label: 'Settings', Icon: Settings, color: '#F8DCDC' },
      { to: '/desktop-tools', label: 'Desktop tools', Icon: Monitor, color: '#C4AEFF' },
    ],
  },
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
        <h2 className="mb-5 text-lg font-extrabold text-foreground">More</h2>

        {/* Grouped navigation */}
        <div className="mb-6 space-y-5">
          {MORE_NAV_GROUPS.map(group => (
            <div key={group.label}>
              <p className="mb-2 text-[11px] font-extrabold uppercase tracking-widest text-muted-foreground">{group.label}</p>
              <div className={`grid gap-3 ${group.items.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                {group.items.map(({ to, label, Icon, color }) => (
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
            </div>
          ))}
        </div>

        {/* Goal progress card */}
        <div className="rounded-2xl border border-border bg-card px-5 py-4">
          <button
            type="button"
            onClick={() => handleNav('/goals')}
            className="w-full text-left"
          >
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
          </button>
          {displayGoal && goalPct < 100 && (
            <button
              type="button"
              onClick={() => handleNav('/goals')}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-primary/30 bg-primary/5 py-2 text-xs font-bold text-primary transition-colors hover:bg-primary/10 active:bg-primary/15"
            >
              <Plus className="h-3.5 w-3.5" />
              Add contribution
            </button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
