import { useMemo, useState } from 'react'
import { useTransactions, useBudgetCategories, useRecurringRules, useGoals } from '@/lib/queries'
import { computeNotifications } from '@/lib/notifications'
import { useMoney } from '@/lib/currency'
import { useIsDesktop } from '@/hooks/useIsDesktop'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Bell, AlertTriangle, Clock, Target, BellOff } from 'lucide-react'

export function NotificationsSheet() {
  const [open, setOpen] = useState(false)
  const money = useMoney()
  const { data: transactions = [] } = useTransactions()
  const { data: categories = [] } = useBudgetCategories()
  const { data: recurringRules = [] } = useRecurringRules()
  const { data: goals = [] } = useGoals()

  const notifications = useMemo(
    () => computeNotifications(transactions, categories, recurringRules, goals, money.formatDisplay),
    [transactions, categories, recurringRules, goals, money.formatDisplay]
  )

  const criticalCount = notifications.filter(n => n.severity === 'critical').length
  const badgeCount = notifications.length

  const isDesktop = useIsDesktop()
  if (badgeCount === 0) return null

  const iconMap = {
    budget_over: <AlertTriangle className="h-4 w-4" />,
    budget_warning: <AlertTriangle className="h-4 w-4" />,
    bill_today: <Clock className="h-4 w-4" />,
    bill_soon: <Clock className="h-4 w-4" />,
    goal_stalled: <Target className="h-4 w-4" />,
  }

  const styleMap = {
    critical: { border: 'border-red-500/30',    bg: 'bg-red-500/5',      text: 'text-red-400' },
    warning:  { border: 'border-[#FFCF73]/30',  bg: 'bg-[#FFCF73]/5',   text: 'text-[#FFCF73]' },
    info:     { border: 'border-border',         bg: 'bg-secondary',      text: 'text-muted-foreground' },
  }

  return (
    <>
      <button
        type="button"
        aria-label={`${badgeCount} notification${badgeCount === 1 ? '' : 's'}`}
        onClick={() => setOpen(true)}
        className="relative flex h-9 w-9 items-center justify-center rounded-full border border-border bg-secondary text-muted-foreground transition-colors hover:text-foreground"
      >
        <Bell className="h-4 w-4" />
        <span className={`absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-extrabold text-primary-foreground ${criticalCount > 0 ? 'bg-red-500' : 'bg-[#FFCF73]'}`}>
          {badgeCount > 9 ? '9+' : badgeCount}
        </span>
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side={isDesktop ? 'right' : 'bottom'} className={isDesktop ? 'w-full max-w-sm' : 'max-h-[80dvh] overflow-y-auto rounded-t-3xl'}>
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              Notifications
              <span className="ml-auto rounded-full bg-secondary px-2 py-0.5 text-xs font-bold text-muted-foreground">{badgeCount}</span>
            </SheetTitle>
          </SheetHeader>

          <div className="mt-4 flex flex-col gap-3 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <BellOff className="h-10 w-10 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">All clear — no alerts right now.</p>
              </div>
            ) : notifications.map(n => {
              const s = styleMap[n.severity]
              return (
                <div key={n.id} className={`rounded-2xl border p-4 ${s.border} ${s.bg}`}>
                  <div className={`mb-1 flex items-center gap-1.5 text-xs font-bold ${s.text}`}>
                    {iconMap[n.type]}
                    {n.severity === 'critical' ? 'Action needed' : n.severity === 'warning' ? 'Heads up' : 'Info'}
                  </div>
                  <p className="font-extrabold text-foreground">{n.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{n.message}</p>
                </div>
              )
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
