import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { useBudgetCategories, useTransactions, useAddTransaction, useWallets } from '@/lib/queries'
import { StatCard } from '@/components/shared/StatCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { calculateSavingsRate } from '@/lib/stats'
import { useMoney, txAmountColor, txAmountSign } from '@/lib/currency'
import { getCategoryInsights } from '@/lib/financeOs'
import { Download, Upload, FileText } from 'lucide-react'
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

type ReportRange = 'week' | 'month' | 'year' | 'all'
type ReportMode = 'expense' | 'income'

const RANGE_LABELS: Record<ReportRange, string> = {
  week: 'Week',
  month: 'Month',
  year: 'Year',
  all: 'All time',
}

const categoryColors = ['#A9F5C7', '#FADBEA', '#FFF7B5', '#D9E8FF', '#F8DCDC', '#C4AEFF', '#FFD276']

function getRangeBounds(range: ReportRange, periodDate: Date, allTxDates?: string[]) {
  if (range === 'all') {
    if (allTxDates && allTxDates.length > 0) {
      const sorted = [...allTxDates].sort()
      return { start: new Date(sorted[0]), end: new Date(Date.now() + 86_400_000) }
    }
    return { start: new Date(0), end: new Date(Date.now() + 86_400_000) }
  }
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
  if (range === 'all') return date
  const next = new Date(date)
  if (range === 'year') next.setFullYear(date.getFullYear() + direction)
  else if (range === 'month') {
    next.setDate(1) // avoid day-overflow (e.g. May 31 − 1 month → April 31 → May 1)
    next.setMonth(date.getMonth() + direction)
  } else next.setDate(date.getDate() + direction * 7)
  return next
}

