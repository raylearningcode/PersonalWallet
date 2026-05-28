import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useBudgetCategories, useTransactions } from '@/lib/queries'
import { StatCard } from '@/components/shared/StatCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { calculateSavingsRate } from '@/lib/stats'
import { useMoney, txAmountColor, txAmountSign } from '@/lib/currency'
import { getCategoryInsights } from '@/lib/financeOs'
import { Download } from 'lucide-react'

type ReportRange = 'week' | 'month' | 'year'
type ReportMode = 'expense' | 'income'

const RANGE_LABELS: Record<ReportRange, string> = {
  week: 'Week',
  month: 'Month',
  year: 'Year',
}

const categoryColors = ['#A9F5C7', '#FADBEA', '#FFF7B5', '#D9E8FF', '#F8DCDC', '#C4AEFF', '#FFD276']

function getRangeBounds(range: ReportRange, periodDate: Date) {
  if (range === 'year') {
    const start = new Date(periodDate.getFullYear(), 0, 1)
    return { start, end: new Date(periodDate.getFullYear() + 1, 0, 1) }
  }
  if (range === 'month') {
    const start = new Date(periodDate.getFullYear(), periodDate.getMonth(), 1)
    return { start, end: new Date(periodDate.getFullYear(), periodDate.getMonth() + 1, 1) }
  }
  const start = new Date(periodDate)
  start.setDate(periodDate.getDate() - 6)
  start.setHours(0, 0, 0, 0)
  const end = new Date(periodDate)
  end.setDate(periodDate.getDate() + 1)
  end.setHours(0, 0, 0, 0)
  return { start, end }
}

function addPeriod(date: Date, range: ReportRange, direction: -1 | 1) {
  const next = new Date(date)
  if (range === 'year') next.setFullYear(date.getFullYear() + direction)
  else if (range === 'month') next.setMonth(date.getMonth() + direction)
  else next.setDate(date.getDate() + direction * 7)
  return next
}

