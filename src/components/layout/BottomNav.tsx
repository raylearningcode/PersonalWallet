import { NavLink } from 'react-router-dom'
import { CreditCard, LayoutDashboard, MoreHorizontal, PieChart, Plus } from 'lucide-react'

const leftNavItems = [
  { to: '/', label: 'Home', icon: LayoutDashboard },
  { to: '/transactions', label: 'Txns', icon: CreditCard },
]

const rightNavItems = [
  { to: '/budget', label: 'Budget', icon: PieChart },
]

export function BottomNav({
  onMoreClick,
  moreActive,
  onAddClick,
}: {
  onMoreClick: () => void
  moreActive: boolean
  onAddClick: () => void
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-center border-t border-border bg-background/95 backdrop-blur lg:hidden">
      {leftNavItems.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-bold ${isActive ? 'text-primary' : 'text-muted-foreground'}`
          }
        >
          <Icon className="h-5 w-5" />
          {label}
        </NavLink>
      ))}

      <div className="flex flex-1 items-center justify-center">
        <button
          type="button"
          onClick={onAddClick}
          aria-label="Add transaction"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-primary shadow-lg shadow-primary/30 transition-transform active:scale-95"
        >
          <Plus className="h-6 w-6 text-primary-foreground" />
        </button>
      </div>

      {rightNavItems.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-bold ${isActive ? 'text-primary' : 'text-muted-foreground'}`
          }
        >
          <Icon className="h-5 w-5" />
          {label}
        </NavLink>
      ))}

      <button
        type="button"
        onClick={onMoreClick}
        className={`flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-bold ${moreActive ? 'text-primary' : 'text-muted-foreground'}`}
      >
        <MoreHorizontal className="h-5 w-5" />
        More
      </button>
    </nav>
  )
}
