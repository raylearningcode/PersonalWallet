import { NavLink } from 'react-router-dom'
import { BarChart3, Calculator, CreditCard, LayoutDashboard, PieChart, Settings, TrendingUp } from 'lucide-react'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/transactions', label: 'Transactions', icon: CreditCard },
  { to: '/budget', label: 'Budget', icon: PieChart },
  { to: '/estimation', label: 'Planning', icon: Calculator },
  { to: '/investing', label: 'Investing', icon: TrendingUp },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Settings },
]

type SidebarProps = {
  goalLabel?: string
  goalPct?: number
}

export function Sidebar({ goalLabel = 'No goal set', goalPct = 0 }: SidebarProps) {
  const pct = Math.max(0, Math.min(100, goalPct))

  return (
    <aside className="relative z-10 mx-4 mt-4 hidden w-[calc(100%-2rem)] flex-col rounded-[1.7rem] border border-border bg-background/78 px-6 py-6 lg:fixed lg:left-10 lg:top-8 lg:m-0 lg:flex lg:h-[calc(100vh-4rem)] lg:w-[250px] lg:py-8">
      <div className="mb-10 flex items-center gap-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary">
          <div className="h-4 w-4 rounded-md bg-background" />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold leading-none text-foreground">FinPath</h1>
          <p className="mt-1 text-xs text-muted-foreground">Personal finance OS</p>
        </div>
      </div>

      <nav className="space-y-1">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `relative flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-extrabold transition-colors ${
                isActive
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:bg-secondary/70 hover:text-foreground'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary" />
                )}
                <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto rounded-2xl border border-border bg-card px-5 py-5">
        <p className="text-xs text-muted-foreground">2026 goal</p>
        <p className="mt-2 break-words text-2xl font-extrabold text-foreground">{goalLabel}</p>
        <p className="mt-1 text-sm text-primary">{pct}% completed</p>
        <div className="mt-4 h-2 rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </aside>
  )
}
