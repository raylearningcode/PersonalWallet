import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useKeyboardVisible } from '@/hooks/useKeyboardVisible'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AndroidBackHandler } from '@/components/native/AndroidBackHandler'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthSession, useRecurringRules } from '@/lib/queries'
import { hasGuestData } from '@/lib/localStore'
import { getQueue } from '@/lib/offlineCache'
import { processSyncQueue } from '@/lib/syncQueue'
import { scheduleUpcomingBillNotifications } from '@/lib/notifications'
import { startRealtimeSync } from '@/lib/realtime'
import { useKeyboardShortcuts } from '@/lib/keyboard'
import { toast, Toaster } from 'sonner'
import { useIsDesktop } from '@/hooks/useIsDesktop'
import { useMoney } from '@/lib/currency'
import { Sidebar } from './Sidebar'
import { BottomNav } from './BottomNav'
import { MoreSheet } from './MoreSheet'
import { QuickAddSheet } from './QuickAddSheet'
import { KeyboardShortcutsDialog } from './KeyboardShortcutsDialog'
import { PinLockScreen, PIN_STORAGE_KEY, PIN_SESSION_KEY } from './PinLock'
import { OnboardingFlow, isOnboardingDone } from '@/components/onboarding/OnboardingFlow'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { DollarSign, ArrowLeftRight, TrendingUp, Target, RefreshCw, Banknote } from 'lucide-react'

type QuickAddType = 'expense' | 'income' | 'transfer'
type QuickActionType = QuickAddType | 'goal' | 'subscription' | 'cash'

const QUICK_ACTIONS: { type: QuickActionType; label: string; description: string; color: string; Icon: typeof DollarSign; to?: string; cash?: boolean }[] = [
  { type: 'expense', label: 'Add expense', description: 'Record a purchase or payment', color: '#FF8388', Icon: DollarSign },
  { type: 'income', label: 'Add income', description: 'Log salary, gift, or refund', color: '#4ADE80', Icon: TrendingUp },
  { type: 'cash', label: 'Cash payment', description: 'Pay with cash and route change', color: '#FFD276', Icon: Banknote, cash: true },
  { type: 'transfer', label: 'Transfer', description: 'Move money between wallets', color: '#60A5FA', Icon: ArrowLeftRight },
  { type: 'goal', label: 'Goal contribution', description: 'Log savings toward a goal', color: '#A9F5C7', Icon: Target, to: '/goals' },
  { type: 'subscription', label: 'Add subscription', description: 'Track recurring bill or income', color: '#FADBEA', Icon: RefreshCw, to: '/subscriptions' },
]

const LAST_QUICK_ACTION_KEY = 'finpath_last_quick_action'
const QUICK_ACTION_HINT_KEY = 'finpath_quick_action_hint_seen'
const QUICK_ACTION_TYPES = new Set(QUICK_ACTIONS.map(action => action.type))

function ResponsiveToaster() {
  const isDesktop = useIsDesktop()
  return (
    <Toaster
      richColors
      position={isDesktop ? 'top-right' : 'bottom-center'}
      offset={isDesktop ? '24px' : '80px'}
    />
  )
}

