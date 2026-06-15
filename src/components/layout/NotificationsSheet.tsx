import { useMemo, useState } from 'react'
import { useTransactions, useBudgetCategories, useRecurringRules, useGoals } from '@/lib/queries'
import { computeNotifications } from '@/lib/notifications'
import { useMoney } from '@/lib/currency'
import { useIsDesktop } from '@/hooks/useIsDesktop'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Bell, AlertTriangle, Clock, Target, BellOff, X, CheckCheck } from 'lucide-react'

export function NotificationsSheet() {
  const [open, setOpen] = useState(false)
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('finpath_dismissed_notifications')
      return new Set(stored ? JSON.parse(stored) : [])
    } catch {
      return new Set()
    }
  })
  const money = useMoney()
  const { data: transactions = [] } = useTransactions()
  const { data: categories = [] } = useBudgetCategories()
  const { data: recurringRules = [] } = useRecurringRules()
  const { data: goals = [] } = useGoals()

  const allNotifications = useMemo(
    () => computeNotifications(transactions, categories, recurringRules, goals, money.formatDisplay),
    [transactions, categories, recurringRules, goals, money.formatDisplay]
  )

  const visibleNotifications = allNotifications.filter(n => !dismissedIds.has(n.id))
  const criticalCount = visibleNotifications.filter(n => n.severity === 'critical').length
  const badgeCount = visibleNotifications.length

  const isDesktop = useIsDesktop()

  const dismiss = (id: string) => {
    const updated = new Set([...dismissedIds, id])
    setDismissedIds(updated)
    try {
      localStorage.setItem('finpath_dismissed_notifications', JSON.stringify(Array.from(updated)))
    } catch (err) {
      console.warn('Failed to save dismissed notifications:', err)
    }
  }

  const dismissAll = () => {
    const updated = new Set(allNotifications.map(n => n.id))
    setDismissedIds(updated)
    try {
      localStorage.setItem('finpath_dismissed_notifications', JSON.stringify(Array.from(updated)))
    } catch (err) {
      console.warn('Failed to save dismissed notifications:', err)
    }
  }

  if (badgeCount === 0 && !open) {
    // Only show the bell if there are notifications OR sheet is open
    if (dismissedIds.size === 0 || allNotifications.length === 0) return null
  }

  const iconMap: Record<string, React.ReactNode> = {
    budget_over: <AlertTriangle className="h-4 w-4" />,
    budget_warning: <AlertTriangle className="h-4 w-4" />,
    bill_today: <Clock className="h-4 w-4" />,
    bill_soon: <Clock className="h-4 w-4" />,
    goal_stalled: <Target className="h-4 w-4" />,
  }

  const styleMap: Record<string, { border: string; bg: string; text: string; dot: string }> = {
    critical: { border: 'border-red-500/30', bg: 'bg-red-500/5', text: 'text-red-400', dot: 'bg-red-500' },
    warning:  { border: 'border-[#FFCF73]/30', bg: 'bg-[#FFCF73]/5', text: 'text-[#FFCF73]', dot: 'bg-[#FFCF73]' },
    info:     { border: 'border-border', bg: 'bg-secondary', text: 'text-muted-foreground', dot: 'bg-muted-foreground' },
  }

  return (
    <>
      <button
        type="button"
        aria-label={`${badgeCount} notification${badgeCount === 1 ? '' : 's'}`}
        onClick={() => setOpen(true)}
        className="relative flex h-11 w-11 items-center justify-center rounded-full border border-border bg-secondary text-muted-foreground transition-colors hover:text-foreground"
      >
        <Bell className="h-4 w-4" />
        {badgeCount > 0 && (
          <span className={`absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-extrabold text-white ${criticalCount > 0 ? 'bg-red-500' : 'bg-[#FFCF73] text-background'}`}>
            {badgeCount > 9 ? '9+' : badgeCount}
          </span>
        )}
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side={isDesktop ? 'right' : 'bottom'} className={isDesktop ? 'w-full max-w-sm' : 'max-h-[80dvh] overflow-y-auto rounded-t-3xl border-border bg-background pb-safe-10'}>
          <SheetHeader>
            <div className="flex items-center justify-between gap-3">
              <SheetTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-primary" />
                Notifications
              </SheetTitle>
              <div className="flex items-center gap-2">
                {visibleNotifications.length > 0 && (
                  <button
                    onClick={dismissAll}
                    className="flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-xs font-bold text-muted-foreground hover:text-foreground"
                  >
                    <CheckCheck className="h-3 w-3" />
                    Clear all
                  </button>
                )}
                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-bold text-muted-foreground">{badgeCount}</span>
              </div>
            </div>
          </SheetHeader>

          <div className="mt-4 flex flex-col gap-2.5">
            {visibleNotifications.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <BellOff className="h-10 w-10 text-muted-foreground/40" />
                <p className="text-sm font-bold text-foreground">All caught up</p>
                <p className="text-xs text-muted-foreground">No new alerts right now.</p>
              </div>
            ) : visibleNotifications.map(n => {
              const s = styleMap[n.severity]
              return (
                <div key={n.id} className={`relative rounded-xl border p-3.5 ${s.border} ${s.bg}`}>
                  <button
                    onClick={() => dismiss(n.id)}
                    className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-background/50 text-muted-foreground hover:bg-background hover:text-foreground"
                    aria-label={`Dismiss ${n.title}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                  <div className="flex items-center gap-2 mb-1.5 pr-6">
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full ${s.dot} text-white`}>
                      {iconMap[n.type]}
                    </span>
                    <span className={`text-xs font-bold ${s.text}`}>
                      {n.severity === 'critical' ? 'Action needed' : n.severity === 'warning' ? 'Heads up' : 'Info'}
                    </span>
                  </div>
                  <p className="font-extrabold text-foreground text-sm">{n.title}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{n.message}</p>
                </div>
              )
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