function formatPeriodLabel(range: ReportRange, date: Date) {
  if (range === 'year') return String(date.getFullYear())
  if (range === 'month') return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const { start, end } = getRangeBounds(range, date)
  const finalDay = new Date(end)
  finalDay.setDate(end.getDate() - 1)
  return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${finalDay.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
}

function diffLabel(current: number, prev: number) {
  if (prev === 0) return null
  const pct = Math.round(((current - prev) / prev) * 100)
  return { pct, up: pct > 0 }
}

export function Reports() {
  const money = useMoney()
  const { data: transactions = [] } = useTransactions()
  const { data: categories = [] } = useBudgetCategories()
  const [range, setRange] = useState<ReportRange>('month')
  const [periodDate, setPeriodDate] = useState(() => new Date())
  const [mode, setMode] = useState<ReportMode>('expense')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  const { start: rangeStart, end: rangeEnd } = useMemo(() => getRangeBounds(range, periodDate), [periodDate, range])
  const periodLabel = formatPeriodLabel(range, periodDate)

  const rangeTx = useMemo(() => transactions.filter(tx => {
    const txDate = new Date(tx.date)
    return txDate >= rangeStart && txDate < rangeEnd
  }), [rangeEnd, rangeStart, transactions])

  const prevDate = useMemo(() => addPeriod(periodDate, range, -1), [periodDate, range])
  const { start: prevStart, end: prevEnd } = useMemo(() => getRangeBounds(range, prevDate), [prevDate, range])
  const prevRangeTx = useMemo(() => transactions.filter(tx => {
    const txDate = new Date(tx.date)
    return txDate >= prevStart && txDate < prevEnd
  }), [prevEnd, prevStart, transactions])

  const incomeTx = rangeTx.filter(tx => tx.type === 'income')
  const expenseTx = rangeTx.filter(tx => tx.type !== 'income' && tx.type !== 'transfer')
  const activeTx = mode === 'income' ? incomeTx : expenseTx

  const totalIncome = incomeTx.reduce((sum, tx) => sum + tx.amount, 0)
  const totalExpenses = expenseTx.reduce((sum, tx) => sum + tx.amount, 0)
  const savingsRate = calculateSavingsRate(totalIncome, totalExpenses)
  const avgSpend = range === 'year' ? Math.round(totalExpenses / 12) : range === 'week' ? Math.round(totalExpenses / 7) : totalExpenses

  const prevTotalIncome = prevRangeTx.filter(tx => tx.type === 'income').reduce((sum, tx) => sum + tx.amount, 0)
  const prevTotalExpenses = prevRangeTx.filter(tx => tx.type !== 'income' && tx.type !== 'transfer').reduce((sum, tx) => sum + tx.amount, 0)
  const incomeDiff = diffLabel(totalIncome, prevTotalIncome)
  const expenseDiff = diffLabel(totalExpenses, prevTotalExpenses)

  const categoryTotals = useMemo(() => {
    const map: Record<string, number> = {}
    activeTx.forEach(tx => {
      map[tx.category] = (map[tx.category] || 0) + tx.amount
    })
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [activeTx])

  const filteredTx = useMemo(() => {
    if (!selectedCategory) return []
    return activeTx.filter(tx => tx.category === selectedCategory).sort((a, b) => b.date.localeCompare(a.date))
  }, [activeTx, selectedCategory])
  const activeTotal = categoryTotals.reduce((sum, [, amount]) => sum + amount, 0)
  const topCategory = categoryTotals[0]?.[0] ?? 'Empty'
  const insights = getCategoryInsights(rangeTx, categories, periodDate).slice(0, 4)

  const handleRangeChange = (r: ReportRange) => { setRange(r); setSelectedCategory(null) }
  const handleModeChange = (m: ReportMode) => { setMode(m); setSelectedCategory(null) }

  const handleExportCSV = () => {
    const headers = ['Date', 'Description', 'Category', 'Type', 'Amount (display)', 'Amount (base)']
    const rows = rangeTx
      .sort((a, b) => b.date.localeCompare(a.date))
      .map(tx => [
        tx.date,
        `"${tx.description.replace(/"/g, '""')}"`,
        tx.category,
        tx.type,
        money.formatDisplay(tx.amount).replace(/,/g, ''),
        money.formatBase(tx.amount).replace(/,/g, ''),
      ])
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `finpath-${range}-${periodLabel.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('CSV exported successfully')
  }

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Review spending by week, month, or year with category charts and breakdowns."
        action={(
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center rounded-full border border-border bg-secondary p-1">
              <button aria-label="Previous period" className="h-9 w-9 rounded-full text-lg font-extrabold text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => setPeriodDate(current => addPeriod(current, range, -1))}>‹</button>
              <span className="min-w-[118px] px-3 text-center text-sm font-extrabold text-foreground">{periodLabel}</span>
              <button aria-label="Next period" className="h-9 w-9 rounded-full text-lg font-extrabold text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => setPeriodDate(current => addPeriod(current, range, 1))}>›</button>
            </div>
            <div className="flex rounded-full border border-border bg-secondary p-1">
              {(['week', 'month', 'year'] as ReportRange[]).map(item => (
                <button
                  key={item}
                  className={`rounded-full px-4 py-2 text-sm font-extrabold ${range === item ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
                  onClick={() => handleRangeChange(item)}
                >
                  {RANGE_LABELS[item]}
                </button>
              ))}
            </div>
            <Button size="sm" variant="secondary" className="gap-2" onClick={handleExportCSV} disabled={rangeTx.length === 0}>
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          </div>
        )}
      />
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
        <StatCard label="Savings rate" value={`${savingsRate}%`} sub={`${RANGE_LABELS[range]} view`} badgeVariant="success" />
        <StatCard label={range === 'week' ? 'Daily avg.' : range === 'year' ? 'Monthly avg.' : 'Spent'} value={money.formatDisplay(avgSpend)} sub="Expense pace" />
        <StatCard label="Top category" value={topCategory} sub={activeTotal > 0 ? `${Math.round((categoryTotals[0][1] / activeTotal) * 100)}% of ${mode}` : 'No spending yet'} badgeVariant="warning" />
      </div>

      {/* Period comparison */}
      {(incomeDiff || expenseDiff) && (
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card px-5 py-4">
            <p className="text-xs font-bold text-muted-foreground">Income vs previous {RANGE_LABELS[range].toLowerCase()}</p>
            <div className="mt-2 flex items-end gap-3">
              <span className="text-2xl font-extrabold text-foreground">{money.formatDisplay(totalIncome)}</span>
              {incomeDiff && (
                <span className={`mb-0.5 text-sm font-bold ${incomeDiff.up ? 'text-primary' : 'text-[#FF8388]'}`}>
                  {incomeDiff.up ? '▲' : '▼'} {Math.abs(incomeDiff.pct)}%
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">prev: {money.formatDisplay(prevTotalIncome)}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card px-5 py-4">
            <p className="text-xs font-bold text-muted-foreground">Expenses vs previous {RANGE_LABELS[range].toLowerCase()}</p>
            <div className="mt-2 flex items-end gap-3">
              <span className="text-2xl font-extrabold text-foreground">{money.formatDisplay(totalExpenses)}</span>
              {expenseDiff && (
                <span className={`mb-0.5 text-sm font-bold ${expenseDiff.up ? 'text-[#FF8388]' : 'text-primary'}`}>
                  {expenseDiff.up ? '▲' : '▼'} {Math.abs(expenseDiff.pct)}%
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">prev: {money.formatDisplay(prevTotalExpenses)}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.78fr)] lg:gap-8">
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-xl">Spending by category</CardTitle>
              <div className="flex rounded-full border border-border bg-secondary p-1">
                {(['income', 'expense'] as ReportMode[]).map(item => (
                  <button
                    key={item}
                    className={`rounded-full px-5 py-2 text-sm font-extrabold capitalize ${mode === item ? 'bg-card text-foreground' : 'text-muted-foreground'}`}
                    onClick={() => handleModeChange(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-5 pb-8 sm:px-8">
            <div className="grid grid-cols-1 items-center gap-8 md:grid-cols-[240px_minmax(0,1fr)]">
              <div className="relative mx-auto aspect-square w-full max-w-[240px] rounded-full" style={{ background: buildDonut(categoryTotals, activeTotal) }}>
                <div className="absolute inset-[20%] flex flex-col items-center justify-center rounded-full bg-card text-center">
                  <span className="text-sm text-muted-foreground">Total {mode}</span>
                  <strong className="mt-2 text-xl text-foreground">{money.formatDisplay(activeTotal)}</strong>
                </div>
              </div>
              <div className="space-y-2">
                {selectedCategory && (
                  <button
                    className="mb-2 flex items-center gap-2 rounded-xl bg-secondary px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground"
                    onClick={() => setSelectedCategory(null)}
                  >
                    ✕ Clear filter: {selectedCategory}
                  </button>
                )}
                {categoryTotals.length > 0 ? categoryTotals.map(([name, amount], index) => (
                  <button
                    key={name}
                    className={`flex w-full items-center justify-between gap-4 rounded-xl px-2 py-1.5 transition-colors ${selectedCategory === name ? 'bg-secondary' : 'hover:bg-secondary/60'}`}
                    onClick={() => setSelectedCategory(selectedCategory === name ? null : name)}
                    title={`Filter by ${name}`}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: categoryColors[index % categoryColors.length] }} />
                      <span className="truncate font-bold text-foreground">{name}</span>
                    </div>
                    <span className="text-sm font-bold text-muted-foreground">{Math.round((amount / activeTotal) * 100)}%</span>
                  </button>
                )) : (
                  <p className="text-sm text-muted-foreground">No {mode} data in this range.</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-xl">Category breakdown</CardTitle></CardHeader>
          <CardContent className="space-y-3 px-5 pb-6 sm:px-8">
            {categoryTotals.length > 0 ? categoryTotals.map(([name, amount], index) => (
              <div key={name} className="flex items-center justify-between gap-4 rounded-2xl bg-secondary p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl text-lg" style={{ backgroundColor: categoryColors[index % categoryColors.length] }}>
                    {name.slice(0, 1)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-extrabold text-foreground">{name}</p>
                    <p className="text-sm text-muted-foreground">{RANGE_LABELS[range]} {mode}</p>
                  </div>
                </div>
                <p className={`text-right font-extrabold ${txAmountColor(amount, mode)}`}>{txAmountSign(amount, mode)}{money.formatDisplay(amount)}</p>
              </div>
            )) : (
              <p className="rounded-2xl bg-secondary p-4 text-sm text-muted-foreground">No category data yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {selectedCategory && filteredTx.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-xl">{selectedCategory} — {filteredTx.length} transaction{filteredTx.length === 1 ? '' : 's'}</CardTitle>
            <p className="text-sm text-muted-foreground">Total: {money.formatDisplay(filteredTx.reduce((s, t) => s + t.amount, 0))}</p>
          </CardHeader>
          <CardContent className="space-y-2 px-5 pb-6 sm:px-8">
            {filteredTx.map(tx => (
              <div key={tx.id} className="flex items-center justify-between gap-4 rounded-2xl bg-secondary px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-bold text-foreground">{tx.description}</p>
                  <p className="text-xs text-muted-foreground">{tx.date}</p>
                </div>
                <p className={`shrink-0 font-extrabold ${txAmountColor(tx.amount, tx.type)}`}>
                  {txAmountSign(tx.amount, tx.type)}{money.formatDisplay(tx.amount)}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader><CardTitle className="text-xl">Reporter notes</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 px-5 pb-6 sm:px-8 md:grid-cols-2">
          {insights.length > 0 ? insights.map(insight => (
            <div key={insight.category} className="rounded-2xl border border-border bg-secondary p-4">
              <p className="font-extrabold text-foreground">{insight.category}</p>
              <p className="mt-2 text-sm leading-5 text-muted-foreground">{insight.message}</p>
            </div>
          )) : (
            <p className="rounded-2xl bg-secondary p-4 text-sm text-muted-foreground">No budget insight for this period yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function buildDonut(entries: [string, number][], total: number) {
  if (!entries.length || total <= 0) return 'conic-gradient(#26344e 0deg 360deg)'
  let cursor = 0
  const stops = entries.map(([, amount], index) => {
    const start = cursor
    cursor += (amount / total) * 360
    const color = categoryColors[index % categoryColors.length]
    return `${color} ${start}deg ${cursor}deg`
  })
  return `conic-gradient(${stops.join(', ')})`
}
