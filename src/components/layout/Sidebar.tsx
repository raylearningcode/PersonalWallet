import { NavLink } from 'react-router-dom'

const NAV = [
  { to: '/', label: 'Dashboard' },
  { to: '/transactions', label: 'Transactions' },
  { to: '/budget', label: 'Budget' },
  { to: '/estimation', label: 'Estimation' },
  { to: '/investing', label: 'Investing' },
  { to: '/reports', label: 'Reports' },
  { to: '/settings', label: 'Settings' },
]

interface SidebarProps {
  goalLabel?: string
  goalPct?: number
}

export function Sidebar({ goalLabel = 'No goal set', goalPct = 0 }: SidebarProps) {
  const progress = Math.min(100, Math.max(0, goalPct))

  return (
    <aside className="relative z-10 mx-4 mt-4 hidden w-[calc(100%-2rem)] flex-col rounded-[1.7rem] border border-border bg-background/78 px-6 py-6 lg:fixed lg:flex lg:left-10 lg:top-8 lg:m-0 lg:h-[calc(100vh-4rem)] lg:w-[250px] lg:py-8">
      <div className="mb-10 flex items-center gap-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary">
          <div className="h-5 w-5 rounded-md border-[6px] border-primary-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold leading-none text-foreground">FinPath</h1>
          <p className="mt-1 text-xs text-muted-foreground">Personal finance OS</p>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-2">
        {NAV.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex h-[45px] items-center gap-3 rounded-2xl px-5 py-3 text-[15px] font-bold transition-colors ${
                isActive
                  ? 'border border-border bg-secondary text-foreground'
                  : 'text-muted-foreground hover:bg-secondary/70 hover:text-foreground'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className={`h-[21px] w-[21px] rounded-lg ${isActive ? 'bg-primary' : 'bg-muted-foreground'}`} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="rounded-[1.35rem] border border-border bg-card px-6 py-6">
        <p className="text-xs text-muted-foreground">2026 goal</p>
        <p className="mt-3 whitespace-nowrap text-[1.45rem] font-extrabold text-foreground">{goalLabel}</p>
        <p className="mt-1 text-sm text-primary">{progress}% completed</p>
        <div className="mt-4 h-2 rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
        </div>
      </div>
    </aside>
  )
}
