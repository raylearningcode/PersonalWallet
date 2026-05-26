import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, ArrowLeftRight, PieChart,
  TrendingUp, Calendar, BarChart2, Settings,
} from 'lucide-react'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { to: '/budget', label: 'Budget', icon: PieChart },
  { to: '/investing', label: 'Investing', icon: TrendingUp },
  { to: '/estimation', label: 'Estimation', icon: Calendar },
  { to: '/reports', label: 'Reports', icon: BarChart2 },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 h-full w-60 bg-card border-r border-border flex flex-col py-6 px-4 z-10">
      <div className="mb-8">
        <h1 className="text-xl font-bold text-primary">FinPath</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Personal finance OS</p>
      </div>
      <div className="mb-6">
        <input
          className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="Search..."
        />
      </div>
      <nav className="flex-1 flex flex-col gap-1">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                isActive
                  ? 'bg-primary/20 text-primary font-medium'
                  : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground'
              }`
            }
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="flex items-center gap-3 pt-4 border-t border-border">
        <div className="w-8 h-8 rounded-full bg-primary/30 flex items-center justify-center text-primary font-semibold text-sm">
          R
        </div>
        <p className="text-sm font-medium text-foreground">Rayhan</p>
      </div>
    </aside>
  )
}
