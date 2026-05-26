import { Card, CardContent } from '@/components/ui/card'

type Variant = 'default' | 'success' | 'warning' | 'danger'

interface StatCardProps {
  label: string
  value: string
  badge?: string
  badgeVariant?: Variant
  sub?: string
}

const badgeColors: Record<Variant, string> = {
  default: 'bg-primary/20 text-primary',
  success: 'bg-green-500/20 text-green-400',
  warning: 'bg-yellow-500/20 text-yellow-400',
  danger: 'bg-red-500/20 text-red-400',
}

export function StatCard({ label, value, badge, badgeVariant = 'default', sub }: StatCardProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
        {badge && (
          <span className={`inline-block mt-2 text-xs px-2 py-0.5 rounded-full ${badgeColors[badgeVariant]}`}>
            {badge}
          </span>
        )}
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  )
}
