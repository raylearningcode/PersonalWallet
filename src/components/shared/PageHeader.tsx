import { useAppSettings } from '@/lib/queries'

interface PageHeaderProps {
  title: string
  subtitle: string
  action?: React.ReactNode
  searchValue?: string
  onSearchChange?: (value: string) => void
}

export function PageHeader({ title, subtitle, action, searchValue, onSearchChange }: PageHeaderProps) {
  const { data: settings } = useAppSettings()
  const avatarInitial = (settings?.user_name || settings?.email || 'FinPath').slice(0, 1).toUpperCase()

  return (
    <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
      <div className="min-w-0">
        <h1 className="text-2xl font-extrabold leading-tight text-foreground sm:text-[2rem]">{title}</h1>
        <p className="mt-1 max-w-3xl text-[15px] leading-6 text-muted-foreground">{subtitle}</p>
      </div>
      <div className="flex w-full flex-wrap items-center gap-3 lg:w-auto lg:flex-nowrap lg:gap-4">
        {onSearchChange !== undefined && (
          <input
            aria-label="Search"
            className="h-11 min-w-0 flex-1 rounded-full border border-border bg-[#111b31] px-5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 sm:flex-none sm:basis-[232px] lg:w-[232px]"
            placeholder="Search..."
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
  )
}
