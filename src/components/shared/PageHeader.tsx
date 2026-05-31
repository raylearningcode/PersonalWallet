import { useEffect, useRef, useState } from 'react'
import { useAppSettings } from '@/lib/queries'

interface PageHeaderProps {
  title: string
  subtitle: React.ReactNode
  action?: React.ReactNode
  searchValue?: string
  onSearchChange?: (value: string) => void
}

function useScrollHide() {
  const [hidden, setHidden] = useState(false)
  const lastY = useRef(0)
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY
      if (y < 80) { setHidden(false); lastY.current = y; return }
      const dy = y - lastY.current
      if (dy > 10) setHidden(true)
      else if (dy < -8) setHidden(false)
      lastY.current = y
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return hidden
}

export function PageHeader({ title, subtitle, action, searchValue, onSearchChange }: PageHeaderProps) {
  const { data: settings } = useAppSettings()
  const avatarInitial = (settings?.user_name || settings?.email || 'FinPath').slice(0, 1).toUpperCase()
  const scrolledDown = useScrollHide()

  return (
    <div className="mb-8">
      {/* Full header — fades and collapses when scrolling down on mobile */}
      <div
        className={`flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-8 lg:!opacity-100 lg:!max-h-[500px] lg:!mb-0 transition-all duration-300 ease-out overflow-hidden ${scrolledDown ? 'opacity-0 max-h-0 -translate-y-3 mb-0 pointer-events-none' : 'opacity-100 max-h-[500px] translate-y-0'}`}
      >
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold leading-tight text-foreground sm:text-[2rem]">{title}</h1>
          <p className="mt-1 max-w-3xl text-[15px] leading-6 text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-3 lg:w-auto lg:flex-nowrap lg:gap-4">
          {onSearchChange !== undefined && (
            <input
              aria-label="Search"
              className="h-11 min-w-0 flex-1 rounded-full border border-border bg-[#111b31] px-5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 sm:flex-none sm:basis-[232px] lg:w-[232px]"
              placeholder="Search merchant, category, note, amount…"
              value={searchValue ?? ''}
              onChange={e => onSearchChange(e.target.value)}
            />
          )}
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-extrabold text-primary-foreground sm:h-12 sm:w-12">
            {avatarInitial}
          </div>
          {action}
        </div>
      </div>

      {/* Compact mini-bar shown on mobile when scrolled — keeps title visible */}
      <div
        className={`lg:hidden flex items-center justify-between gap-3 overflow-hidden transition-all duration-300 ease-out ${scrolledDown ? 'max-h-12 opacity-100 mb-4' : 'max-h-0 opacity-0 mb-0 pointer-events-none'}`}
      >
        <p className="truncate text-base font-extrabold text-foreground">{title}</p>
        <div className="flex shrink-0 items-center gap-2">
          {onSearchChange !== undefined && (
            <input
              aria-label="Search"
              className="h-8 w-36 rounded-full border border-border bg-[#111b31] px-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
              placeholder="Search…"
              value={searchValue ?? ''}
              onChange={e => onSearchChange(e.target.value)}
            />
          )}
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-extrabold text-primary-foreground">
            {avatarInitial}
          </div>
        </div>
      </div>
    </div>
  )
}
