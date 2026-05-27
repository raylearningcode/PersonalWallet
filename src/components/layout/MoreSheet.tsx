import { useNavigate } from 'react-router-dom'
import { BarChart2, Calculator, Settings } from 'lucide-react'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { useAppSettings } from '@/lib/queries'

const MORE_NAV = [
  { to: '/estimation', label: 'Estimation', Icon: Calculator },
  { to: '/reports', label: 'Reports', Icon: BarChart2 },
  { to: '/settings', label: 'Settings', Icon: Settings },
]

interface MoreSheetProps {
  open: boolean
  onClose: () => void
}

export function MoreSheet({ open, onClose }: MoreSheetProps) {
  const { data: settings } = useAppSettings()
  const navigate = useNavigate()
  const goalLabel = settings?.annual_goal_label || 'No goal set'
  const goalPct = Math.min(100, Math.max(0, settings?.annual_goal_pct ?? 0))

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
          <p className="mt-2 text-xl font-extrabold text-foreground">{goalLabel}</p>
          <p className="mt-1 text-sm text-primary">{goalPct}% completed</p>
          <div className="mt-3 h-2 rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${goalPct}%` }} />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
