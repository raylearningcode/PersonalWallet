import { Card, CardContent } from '@/components/ui/card'

type Variant = 'default' | 'success' | 'warning' | 'danger'

interface StatCardProps {
  label: string
  value: string
  badge?: string
  badgeVariant?: Variant
  sub?: string
}

const dotColors: Record<Variant, string> = {
  default: 'bg-[#93C5FD]',
  success: 'bg-primary',
  warning: 'bg-[#FFCF73]',
  danger: 'bg-[#FF8388]',
}

export function StatCard({ label, value, badge, badgeVariant = 'default', sub }: StatCardProps) {
  return (
    <Card className="relative min-h-[120px] sm:min-h-[132px]">
      <CardContent className="p-5 sm:p-6">
        <span className={`absolute right-5 top-5 h-3.5 w-3.5 rounded-full sm:right-7 sm:top-7 sm:h-4 sm:w-4 ${dotColors[badgeVariant]}`} />
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-3 break-all text-[1.4rem] font-extrabold leading-tight text-foreground sm:text-[1.8rem]">{value}</p>
        {sub && <p className="mt-4 text-sm text-muted-foreground sm:mt-5">{sub}</p>}
        {badge && !sub && <p className="mt-4 text-sm text-muted-foreground sm:mt-5">{badge}</p>}
      </CardContent>
    </Card>
  )
}
