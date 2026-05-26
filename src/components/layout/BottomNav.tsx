import { NavLink } from 'react-router-dom'
import { LayoutDashboard, ArrowLeftRight, PieChart, TrendingUp, MoreHorizontal } from 'lucide-react'

const NAV = [
  { to: '/', label: 'Home', Icon: LayoutDashboard },
  { to: '/transactions', label: 'Txns', Icon: ArrowLeftRight },
  { to: '/budget', label: 'Budget', Icon: PieChart },
  { to: '/investing', label: 'Invest', Icon: TrendingUp },
]

interface BottomNavProps {
  onMoreClick: () => void
  moreActive: boolean
}

export function BottomNav({ onMoreClick, moreActive }: BottomNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-16 items-center border-t border-border bg-background lg:hidden">
      {NAV.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] font-bold transition-colors ${
              isActive ? 'text-primary' : 'text-muted-foreground'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <Icon className={`h-5 w-5 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
              {label}
            </>
          )}
        </NavLink>
      ))}
      <button
        onClick={onMoreClick}
        className={`flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] font-bold transition-colors ${
          moreActive ? 'text-primary' : 'text-muted-foreground'
        }`}
      >
        <MoreHorizontal className={`h-5 w-5 ${moreActive ? 'text-primary' : 'text-muted-foreground'}`} />
        More
      </button>
    </nav>
  )
}