function formatPeriodLabel(range: ReportRange, date: Date) {
  if (range === 'all') return 'All time'
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
  const { data: wallets = [] } = useWallets()
  const addTransaction = useAddTransaction()
  const [range, setRange] = useState<ReportRange>('month')
  const [periodDate, setPeriodDate] = useState(() => new Date())
  const [mode, setMode] = useState<ReportMode>('expense')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedWalletId, setSelectedWalletId] = useState<string>('')
  const [clickedBucket, setClickedBucket] = useState<string | null>(null)
  const [showInternalMoves, setShowInternalMoves] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const allTxDates = useMemo(() => transactions.map(t => t.date), [transactions])
  const { start: rangeStart, end: rangeEnd } = useMemo(() => getRangeBounds(range, periodDate, allTxDates), [periodDate, range, allTxDates])
  const periodLabel = formatPeriodLabel(range, periodDate)

  const internalMovesTx = useMemo(() => transactions.filter(tx => {
    if (!tx.is_system_generated) return false
    const txDate = new Date(tx.date)
    return txDate >= rangeStart && txDate < rangeEnd
  }), [rangeEnd, rangeStart, transactions])

  const rangeTx = useMemo(() => transactions.filter(tx => {
    if (tx.is_system_generated) return false
    const txDate = new Date(tx.date)
    const inRange = txDate >= rangeStart && txDate < rangeEnd
    const inWallet = !selectedWalletId || tx.wallet_id === selectedWalletId
    return inRange && inWallet
  }), [rangeEnd, rangeStart, transactions, selectedWalletId])

  const prevDate = useMemo(() => addPeriod(periodDate, range, -1), [periodDate, range])
  const { start: prevStart, end: prevEnd } = useMemo(() => getRangeBounds(range, prevDate, allTxDates), [prevDate, range, allTxDates])
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

  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = {}
    activeTx.forEach(tx => { map[tx.category] = (map[tx.category] || 0) + 1 })
    return map
  }, [activeTx])

  const filteredTx = useMemo(() => {
    if (!selectedCategory) return []
    return activeTx.filter(tx => tx.category === selectedCategory).sort((a, b) => b.date.localeCompare(a.date))
  }, [activeTx, selectedCategory])
  const activeTotal = categoryTotals.reduce((sum, [, amount]) => sum + amount, 0)
  const topCategory = categoryTotals[0]?.[0] ?? '—'
  const insights = getCategoryInsights(rangeTx, categories, periodDate).slice(0, 4)

  const periodSummary = useMemo(() => {
    const items: string[] = []
    if (incomeDiff) items.push(`Income ${incomeDiff.up ? 'increased' : 'decreased'} by ${Math.abs(incomeDiff.pct)}% vs previous ${RANGE_LABELS[range].toLowerCase()}`)
    if (expenseDiff) items.push(`Expenses ${expenseDiff.up ? 'increased' : 'decreased'} by ${Math.abs(expenseDiff.pct)}% vs previous ${RANGE_LABELS[range].toLowerCase()}`)
    if (savingsRate > 0) items.push(`Savings rate this period: ${savingsRate}%`)
    if (topCategory !== '—') items.push(`Top spending category: ${topCategory} (${categoryTotals[0] ? Math.round((categoryTotals[0][1] / activeTotal) * 100) : 0}% of total)`)
    return items
  }, [incomeDiff, expenseDiff, savingsRate, topCategory, range, categoryTotals, activeTotal])

  const walletActivity = useMemo(() => {
    if (wallets.length === 0) return []
    return wallets.map(w => {
      const wIncome = rangeTx.filter(t => t.type === 'income' && t.wallet_id === w.id).reduce((s, t) => s + t.amount, 0)
      const wExpenses = rangeTx.filter(t => t.type !== 'income' && t.type !== 'transfer' && t.wallet_id === w.id).reduce((s, t) => s + t.amount, 0)
      const wTransferIn = rangeTx.filter(t => t.type === 'transfer' && t.transfer_wallet_id === w.id).reduce((s, t) => s + t.amount, 0)
      const wTransferOut = rangeTx.filter(t => t.type === 'transfer' && t.wallet_id === w.id).reduce((s, t) => s + t.amount, 0)
      const net = wIncome - wExpenses + wTransferIn - wTransferOut
      return { wallet: w, income: wIncome, expenses: wExpenses, net }
    }).filter(wa => wa.income > 0 || wa.expenses > 0)
  }, [wallets, rangeTx])

  const trendData = useMemo(() => {
    const toStr = (d: Date) => d.toISOString().slice(0, 10)
    const bucket = (txList: typeof rangeTx) => ({
      expenses: txList.filter(t => t.type !== 'income' && t.type !== 'transfer').reduce((s, t) => s + t.amount, 0),
      income: txList.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0),
    })
    if (range === 'week') {
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(rangeStart); d.setDate(rangeStart.getDate() + i)
        const dateStr = toStr(d)
        return { label: d.toLocaleDateString('en-GB', { weekday: 'short' }), ...bucket(rangeTx.filter(t => t.date === dateStr)) }
      })
    }
    if (range === 'month') {
      const weeks: { label: string; expenses: number; income: number }[] = []
      let cursor = new Date(rangeStart); let n = 1
      while (cursor < rangeEnd) {
        const wEnd = new Date(cursor); wEnd.setDate(wEnd.getDate() + 7)
        weeks.push({ label: `W${n}`, ...bucket(rangeTx.filter(t => t.date >= toStr(cursor) && t.date < toStr(wEnd))) })
        cursor = wEnd; n++
      }
      return weeks
    }
    if (range === 'all') {
      const years = Array.from(new Set(rangeTx.map(t => t.date.slice(0, 4)))).sort()
      if (years.length === 0) return []
      return years.map(yr => ({
        label: yr,
        ...bucket(rangeTx.filter(t => t.date.startsWith(yr))),
      }))
    }
    return Array.from({ length: 12 }, (_, i) => {
      const mStart = new Date(rangeStart.getFullYear(), i, 1)
      const mEnd = new Date(rangeStart.getFullYear(), i + 1, 1)
      return { label: mStart.toLocaleDateString('en-GB', { month: 'short' }), ...bucket(rangeTx.filter(t => t.date >= toStr(mStart) && t.date < toStr(mEnd))) }
    })
  }, [range, rangeStart, rangeEnd, rangeTx])

  const handleRangeChange = (r: ReportRange) => { setRange(r); setSelectedCategory(null); setClickedBucket(null) }
  const handleModeChange = (m: ReportMode) => { setMode(m); setSelectedCategory(null) }

  const bucketTx = useMemo(() => {
    if (!clickedBucket) return []
    const idx = trendData.findIndex(d => d.label === clickedBucket)
    if (idx < 0) return []
    // Recompute the date range for this bucket
    const toStr = (d: Date) => d.toISOString().slice(0, 10)
    let bucketStart: Date, bucketEnd: Date
    if (range === 'week') {
      bucketStart = new Date(rangeStart); bucketStart.setDate(rangeStart.getDate() + idx)
      bucketEnd = new Date(bucketStart); bucketEnd.setDate(bucketStart.getDate() + 1)
    } else if (range === 'month') {
      bucketStart = new Date(rangeStart); bucketStart.setDate(rangeStart.getDate() + idx * 7)
      bucketEnd = new Date(bucketStart); bucketEnd.setDate(bucketStart.getDate() + 7)
    } else if (range === 'all') {
      const yr = clickedBucket
      bucketStart = new Date(`${yr}-01-01`)
      bucketEnd = new Date(`${String(Number(yr) + 1)}-01-01`)
    } else {
      bucketStart = new Date(rangeStart.getFullYear(), idx, 1)
      bucketEnd = new Date(rangeStart.getFullYear(), idx + 1, 1)
    }
    const s = toStr(bucketStart), e = toStr(bucketEnd)
    return rangeTx
      .filter(t => t.date >= s && t.date < e)
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [clickedBucket, trendData, range, rangeStart, rangeTx])

  const handleFileLoad = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setImportText((ev.target?.result as string) ?? '')
    reader.readAsText(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleImportCSV = async () => {
    const lines = importText.trim().split('\n').filter(Boolean)
    if (lines.length < 2) { toast.error('CSV must have a header row and at least one data row'); return }

    // RFC 4180-compliant CSV field parser
    const parseCSVLine = (line: string): string[] => {
      const fields: string[] = []
      let i = 0
      while (i < line.length) {
        if (line[i] === '"') {
          let field = ''
          i++ // skip opening quote
          while (i < line.length) {
            if (line[i] === '"' && line[i + 1] === '"') { field += '"'; i += 2 }
            else if (line[i] === '"') { i++; break }
            else { field += line[i++] }
          }
          fields.push(field.trim())
          if (line[i] === ',') i++
        } else {
          const end = line.indexOf(',', i)
          if (end < 0) { fields.push(line.slice(i).trim()); break }
          fields.push(line.slice(i, end).trim())
          i = end + 1
        }
      }
      return fields
    }

    const header = parseCSVLine(lines[0]).map(h => h.toLowerCase().replace(/[^a-z]/g, ''))
    const dateIdx  = header.findIndex(h => h === 'date')
    const descIdx  = header.findIndex(h => h.startsWith('desc'))
    const catIdx   = header.findIndex(h => h.startsWith('cat'))
    const typeIdx  = header.findIndex(h => h === 'type')
    const amtIdx   = header.reduce((last, h, i) => (h.startsWith('amount') || h === 'amt') ? i : last, -1)
    if (dateIdx < 0 || descIdx < 0 || amtIdx < 0) {
      toast.error('CSV must have Date, Description, and Amount columns')
      return
    }

    // Build duplicate-detection set from existing transactions
    const existingKeys = new Set(
      transactions.map(t => `${t.date}|${t.description.toLowerCase()}|${Math.round(t.amount)}`)
    )

    setImporting(true)
    let added = 0; let skipped = 0; let failed = 0
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i])
      const date = cols[dateIdx]?.slice(0, 10)
      const description = cols[descIdx] ?? ''
      const category = catIdx >= 0 ? cols[catIdx] ?? '' : ''
      const rawType = typeIdx >= 0 ? cols[typeIdx]?.toLowerCase() : ''
      const type = rawType === 'income' ? 'income' : rawType === 'transfer' ? 'transfer' : 'expense'
      const amount = parseFloat(cols[amtIdx]?.replace(/[^0-9.]/g, '') ?? '0')
      if (!date || !description || isNaN(amount) || amount <= 0) { failed++; continue }

      const dupKey = `${date}|${description.toLowerCase()}|${Math.round(amount)}`
      if (existingKeys.has(dupKey)) { skipped++; continue }
      existingKeys.add(dupKey)

      try {
        await addTransaction.mutateAsync({
          user_id: null, description, amount, original_amount: amount,
          original_currency: money.baseCurrency, type,
          category: category || 'Other',
          wallet_id: wallets[0]?.id ?? null,
          transfer_wallet_id: null, recurring_rule_id: null,
          recurring_due_date: null, date, needs_review: true,
        })
        added++
      } catch { failed++ }
    }
    setImporting(false)
    const parts = [`Imported ${added} transaction${added !== 1 ? 's' : ''}`]
    if (skipped > 0) parts.push(`${skipped} duplicate${skipped !== 1 ? 's' : ''} skipped`)
    if (failed > 0) parts.push(`${failed} invalid row${failed !== 1 ? 's' : ''} skipped`)
    toast.success(parts.join(' · '))
    if (added > 0) { setImportText(''); setImportOpen(false) }
  }

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
              {range !== 'all' && <button aria-label="Previous period" className="flex h-11 w-11 items-center justify-center rounded-full text-lg font-extrabold text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => setPeriodDate(current => addPeriod(current, range, -1))}>‹</button>}
              <span className="min-w-[118px] px-3 text-center text-sm font-extrabold text-foreground">{periodLabel}</span>
              {range !== 'all' && <button aria-label="Next period" className="flex h-11 w-11 items-center justify-center rounded-full text-lg font-extrabold text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => setPeriodDate(current => addPeriod(current, range, 1))}>›</button>}
            </div>
            <div className="flex rounded-full border border-border bg-secondary p-1">
              {(['week', 'month', 'year', 'all'] as ReportRange[]).map(item => (
                <button
                  key={item}
                  className={`rounded-full px-4 py-2 text-sm font-extrabold ${range === item ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
                  onClick={() => handleRangeChange(item)}
                >
                  {RANGE_LABELS[item]}
                </button>
              ))}
            </div>
            {wallets.length > 0 && (
              <select
                aria-label="Filter by wallet"
                className="h-11 rounded-full border border-border bg-secondary px-3 text-sm font-bold text-foreground outline-none"
                value={selectedWalletId}
                onChange={e => { setSelectedWalletId(e.target.value); setSelectedCategory(null) }}
              >
                <option value="">All wallets</option>
                {wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            )}
            {internalMovesTx.length > 0 && (
              <button
                onClick={() => setShowInternalMoves(v => !v)}
                className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${showInternalMoves ? 'border-primary bg-primary/15 text-primary' : 'border-border bg-secondary text-muted-foreground hover:text-foreground'}`}
              >
                Cash movements ({internalMovesTx.length})
              </button>
            )}
            <Button size="sm" variant="secondary" className="gap-2" onClick={handleExportCSV} disabled={rangeTx.length === 0}>
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
            <Button size="sm" variant="secondary" className="gap-2" onClick={() => window.print()}>
              <FileText className="h-4 w-4" />
              Export PDF
            </Button>
            <Button size="sm" variant="secondary" className="gap-2" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4" />
              Import CSV
            </Button>
          </div>
        )}
      />
      {/* Mobile sticky period bar */}
      <div className="sticky top-0 z-10 -mx-4 mb-6 border-b border-border bg-background/95 px-4 py-2 backdrop-blur-sm lg:hidden">
        <div className="flex items-center justify-between gap-2">
          {range !== 'all' && <button aria-label="Previous period" className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-secondary text-lg font-extrabold text-muted-foreground" onClick={() => setPeriodDate(current => addPeriod(current, range, -1))}>‹</button>}
          <span className="flex-1 text-center text-sm font-extrabold text-foreground">{periodLabel}</span>
          {range !== 'all' && <button aria-label="Next period" className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-secondary text-lg font-extrabold text-muted-foreground" onClick={() => setPeriodDate(current => addPeriod(current, range, 1))}>›</button>}
          <div className="flex rounded-full border border-border bg-secondary p-0.5">
            {(['week', 'month', 'year', 'all'] as ReportRange[]).map(item => (
              <button
                key={item}
                className={`rounded-full px-2.5 py-1 text-xs font-extrabold transition-colors ${range === item ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
                onClick={() => handleRangeChange(item)}
              >
                {item === 'all' ? 'All' : RANGE_LABELS[item]}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-1.5 flex gap-2 overflow-x-auto pb-0.5">
          {[
            { label: 'This month', action: () => { handleRangeChange('month'); setPeriodDate(new Date()) } },
            { label: 'Last month', action: () => { handleRangeChange('month'); const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); setPeriodDate(d) } },
            { label: 'This year', action: () => { handleRangeChange('year'); setPeriodDate(new Date()) } },
            { label: 'All time', action: () => handleRangeChange('all') },
          ].map(({ label, action }) => (
            <button
              key={label}
              onClick={action}
              className="shrink-0 rounded-full border border-border bg-secondary px-3 py-1 text-xs font-bold text-muted-foreground hover:text-foreground"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-6">
        <StatCard label="Income" value={money.formatDisplay(totalIncome)} sub={`${incomeTx.length} transactions`} badgeVariant="success" />
        <StatCard label="Expenses" value={money.formatDisplay(totalExpenses)} sub={`${expenseTx.length} transactions`} badgeVariant="warning" />
        <StatCard label="Saved" value={money.formatDisplay(totalIncome - totalExpenses)} sub={`${savingsRate}% savings rate`} badgeVariant={totalIncome >= totalExpenses ? 'success' : 'danger'} />
        <StatCard label="Top category" value={topCategory} sub={activeTotal > 0 && categoryTotals.length > 0 ? `${Math.round((categoryTotals[0][1] / activeTotal) * 100)}% of ${mode}` : 'No data yet'} badgeVariant="warning" />
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

      {/* Spending trend chart */}
      <Card className="mb-8">
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="text-xl">Income vs Expenses</CardTitle>
            <div className="flex items-center gap-4 text-xs font-bold text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#A9F5C7]" />Income</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#FF8388]" />Expenses</span>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {range === 'week' ? 'Daily breakdown' : range === 'month' ? 'Weekly breakdown' : range === 'all' ? 'Yearly breakdown' : 'Monthly breakdown'} for {periodLabel}
          </p>
        </CardHeader>
        <CardContent className="px-2 pb-4 sm:px-6">
          {rangeTx.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm text-muted-foreground">No transactions in this period.</p>
              <p className="mt-1 text-xs text-muted-foreground">Try a different period or add a transaction.</p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                <button className="rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground" onClick={() => { handleRangeChange('month'); setPeriodDate(new Date()) }}>This month</button>
                <button className="rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground" onClick={() => { handleRangeChange('year'); setPeriodDate(new Date()) }}>This year</button>
                <button className="rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground" onClick={() => handleRangeChange('all')}>All time</button>
              </div>
              <Link to="/transactions" className="mt-4 inline-block rounded-full bg-primary px-5 py-2 text-xs font-extrabold text-primary-foreground hover:bg-primary/90">
                Add transaction
              </Link>
            </div>
          ) : (
            <>
              <p className="mb-2 px-2 text-xs text-muted-foreground">Tap a bar to see transactions for that period</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={trendData}
                  barGap={3}
                  barCategoryGap="28%"
                  style={{ cursor: 'pointer' }}
                  onClick={d => {
                    const label = d?.activeLabel as string | undefined
                    if (label) setClickedBucket(b => b === label ? null : label)
                  }}
                >
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    cursor={{ fill: 'rgba(255,255,255,0.06)' }}
                    contentStyle={{ background: '#1a2236', border: '1px solid #2d3953', borderRadius: 12, fontSize: 12 }}
                    formatter={(v) => money.formatDisplay(typeof v === 'number' ? v : 0)}
                  />
                  <Bar dataKey="income" name="Income" fill="#A9F5C7" radius={[4, 4, 0, 0]} label={false}>
                    {trendData.map((entry, i) => (
                      <Cell key={i} opacity={clickedBucket && entry.label !== clickedBucket ? 0.4 : 1} />
                    ))}
                  </Bar>
                  <Bar dataKey="expenses" name="Expenses" fill="#FF8388" radius={[4, 4, 0, 0]}>
                    {trendData.map((entry, i) => (
                      <Cell key={i} opacity={clickedBucket && entry.label !== clickedBucket ? 0.4 : 1} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </>
          )}
          {clickedBucket && bucketTx.length > 0 && (
            <div className="mt-4 rounded-2xl border border-border bg-secondary/60 p-4">
              <div className="flex items-center justify-between gap-2 mb-3">
                <p className="font-extrabold text-foreground">{clickedBucket} — {bucketTx.length} transaction{bucketTx.length !== 1 ? 's' : ''}</p>
                <button onClick={() => setClickedBucket(null)} aria-label="Close transaction list" className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground">✕</button>
              </div>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {bucketTx.map(tx => (
                  <div key={tx.id} className="flex items-center justify-between gap-3 rounded-xl bg-card px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-bold text-foreground">{tx.description}</p>
                      <p className="text-xs text-muted-foreground">{tx.category} · {tx.date}</p>
                    </div>
                    <span className={`shrink-0 font-extrabold ${txAmountColor(tx.amount, tx.type)}`}>
                      {txAmountSign(tx.amount, tx.type)}{money.formatDisplay(tx.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Narrative summary */}
      {periodSummary.length > 0 && (
        <div className="mb-8 rounded-2xl border border-border bg-card px-5 py-4">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Period summary</p>
          <ul className="mt-3 space-y-1.5">
            {periodSummary.map((line, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                {line}
              </li>
            ))}
          </ul>
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
                    className={`rounded-full px-5 py-2 text-sm font-extrabold capitalize transition-colors ${mode === item ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                    onClick={() => handleModeChange(item)}
                    aria-label={`Show ${item} breakdown`}
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
                    aria-label={`Filter transactions by ${name}`}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: categoryColors[index % categoryColors.length] }} />
                      <span className="truncate font-bold text-foreground">{name}</span>
                    </div>
                    <span className="text-sm font-bold text-muted-foreground">{Math.round((amount / activeTotal) * 100)}%</span>
                  </button>
                )) : (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      No {mode} data for this period.
                      {mode === 'income' ? ' Try switching to expense view.' : ' Try a different date range.'}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {mode === 'income' && (
                        <button
                          className="rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground"
                          onClick={() => handleModeChange('expense')}
                        >
                          Show expenses →
                        </button>
                      )}
                      {range !== 'month' && (
                        <button
                          className="rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground"
                          onClick={() => { handleRangeChange('month'); setPeriodDate(new Date()) }}
                        >
                          This month
                        </button>
                      )}
                      {range !== 'year' && (
                        <button
                          className="rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground"
                          onClick={() => handleRangeChange('year')}
                        >
                          This year
                        </button>
                      )}
                    </div>
                  </div>
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
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg font-bold" style={{ backgroundColor: categoryColors[index % categoryColors.length] }}>
                    {name.slice(0, 1)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-extrabold text-foreground">{name}</p>
                    <p className="text-xs text-muted-foreground">
                      {categoryCounts[name] ?? 0} transaction{(categoryCounts[name] ?? 0) !== 1 ? 's' : ''} · avg {money.formatDisplay(Math.round(amount / Math.max(1, categoryCounts[name] ?? 1)))}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-extrabold ${txAmountColor(amount, mode)}`}>{txAmountSign(amount, mode)}{money.formatDisplay(amount)}</p>
                  <p className="text-xs text-muted-foreground">{activeTotal > 0 ? Math.round((amount / activeTotal) * 100) : 0}%</p>
                </div>
              </div>
            )) : (
              <div className="space-y-3 rounded-2xl bg-secondary p-5">
                <p className="text-sm text-muted-foreground">
                  No {mode} data for {periodLabel}. Try switching the date range or adding a transaction.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground"
                    onClick={() => { handleRangeChange('month'); setPeriodDate(new Date()) }}
                  >
                    This month
                  </button>
                  <button
                    className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground"
                    onClick={() => { handleRangeChange('year'); setPeriodDate(new Date()) }}
                  >
                    This year
                  </button>
                  <button
                    className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground"
                    onClick={() => { setRange('week'); setPeriodDate(new Date()); setSelectedCategory(null); setClickedBucket(null) }}
                  >
                    This week
                  </button>
                  <button
                    className="rounded-full border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/10"
                    onClick={() => { handleRangeChange('all'); setPeriodDate(new Date()) }}
                  >
                    All time
                  </button>
                </div>
              </div>
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

      {showInternalMoves && internalMovesTx.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-xl">Cash movements</CardTitle>
            <p className="text-sm text-muted-foreground">System-generated change transfers from Cash Change Assistant.</p>
          </CardHeader>
          <CardContent className="space-y-2 px-5 pb-6 sm:px-8">
            {internalMovesTx.sort((a, b) => b.date.localeCompare(a.date)).map(tx => {
              const fromWallet = wallets.find(w => w.id === tx.wallet_id)
              const toWallet = wallets.find(w => w.id === tx.transfer_wallet_id)
              return (
                <div key={tx.id} className="flex items-center justify-between gap-4 rounded-2xl bg-secondary px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-bold text-foreground">{tx.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {tx.date} · {fromWallet?.name ?? 'wallet'} → {toWallet?.name ?? 'wallet'}
                    </p>
                  </div>
                  <p className="shrink-0 font-extrabold text-foreground">{money.formatDisplay(tx.amount)}</p>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {walletActivity.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-xl">Wallet activity</CardTitle>
            <p className="text-sm text-muted-foreground">Money flow per wallet during this period.</p>
          </CardHeader>
          <CardContent className="space-y-3 px-5 pb-6 sm:px-8">
            {walletActivity.map(({ wallet, income, expenses, net }) => (
              <div key={wallet.id} className="rounded-2xl border border-border bg-secondary px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-extrabold text-foreground">{wallet.name}</p>
                  <span className={`text-sm font-extrabold ${net >= 0 ? 'text-primary' : 'text-[#FF8388]'}`}>
                    {net >= 0 ? '+' : ''}{money.formatDisplay(net)}
                  </span>
                </div>
                <div className="mt-1.5 flex gap-4 text-xs text-muted-foreground">
                  {income > 0 && <span>In: <span className="font-bold text-primary">{money.formatDisplay(income)}</span></span>}
                  {expenses > 0 && <span>Out: <span className="font-bold text-[#FF8388]">{money.formatDisplay(expenses)}</span></span>}
                </div>
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

      <Sheet open={importOpen} onOpenChange={setImportOpen}>
        <SheetContent side="right" className="w-full max-w-md">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-primary" />
              Import transactions
            </SheetTitle>
          </SheetHeader>
          <div className="mt-4 flex flex-col gap-4">
            <div className="rounded-2xl border border-border bg-secondary p-4 text-sm text-muted-foreground">
              <p className="font-bold text-foreground">Accepted CSV columns:</p>
              <p className="mt-1">Date, Description, Category, Type (income/expense/transfer), Amount</p>
              <p className="mt-2 text-xs">You can use FinPath's own exported CSV, or any CSV that has at least Date, Description, and Amount. Imported rows are marked "needs review".</p>
            </div>
            <div>
              <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileLoad} />
              <Button variant="secondary" className="w-full gap-2" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4" />
                Choose CSV file
              </Button>
            </div>
            <p className="text-center text-xs text-muted-foreground">— or paste CSV text below —</p>
            <textarea
              aria-label="CSV text to import"
              className="min-h-48 w-full rounded-2xl border border-border bg-secondary p-4 font-mono text-xs text-foreground outline-none focus:border-primary"
              value={importText}
              onChange={e => setImportText(e.target.value)}
              placeholder={"Date,Description,Category,Type,Amount\n2026-05-01,Grocery Store,Food,expense,150000"}
            />
            <Button onClick={handleImportCSV} disabled={!importText.trim() || importing} className="w-full">
              {importing ? 'Importing…' : 'Import transactions'}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
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
