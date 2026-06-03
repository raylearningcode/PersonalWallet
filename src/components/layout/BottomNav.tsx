import { NavLink } from 'react-router-dom'
import { CreditCard, LayoutDashboard, MoreHorizontal, PieChart, Plus } from 'lucide-react'

const navItems = [
  { to: '/', label: 'Home', icon: LayoutDashboard },
  { to: '/transactions', label: 'Txns', icon: CreditCard },
  { to: '/budget', label: 'Budget', icon: PieChart },
]

export function BottomNav({
  onMoreClick,
  moreActive,
  onAddClick,
  hidden = false,
}: {
  onMoreClick: () => void
  moreActive: boolean
  onAddClick: () => void
  hidden?: boolean
}) {
  return (
    <nav
      className={`fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-border bg-background/97 backdrop-blur-md lg:hidden transition-transform duration-300 ${hidden ? 'translate-y-full pointer-events-none' : 'translate-y-0'}`}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)', minHeight: 'calc(64px + env(safe-area-inset-bottom))' }}
    >
      {navItems.slice(0, 2).map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center justify-center gap-0.5 py-1 text-[10px] font-bold transition-colors active:bg-muted/40 ${isActive ? 'text-primary' : 'text-muted-foreground'}`
          }
        >
          {({ isActive }) => (
            <>
              <span className={`flex h-6 w-6 items-center justify-center rounded-lg transition-colors ${isActive ? 'bg-primary/15' : ''}`}>
                <Icon size={18} />
              </span>
              {label}
            </>
          )}
        </NavLink>
      ))}

      {/* Centre FAB — opens Quick Add action sheet */}
      <div className="flex flex-1 items-center justify-center">
        <button
          type="button"
          aria-label="Quick add"
          onClick={onAddClick}
          className="flex items-center justify-center rounded-full bg-primary shadow-lg shadow-primary/40 transition-transform active:scale-90"
          style={{ width: 52, height: 52 }}
        >
          <Plus className="h-6 w-6 text-primary-foreground" />
        </button>
      </div>

      {navItems.slice(2).map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center justify-center gap-0.5 py-1 text-[10px] font-bold transition-colors active:bg-muted/40 ${isActive ? 'text-primary' : 'text-muted-foreground'}`
          }
        >
          {({ isActive }) => (
            <>
              <span className={`flex h-6 w-6 items-center justify-center rounded-lg transition-colors ${isActive ? 'bg-primary/15' : ''}`}>
                <Icon size={18} />
              </span>
              {label}
            </>
          )}
        </NavLink>
      ))}

      <button
        type="button"
        onClick={onMoreClick}
        aria-label="Open more menu"
        className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-1 text-[10px] font-bold transition-colors active:bg-muted/40 ${moreActive ? 'text-primary' : 'text-muted-foreground'}`}
      >
        <span className={`flex h-6 w-6 items-center justify-center rounded-lg transition-colors ${moreActive ? 'bg-primary/15' : ''}`}>
          <MoreHorizontal size={18} />
        </span>
        More
      </button>
    </nav>
  )
}
