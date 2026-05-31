import { NavLink } from 'react-router-dom'
import { ReceiptText, LayoutDashboard, MoreHorizontal, Wallet, Plus } from 'lucide-react'

const leftNavItems = [
  { to: '/', label: 'Home', icon: LayoutDashboard },
  { to: '/transactions', label: 'Activity', icon: ReceiptText },
]

const rightNavItems = [
  { to: '/budget', label: 'Budget', icon: Wallet },
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
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] font-bold ${isActive ? 'text-primary' : 'text-muted-foreground'}`

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-center border-t border-border bg-background/95 backdrop-blur lg:hidden">
      {leftNavItems.map(({ to, label, icon: Icon }) => (
        <NavLink key={to} to={to} end={to === '/'} className={linkClass}>
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
        <NavLink key={to} to={to} end={to === '/'} className={linkClass}>
          <Icon className="h-5 w-5" />
          {label}
        </NavLink>
      ))}

      <button
        type="button"
        onClick={onMoreClick}
        aria-label="Open more menu"
        className={`flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] font-bold ${moreActive ? 'text-primary' : 'text-muted-foreground'}`}
      >
        <MoreHorizontal className="h-5 w-5" />
        More
      </button>
    </nav>
  )
}
