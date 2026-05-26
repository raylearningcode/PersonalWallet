import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { useAppSettings } from '@/lib/queries'
import { Sidebar } from './Sidebar'
import { BottomNav } from './BottomNav'
import { MoreSheet } from './MoreSheet'

export function AppLayout() {
  const { data: settings } = useAppSettings()
  const [moreOpen, setMoreOpen] = useState(false)

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        goalLabel={settings?.annual_goal_label ?? 'No goal set'}
        goalPct={settings?.annual_goal_pct ?? 0}
      />
      <main className="min-h-screen w-full px-4 py-8 pb-24 lg:ml-[320px] lg:w-[calc(100vw-360px)] lg:max-w-[1032px] lg:pb-8 lg:pr-10">
        <Outlet />
      </main>
      <BottomNav onMoreClick={() => setMoreOpen(true)} moreActive={moreOpen} />
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </div>
  )
}
