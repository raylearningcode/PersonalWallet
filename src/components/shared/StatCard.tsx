import { Link } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'

type Variant = 'default' | 'success' | 'warning' | 'danger'

interface StatCardProps {
  label: string
  value: string
  badge?: string
  badgeVariant?: Variant
  sub?: string
  to?: string
}

const dotColors: Record<Variant, string> = {
  default: 'bg-[#93C5FD]',
  success: 'bg-primary',
  warning: 'bg-[#FFCF73]',
  danger: 'bg-[#FF8388]',
}

export function StatCard({ label, value, badge, badgeVariant = 'default', sub, to }: StatCardProps) {
  const inner = (
    <Card className={`relative min-h-[92px] sm:min-h-[104px] ${to ? 'transition-colors hover:border-primary/30 hover:bg-primary/5 active:scale-[0.99]' : ''}`}>
      <CardContent className="p-4 sm:p-5">
        <span className={`absolute right-4 top-4 h-3 w-3 rounded-full sm:right-5 sm:top-5 sm:h-3.5 sm:w-3.5 ${dotColors[badgeVariant]}`} />
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1.5 break-words tabular-nums text-xl font-extrabold leading-tight text-foreground sm:text-2xl">{value}</p>
        {sub && <p className="mt-2 text-xs text-muted-foreground sm:text-sm sm:mt-2.5">{sub}</p>}
        {badge && !sub && <p className="mt-2 text-xs text-muted-foreground sm:text-sm sm:mt-2.5">{badge}</p>}
      </CardContent>
    </Card>
  )
  if (to) return <Link to={to} className="block">{inner}</Link>
  return inner
}
