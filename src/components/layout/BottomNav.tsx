import { NavLink } from 'react-router-dom'
import { CreditCard, LayoutDashboard, MoreHorizontal, PieChart, TrendingUp } from 'lucide-react'

const navItems = [
  { to: '/', label: 'Home', icon: LayoutDashboard },
  { to: '/transactions', label: 'Txns', icon: CreditCard },
  { to: '/budget', label: 'Budget', icon: PieChart },
  { to: '/investing', label: 'Invest', icon: TrendingUp },
]

export function BottomNav({ onMoreClick, moreActive }: { onMoreClick: () => void; moreActive: boolean }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-center border-t border-border bg-background/95 backdrop-blur lg:hidden">
      {navItems.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) => `flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-bold ${isActive ? 'text-primary' : 'text-muted-foreground'}`}
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
