import { useEffect, useState } from 'react'
import { useKeyboardVisible } from '@/hooks/useKeyboardVisible'
import { Outlet, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthSession } from '@/lib/queries'
import { getQueue } from '@/lib/offlineCache'
import { processSyncQueue } from '@/lib/syncQueue'
import { toast, Toaster } from 'sonner'
import { useIsDesktop } from '@/hooks/useIsDesktop'
import { Sidebar } from './Sidebar'
import { BottomNav } from './BottomNav'
import { MoreSheet } from './MoreSheet'
import { QuickAddSheet } from './QuickAddSheet'
import { PinLockScreen, PIN_STORAGE_KEY, PIN_SESSION_KEY } from './PinLock'
import { NotificationsSheet } from './NotificationsSheet'
import { Sheet, SheetContent } from '@/components/ui/sheet'
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
  const { data: session } = useAuthSession()
  const [moreOpen, setMoreOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const keyboardVisible = useKeyboardVisible()
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [quickAddType, setQuickAddType] = useState<QuickAddType>('expense')
  const [quickAddCash, setQuickAddCash] = useState(false)
  const [quickActionsOpen, setQuickActionsOpen] = useState(false)
  const [pinLocked, setPinLocked] = useState(() =>
    Boolean(localStorage.getItem(PIN_STORAGE_KEY)) && !sessionStorage.getItem(PIN_SESSION_KEY)
  )
  const [offline, setOffline] = useState(() => !navigator.onLine)
  const [syncing, setSyncing] = useState(false)
  const isDesktop = useIsDesktop()
  const isGuest = session === null

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
  }, [navigate])

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

  if (pinLocked) {
    return <PinLockScreen onUnlock={() => setPinLocked(false)} />
  }

  return (
    <div className="min-h-screen bg-background">
      <ResponsiveToaster />
      <Sidebar profileOpen={profileOpen} onProfileOpenChange={setProfileOpen} />
      <main
        className="min-h-screen w-full overflow-x-hidden px-4 py-6 pb-28 sm:px-6 lg:ml-[240px] lg:w-[calc(100vw-275px)] lg:max-w-[1440px] lg:px-0 lg:py-6 lg:pb-8 lg:pr-8"
        style={{ paddingBottom: 'calc(7rem + env(safe-area-inset-bottom))' }}
      >
        {offline && (
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-[#FFCF73]/30 bg-[#FFCF73]/5 px-5 py-3">
            <span className="h-2 w-2 shrink-0 rounded-full bg-[#FFCF73]" />
            <p className="text-sm text-muted-foreground">
              <span className="font-bold text-[#FFCF73]">Offline</span> — changes saved locally and will sync when reconnected.
            </p>
          </div>
        )}
        {syncing && (
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-5 py-3">
            <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-primary" />
            <p className="text-sm font-bold text-primary">Syncing changes…</p>
          </div>
        )}
        {!offline && !syncing && isGuest && (
          <div className="mb-6 flex items-center justify-between gap-4 rounded-2xl border border-primary/20 bg-primary/5 px-5 py-3">
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
        <div className="pointer-events-none mb-4 flex items-start justify-end lg:mb-0 lg:absolute lg:right-8 lg:top-6">
          <div className="pointer-events-auto">
            <NotificationsSheet />
          </div>
        </div>
        <Outlet />
      </main>
      <BottomNav
        onMoreClick={() => setMoreOpen(true)}
        moreActive={moreOpen}
        onAddClick={() => {
          const saved = localStorage.getItem(LAST_QUICK_ACTION_KEY)
          const type = saved && QUICK_ACTION_TYPES.has(saved as QuickActionType) ? saved as QuickActionType : 'expense'
          if (type === 'goal') navigate('/goals')
          else if (type === 'subscription') navigate('/subscriptions')
          else openQuickAction(type)
        }}
        onLongPressAdd={() => setQuickActionsOpen(true)}
        hidden={keyboardVisible}
      />
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
      <QuickAddSheet open={quickAddOpen} onClose={() => { setQuickAddOpen(false); setQuickAddCash(false) }} initialType={quickAddType} initialCash={quickAddCash} />

      {/* Long-press action picker */}
      <Sheet open={quickActionsOpen} onOpenChange={setQuickActionsOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl border-border bg-background pb-10">
          <h2 className="mb-1 text-lg font-extrabold text-foreground">Quick add</h2>
          <p className="mb-5 text-sm text-muted-foreground">What do you want to record?</p>
          <div className="space-y-2">
            {QUICK_ACTIONS.map(({ type, label, description, color, Icon, to, cash }) => (
              <button
                key={type}
                type="button"
                className="flex w-full items-center gap-4 rounded-2xl border border-border bg-secondary p-4 text-left transition-colors active:scale-[0.99] hover:bg-muted/30"
                onClick={() => {
                  setQuickActionsOpen(false)
                  localStorage.setItem(LAST_QUICK_ACTION_KEY, type)
                  if (to) { navigate(to); return }
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
    </div>
  )
}
