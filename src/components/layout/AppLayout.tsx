import { useState } from 'react'
import { Link, Outlet } from 'react-router-dom'
import { useAuthSession } from '@/lib/queries'
import { Sidebar } from './Sidebar'
import { BottomNav } from './BottomNav'
import { MoreSheet } from './MoreSheet'
import { QuickAddSheet } from './QuickAddSheet'

export function AppLayout() {
  const { data: session } = useAuthSession()
  const [moreOpen, setMoreOpen] = useState(false)
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const isGuest = session === null

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="min-h-screen w-full overflow-x-hidden px-4 py-6 pb-24 sm:px-6 lg:ml-[320px] lg:w-[calc(100vw-360px)] lg:max-w-[1440px] lg:px-0 lg:py-8 lg:pb-8 lg:pr-10">
        {isGuest && (
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
