import { Link } from 'react-router-dom'
import { BarChart3, Brain, BriefcaseBusiness, ChevronRight, Download, Laptop, LineChart } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/shared/PageHeader'

const DESKTOP_TOOLS = [
  { label: 'Full Planning', desc: 'Long-form income, expenses, wishlist, and notes.', to: '/planning', Icon: BriefcaseBusiness },
  { label: 'Full Investing', desc: 'Portfolio allocation and projection controls.', to: '/investing', Icon: LineChart },
  { label: 'Advanced Reports', desc: 'Multi-range charts, exports, and deeper breakdowns.', to: '/reports', Icon: BarChart3 },
  { label: 'AI setup', desc: 'Gemini API key entry and advanced AI configuration.', to: '/settings?section=ai', Icon: Brain },
  { label: 'Raw backup/import', desc: 'Desktop-only JSON restore and data management.', to: '/settings?section=backup', Icon: Download },
]

export function DesktopTools() {
  return (
    <div>
      <PageHeader
        title="Desktop tools"
        subtitle="These tools stay available, but they work best on a larger screen."
      />

      <Card className="mb-2 border-primary/20 bg-primary/5">
        <CardContent className="flex items-start gap-2 p-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/15">
            <Laptop className="h-5 w-5 text-primary" />
          </span>
          <div>
            <p className="font-extrabold text-foreground">FinPath Studio is for deep work</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Mobile keeps capture, budgets, wallets, goals, bills, and simple reports close. Use desktop for setup-heavy or chart-heavy workflows.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Available on desktop</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 px-4 pb-3 sm:px-6">
          {DESKTOP_TOOLS.map(({ label, desc, to, Icon }) => (
            <Link
              key={label}
              to={to}
              className="flex items-center gap-3 rounded-2xl border border-border bg-secondary px-4 py-3 transition-colors hover:border-primary/40"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-background/70">
                <Icon className="h-4 w-4 text-primary" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-extrabold text-foreground">{label}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{desc}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
