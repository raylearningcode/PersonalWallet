import { useEffect, useMemo, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { BarChart3, Calculator, CreditCard, HardDrive, LayoutDashboard, PieChart, RefreshCw, Settings, Shield, Target, TrendingUp, User, Coins } from 'lucide-react'
import { useGoals, useAuthSession, useSignIn, useSignUp, useSignOut, useAppSettings } from '@/lib/queries'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

export const PINNED_GOAL_KEY = 'finpath_pinned_goal_id'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/transactions', label: 'Transactions', icon: CreditCard },
  { to: '/budget', label: 'Budget', icon: PieChart },
  { to: '/goals', label: 'Goals', icon: Target },
  { to: '/estimation', label: 'Planning', icon: Calculator },
  { to: '/subscriptions', label: 'Recurring', icon: RefreshCw },
  { to: '/investing', label: 'Investing', icon: TrendingUp },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function Sidebar({ profileOpen, onProfileOpenChange }: {
  profileOpen: boolean
  onProfileOpenChange: (open: boolean) => void
}) {
  const { data: goals = [] } = useGoals()
  const { data: session } = useAuthSession()
  const { data: settings } = useAppSettings()
  const signIn = useSignIn()
  const signUp = useSignUp()
  const signOut = useSignOut()
  const navigate = useNavigate()

  const [pinnedGoalId, setPinnedGoalId] = useState(() => localStorage.getItem(PINNED_GOAL_KEY) ?? '')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')

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

  const pct = displayGoal && displayGoal.target_amount > 0
    ? Math.min(100, Math.round((displayGoal.current_amount / displayGoal.target_amount) * 100))
    : 0

  const userInitial = session?.user?.email?.[0]?.toUpperCase() ?? null

  const handleSignIn = async () => {
    try {
      await signIn.mutateAsync({ email: authEmail, password: authPassword })
      toast.success('Signed in')
      onProfileOpenChange(false)
    } catch {
      toast.error('Sign in failed — check your email and password')
    }
  }

  const handleSignUp = async () => {
    try {
      await signUp.mutateAsync({ email: authEmail, password: authPassword })
      toast.success('Account created — check your email to confirm')
      onProfileOpenChange(false)
    } catch {
      toast.error('Sign up failed')
    }
  }

  const handleSignOut = async () => {
    await signOut.mutateAsync()
    onProfileOpenChange(false)
  }

  return (
    <>
      <aside className="relative z-10 mx-4 mt-4 hidden w-[calc(100%-2rem)] flex-col rounded-[1.7rem] border border-border bg-background/78 px-5 py-5 lg:fixed lg:left-5 lg:top-5 lg:m-0 lg:flex lg:w-[210px] lg:overflow-y-auto lg:px-4 lg:py-5" style={{ maxHeight: 'calc(100vh - 2.5rem)' }}>
        {/* Logo */}
        <div className="mb-5 flex items-center gap-3 px-1">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary">
            <div className="h-3.5 w-3.5 rounded-md bg-background" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold leading-none text-foreground">FinPath</h1>
            <p className="mt-0.5 text-[10px] text-muted-foreground">Personal finance OS</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="space-y-0.5">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `relative flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-extrabold transition-colors ${
                  isActive
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground hover:bg-secondary/70 hover:text-foreground'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute left-0 top-1/2 h-4 w-1 -translate-y-1/2 rounded-r-full bg-primary" />
                  )}
                  <Icon className={`h-3.5 w-3.5 shrink-0 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Profile button */}
        <div className="mt-4 border-t border-border pt-3">
          <button
            onClick={() => onProfileOpenChange(true)}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-colors hover:bg-secondary"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-extrabold text-primary-foreground">
              {userInitial ?? <User className="h-3.5 w-3.5" />}
            </div>
            <div className="min-w-0">
              <p className="truncate text-[11px] font-bold text-foreground">
                {session?.user?.email ?? 'Guest mode'}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {session ? 'Signed in' : 'Tap to sign in'}
              </p>
            </div>
          </button>
        </div>

        {/* Goal card */}
        <div className="mt-3 rounded-2xl border border-border bg-card px-4 py-4">
          <p className="text-[10px] text-muted-foreground">{new Date().getFullYear()} goal</p>
          <p className="mt-1.5 break-words text-base font-extrabold leading-tight text-foreground">{displayGoal?.name ?? 'No goal set'}</p>
          <p className="mt-0.5 text-xs text-primary">{pct}% completed</p>
          <div className="mt-2.5 h-1.5 rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </aside>

      {/* Auth/Profile sheet */}
      <Sheet open={profileOpen} onOpenChange={onProfileOpenChange}>
        <SheetContent side="left" className="w-80 border-border bg-background p-6">
          <SheetHeader className="mb-6">
            <SheetTitle>Account</SheetTitle>
          </SheetHeader>

          {/* Account info card */}
          <div className="mb-4 flex items-center gap-3 rounded-2xl border border-border bg-secondary p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-extrabold text-primary-foreground">
              {userInitial ?? <User className="h-4 w-4" />}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-foreground">{session?.user?.email ?? 'Guest mode'}</p>
              <p className={`text-xs ${session ? 'text-primary' : 'text-muted-foreground'}`}>
                {session ? 'Synced to cloud' : 'Data stored locally only'}
              </p>
            </div>
          </div>

          {/* Quick links */}
          <div className="mb-4 space-y-1">
            {[
              { icon: Coins, label: 'Currency & wallets', href: '/settings?section=wallets' },
              { icon: Shield, label: 'Security & PIN', href: '/settings?section=security' },
              { icon: HardDrive, label: 'Backup & export', href: '/settings?section=backup' },
              { icon: Settings, label: 'All settings', href: '/settings' },
            ].map(({ icon: Icon, label, href }) => (
              <button
                key={href}
                type="button"
                onClick={() => { navigate(href); onProfileOpenChange(false) }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold text-foreground transition-colors hover:bg-secondary active:scale-[0.98]"
              >
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                {label}
              </button>
            ))}
          </div>

          {/* Display currency badge */}
          {settings?.currency && (
            <div className="mb-4 flex items-center gap-2 rounded-xl bg-secondary/50 px-3 py-2">
              <span className="text-xs text-muted-foreground">Display currency:</span>
              <span className="text-xs font-extrabold text-foreground">{settings.currency}</span>
            </div>
          )}

          <div className="border-t border-border pt-4">
            {session ? (
              <Button variant="secondary" className="w-full" onClick={handleSignOut} disabled={signOut.isPending}>
                Log out
              </Button>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Sign in to sync your data across devices.</p>
                <div>
                  <Label className="text-xs text-muted-foreground">Email</Label>
                  <Input
                    className="mt-1.5 bg-secondary"
                    type="email"
                    value={authEmail}
                    onChange={e => setAuthEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Password</Label>
                  <Input
                    className="mt-1.5 bg-secondary"
                    type="password"
                    value={authPassword}
                    onChange={e => setAuthPassword(e.target.value)}
                    placeholder="Password"
                    onKeyDown={e => e.key === 'Enter' && handleSignIn()}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Button className="w-full" onClick={handleSignIn} disabled={signIn.isPending}>
                    {signIn.isPending ? 'Signing in…' : 'Sign in'}
                  </Button>
                  <Button variant="secondary" className="w-full" onClick={handleSignUp} disabled={signUp.isPending}>
                    {signUp.isPending ? 'Creating account…' : 'Create account'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
