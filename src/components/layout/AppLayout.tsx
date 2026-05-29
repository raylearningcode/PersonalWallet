import { useEffect, useState } from 'react'
import { Link, Outlet } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthSession } from '@/lib/queries'
import { getQueue } from '@/lib/offlineCache'
import { processSyncQueue } from '@/lib/syncQueue'
import { toast } from 'sonner'
import { Sidebar } from './Sidebar'
import { BottomNav } from './BottomNav'
import { MoreSheet } from './MoreSheet'
import { QuickAddSheet } from './QuickAddSheet'
import { PinLockScreen, PIN_STORAGE_KEY, PIN_SESSION_KEY } from './PinLock'
import { NotificationsSheet } from './NotificationsSheet'

export function AppLayout() {
  const qc = useQueryClient()
  const { data: session } = useAuthSession()
  const [moreOpen, setMoreOpen] = useState(false)
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [pinLocked, setPinLocked] = useState(() =>
    Boolean(localStorage.getItem(PIN_STORAGE_KEY)) && !sessionStorage.getItem(PIN_SESSION_KEY)
  )
  const [offline, setOffline] = useState(() => !navigator.onLine)
  const [syncing, setSyncing] = useState(false)
  const isGuest = session === null

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
      <Sidebar />
      <main className="min-h-screen w-full overflow-x-hidden px-4 py-6 pb-24 sm:px-6 lg:ml-[240px] lg:w-[calc(100vw-275px)] lg:max-w-[1440px] lg:px-0 lg:py-6 lg:pb-8 lg:pr-8">
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
            <Link
              to="/settings"
              className="shrink-0 rounded-full bg-primary px-4 py-1.5 text-xs font-extrabold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Sign in to sync
            </Link>
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
        onAddClick={() => setQuickAddOpen(true)}
      />
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
      <QuickAddSheet open={quickAddOpen} onClose={() => setQuickAddOpen(false)} />
    </div>
  )
}