export function AppLayout() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const isDesktop = useIsDesktop()
  const { data: session } = useAuthSession()
  const [moreOpen, setMoreOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const keyboardVisible = useKeyboardVisible()
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [quickAddType, setQuickAddType] = useState<QuickAddType>('expense')
  const [quickAddCash, setQuickAddCash] = useState(false)
  const [quickActionsOpen, setQuickActionsOpen] = useState(false)
  const [quickAddKeypadOpen, setQuickAddKeypadOpen] = useState(false)
  const { data: recurringRules = [] } = useRecurringRules()
  const money = useMoney()
  const lastNotifScheduleRef = useRef<string>('')
  const [pinLocked, setPinLocked] = useState(() =>
    Boolean(localStorage.getItem(PIN_STORAGE_KEY)) && !sessionStorage.getItem(PIN_SESSION_KEY)
  )
  const [offline, setOffline] = useState(() => !navigator.onLine)
  const [syncing, setSyncing] = useState(false)
  const isGuest = session === null
  const [showOnboarding, setShowOnboarding] = useState(() => !isOnboardingDone() && !hasGuestData())

  const shortcutHandlers = useMemo(() => ({
    'Add Expense': () => openQuickAction('expense'),
    'Add Income': () => openQuickAction('income'),
    'Transfer': () => openQuickAction('transfer'),
    'Dashboard': () => navigate('/'),
    'Transactions': () => navigate('/transactions'),
    'Budget': () => navigate('/budget'),
    'Goals': () => navigate('/goals'),
    'Recurring': () => navigate('/subscriptions'),
    'Reports': () => navigate('/reports'),
    'Settings': () => { if (isDesktop) setProfileOpen(true); else navigate('/settings') },
    'Help': () => setShortcutsOpen(true),
    'Escape': () => { setQuickAddOpen(false); setMoreOpen(false); setQuickActionsOpen(false) },
  }), [isDesktop])

  useKeyboardShortcuts(shortcutHandlers)

  const openQuickAction = (actionType: QuickAddType | 'cash') => {
    localStorage.setItem(LAST_QUICK_ACTION_KEY, actionType)
    setQuickAddType(actionType === 'cash' ? 'expense' : actionType)
    setQuickAddCash(actionType === 'cash')
    setQuickAddOpen(true)
  }

  useEffect(() => {
    const handler = () => setProfileOpen(true)
    window.addEventListener('finpath-open-profile', handler)
    return () => window.removeEventListener('finpath-open-profile', handler)
  }, [])

  useEffect(() => {
    const handler = (e: Event) => setQuickAddKeypadOpen((e as CustomEvent<{ active: boolean }>).detail.active)
    window.addEventListener('finpath-keypad-change', handler)
    return () => window.removeEventListener('finpath-keypad-change', handler)
  }, [])

  useEffect(() => {
    processSyncQueue().catch(() => { /* queue keeps items; next sync retries */ })
  }, [])

  useEffect(() => {
    if (!session) return
    processSyncQueue().catch(() => { /* queue keeps items; next sync retries */ })
  }, [session])

  // Live cross-device sync: a change on another device refreshes this one.
  useEffect(() => {
    if (!session) return
    return startRealtimeSync(qc)
  }, [session, qc])

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const handler = () => toast.info('FinPath updated — using the latest version')
    navigator.serviceWorker.addEventListener('controllerchange', handler)
    return () => navigator.serviceWorker.removeEventListener('controllerchange', handler)
  }, [])
  useEffect(() => {
    if (isDesktop || localStorage.getItem(QUICK_ACTION_HINT_KEY) === '1') return
    const timer = window.setTimeout(() => {
      toast('Tip: hold + for Cash, Transfer, Goal, Subscription.', { duration: 5000 })
      localStorage.setItem(QUICK_ACTION_HINT_KEY, '1')
    }, 1200)
    return () => window.clearTimeout(timer)
  }, [isDesktop])



  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (moreOpen || profileOpen || quickAddOpen || shortcutsOpen || quickActionsOpen) return
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if ((e.target as HTMLElement).isContentEditable) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      switch (e.key) {
        case 'n': setQuickAddType('expense'); setQuickAddOpen(true); break
        case 'h': navigate('/'); break
        case 't': navigate('/transactions'); break
        case 'g': navigate('/goals'); break
        case 'b': navigate('/budget'); break
        case 'r': navigate('/reports'); break
        case '?': toast('Shortcuts: N = Add · H = Home · T = Transactions · B = Budget · G = Goals · R = Reports', { duration: 5000 }); break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [navigate, moreOpen, profileOpen, quickAddOpen, shortcutsOpen, quickActionsOpen])

  useEffect(() => {
    if (recurringRules.length === 0) return
    // Only reschedule when the actual due-date/amount data changes, not on every array reference refresh
    const key = recurringRules
      .filter(r => r.active && r.type !== 'income')
      .map(r => `${r.id}:${r.next_due_date}:${r.amount}`)
      .join('|')
    if (key === lastNotifScheduleRef.current) return
    lastNotifScheduleRef.current = key
    scheduleUpcomingBillNotifications(recurringRules, money.formatDisplay)
  }, [recurringRules, money.formatDisplay])

  useEffect(() => {
    const handleOffline = () => setOffline(true)
    const handleOnline = async () => {
      setOffline(false)
      if (getQueue().length === 0) return
      setSyncing(true)
      try {
        const count = await processSyncQueue()
        if (count > 0) {
          qc.invalidateQueries()
          toast.success(`Synced ${count} pending change${count !== 1 ? 's' : ''}`)
        }
      } catch {
        toast.error('Sync failed — will retry when back online')
      } finally {
        setSyncing(false)
      }
    }
    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)
    return () => {
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
    }
  }, [qc])

  const closeTopSheet = useCallback((): boolean => {
    if (quickAddOpen && quickAddKeypadOpen) {
      window.dispatchEvent(new CustomEvent('finpath-close-keypad'))
      return true
    }
    if (quickAddOpen) { setQuickAddOpen(false); return true }
    if (quickActionsOpen) { setQuickActionsOpen(false); return true }
    if (moreOpen) { setMoreOpen(false); return true }
    if (profileOpen) { setProfileOpen(false); return true }
    return false
  }, [quickAddOpen, quickAddKeypadOpen, quickActionsOpen, moreOpen, profileOpen])

  if (pinLocked) {
    return <PinLockScreen onUnlock={() => setPinLocked(false)} />
  }

  return (
    <div className="min-h-screen bg-background">
      <AndroidBackHandler closeTopSheet={closeTopSheet} />
      <ResponsiveToaster />
      {showOnboarding && (
        <OnboardingFlow onComplete={() => setShowOnboarding(false)} />
      )}
      <Sidebar profileOpen={profileOpen} onProfileOpenChange={setProfileOpen} />
      <main
        className="min-h-screen w-full overflow-x-hidden px-4 py-3 pb-28 sm:px-6 lg:ml-[240px] lg:w-[calc(100%-240px)] lg:max-w-[1150px] lg:pl-0 lg:pr-8 lg:py-3 lg:pb-8 xl:max-w-[1300px] 2xl:max-w-[1450px]"
        style={{ paddingBottom: 'calc(7rem + env(safe-area-inset-bottom))' }}
      >
        {offline && (
          <div className="mb-2 flex items-center gap-3 rounded-2xl border border-[#FFCF73]/30 bg-[#FFCF73]/5 px-5 py-3">
            <span className="h-2 w-2 shrink-0 rounded-full bg-[#FFCF73]" />
            <p className="text-sm text-muted-foreground">
              <span className="font-bold text-[#FFCF73]">Offline</span> — changes saved locally and will sync when reconnected.
            </p>
          </div>
        )}
        {syncing && (
          <div className="mb-2 flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-5 py-3">
            <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-primary" />
            <p className="text-sm font-bold text-primary">Syncing changes…</p>
          </div>
        )}
        {!offline && !syncing && isGuest && (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-2xl border border-primary/20 bg-primary/5 px-5 py-3">
            <p className="text-sm text-muted-foreground">
              <span className="font-bold text-primary">Guest mode</span> — your data is saved on this device only.
            </p>
            <button
              type="button"
              onClick={() => { if (isDesktop) setProfileOpen(true); else navigate('/auth') }}
              className="shrink-0 rounded-full bg-primary px-4 py-1.5 text-xs font-extrabold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Sign in to sync
            </button>
          </div>
        )}
        <Outlet />
      </main>
      <BottomNav
        onMoreClick={() => setMoreOpen(true)}
        moreActive={moreOpen}
        onAddClick={() => {
          const saved = localStorage.getItem(LAST_QUICK_ACTION_KEY)
          const type = saved && QUICK_ACTION_TYPES.has(saved as QuickActionType) ? saved as QuickActionType : 'expense'
          if (type === 'goal') { navigate('/goals'); return }
          if (type === 'subscription') { navigate('/subscriptions'); return }
          if (!isDesktop) {
            const isCash = type === 'cash'
            navigate(`/add-transaction?type=${isCash ? 'expense' : type}${isCash ? '&cash=true' : ''}`)
          } else {
            openQuickAction(type)
          }
        }}
        onLongPressAdd={() => setQuickActionsOpen(true)}
        hidden={keyboardVisible || pathname === '/add-transaction'}
      />
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
      <QuickAddSheet open={quickAddOpen} onClose={() => { setQuickAddOpen(false); setQuickAddCash(false) }} initialType={quickAddType} initialCash={quickAddCash} />

      {/* Long-press action picker */}
      <Sheet open={quickActionsOpen} onOpenChange={setQuickActionsOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl border-border bg-background pb-safe-10">
          <SheetTitle className="sr-only">Quick actions</SheetTitle>
          <h2 className="mb-1 text-lg font-extrabold text-foreground">Quick add</h2>
          <p className="mb-2 text-sm text-muted-foreground">What do you want to record?</p>
          <div className="space-y-2">
            {QUICK_ACTIONS.map(({ type, label, description, color, Icon, to, cash }) => (
              <button
                key={type}
                type="button"
                className="flex w-full items-center gap-2 rounded-2xl border border-border bg-secondary p-4 text-left transition-colors active:scale-[0.99] hover:bg-muted/30"
                onClick={() => {
                  setQuickActionsOpen(false)
                  localStorage.setItem(LAST_QUICK_ACTION_KEY, type)
                  if (to) { navigate(to); return }
                  if (!isDesktop) {
                    navigate(`/add-transaction?type=${cash ? 'expense' : type}${cash ? '&cash=true' : ''}`)
                    return
                  }
                  openQuickAction(cash ? 'cash' : type as QuickAddType)
                }}
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl" style={{ backgroundColor: color + '22', border: `1.5px solid ${color}44` }}>
                  <Icon className="h-5 w-5" style={{ color }} />
                </div>
                <div>
                  <p className="font-bold text-foreground">{label}</p>
                  <p className="text-xs text-muted-foreground">{description}</p>
                </div>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      <KeyboardShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  )
}
