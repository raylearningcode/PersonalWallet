import { useMemo, useState } from 'react'
import { useTransactions, useBudgetCategories, useRecurringRules } from '@/lib/queries'
import { useMoney } from '@/lib/currency'
import { useIsDesktop } from '@/hooks/useIsDesktop'
import { PageHeader } from '@/components/shared/PageHeader'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ChevronLeft, ChevronRight, ArrowDown, ArrowUp, X, Bell } from 'lucide-react'
import { toLocalDateStr, todayLocal } from '@/lib/utils'
import { addRecurringInterval } from '@/lib/recurring'
import type { RecurringRule } from '@/types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}
function firstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay()
}

// ─── Color scales ────────────────────────────────────────────────────────────

function heatColor(amount: number, maxAmount: number): string {
  if (amount === 0 || maxAmount === 0) return 'transparent'
  const t = amount / maxAmount
  if (t < 0.1) return 'rgba(169,245,199,0.18)'
  if (t < 0.25) return 'rgba(169,245,199,0.40)'
  if (t < 0.45) return 'rgba(169,245,199,0.62)'
  if (t < 0.65) return 'rgba(255,207,115,0.68)'
  if (t < 0.85) return 'rgba(255,150,80,0.72)'
  return 'rgba(255,131,136,0.88)'
}

// ─── Transaction row (reused) ────────────────────────────────────────────────

function TxRow({
  tx, money, categories,
}: {
  tx: { id: string; description: string; category: string; type: string; amount: number }
  money: ReturnType<typeof useMoney>
  categories: { name: string; color: string }[]
}) {
  const cat = categories.find(c => c.name === tx.category)
  const isExpense = tx.type !== 'income'
  return (
    <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-secondary/50 transition-colors">
      <div className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: cat?.color ?? '#6b7280' }} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-foreground">{tx.description || 'Untitled'}</p>
        <p className="text-xs text-muted-foreground">{tx.category}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className={`text-sm font-extrabold ${isExpense ? 'text-destructive' : 'text-primary'}`}>
          {isExpense ? '-' : '+'}{money.formatDisplay(tx.amount)}
        </p>
      </div>
      <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${isExpense ? 'bg-destructive/10' : 'bg-primary/10'}`}>
        {isExpense
          ? <ArrowDown className="h-3 w-3 text-destructive" />
          : <ArrowUp className="h-3 w-3 text-primary" />
        }
      </div>
    </div>
  )
}

// ─── Due bill row (reused) ───────────────────────────────────────────────────

function BillRow({ bill, money }: { bill: RecurringRule; money: ReturnType<typeof useMoney> }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[#FFCF73]/25 bg-[#FFCF73]/10 px-3 py-2.5">
      <Bell className="h-3.5 w-3.5 shrink-0 text-[#FFCF73]" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-foreground">{bill.description}</p>
        <p className="text-xs text-muted-foreground">
          {bill.installment_total ? `${bill.installment_paid}/${bill.installment_total} installments` : 'Recurring bill'}
        </p>
      </div>
      <p className="shrink-0 text-sm font-extrabold tabular-nums text-[#FFCF73]">
        {money.format(bill.original_amount ?? bill.amount, bill.original_currency ?? money.baseCurrency)}
      </p>
    </div>
  )
}

// ─── Desktop day panel ───────────────────────────────────────────────────────

function DesktopDayPanel({
  dateStr,
  onClose,
  txs,
  money,
  categories,
  bills = [],
}: {
  dateStr: string
  onClose: () => void
  txs: ReturnType<typeof useTransactions>['data']
  money: ReturnType<typeof useMoney>
  categories: { name: string; color: string }[]
  bills?: RecurringRule[]
}) {
  const expenses = (txs ?? []).filter(t => t.type !== 'income')
  const income = (txs ?? []).filter(t => t.type === 'income')
  const totalExpense = expenses.reduce((s, t) => s + t.amount, 0)
  const totalIncome = income.reduce((s, t) => s + t.amount, 0)

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center justify-between gap-3 mb-5">
        <div>
          <h3 className="text-lg font-extrabold text-foreground">{dateStr}</h3>
          <p className="text-xs text-muted-foreground">{(txs ?? []).length} transaction{(txs ?? []).length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-muted-foreground hover:text-foreground" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Summary */}
      <div className="mb-5 grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-secondary px-3 py-2.5 text-center">
          <p className="text-[10px] text-muted-foreground">Spent</p>
          <p className="mt-0.5 text-sm font-extrabold text-destructive">{money.formatDisplay(totalExpense)}</p>
        </div>
        <div className="rounded-xl bg-secondary px-3 py-2.5 text-center">
          <p className="text-[10px] text-muted-foreground">Received</p>
          <p className="mt-0.5 text-sm font-extrabold text-primary">{money.formatDisplay(totalIncome)}</p>
        </div>
        <div className={`rounded-xl px-3 py-2.5 text-center ${totalIncome - totalExpense >= 0 ? 'bg-primary/10' : 'bg-destructive/10'}`}>
          <p className="text-[10px] text-muted-foreground">Net</p>
          <p className={`mt-0.5 text-sm font-extrabold ${totalIncome - totalExpense >= 0 ? 'text-primary' : 'text-destructive'}`}>
            {totalIncome - totalExpense >= 0 ? '+' : ''}{money.formatDisplay(totalIncome - totalExpense)}
          </p>
        </div>
      </div>

      {bills.length > 0 && (
        <div className="mb-5">
          <p className="mb-2 text-xs font-extrabold uppercase tracking-widest text-[#FFCF73]">Bills due</p>
          <div className="space-y-1.5">
            {bills.map(b => <BillRow key={b.id} bill={b} money={money} />)}
          </div>
        </div>
      )}

      {!(txs ?? []).length ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No transactions this day.</p>
      ) : (
        <div className="max-h-[420px] overflow-y-auto space-y-1">
          {txs!.map(tx => <TxRow key={tx.id} tx={tx} money={money} categories={categories} />)}
        </div>
      )}
    </div>
  )
}

// ─── Mobile day sheet ────────────────────────────────────────────────────────

function MobileDaySheet({
  dateStr, open, onClose, txs, money, categories, bills = [],
}: {
  dateStr: string; open: boolean; onClose: () => void
  txs: ReturnType<typeof useTransactions>['data']
  money: ReturnType<typeof useMoney>
  categories: { name: string; color: string }[]
  bills?: RecurringRule[]
}) {
  const expenses = (txs ?? []).filter(t => t.type !== 'income')
  const income = (txs ?? []).filter(t => t.type === 'income')
  const totalExpense = expenses.reduce((s, t) => s + t.amount, 0)
  const totalIncome = income.reduce((s, t) => s + t.amount, 0)

  return (
    <Sheet open={open} onOpenChange={o => { if (!o) onClose() }}>
      <SheetContent side="bottom" className="max-h-[65vh] overflow-y-auto rounded-t-3xl border-border bg-background pb-safe-10">
        <SheetHeader className="mb-3">
          <SheetTitle className="text-lg">{dateStr}</SheetTitle>
        </SheetHeader>

        <div className="mb-4 grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-secondary px-3 py-2.5 text-center">
            <p className="text-[10px] text-muted-foreground">Spent</p>
            <p className="mt-0.5 text-sm font-extrabold text-destructive">{money.formatDisplay(totalExpense)}</p>
          </div>
          <div className="rounded-xl bg-secondary px-3 py-2.5 text-center">
            <p className="text-[10px] text-muted-foreground">Received</p>
            <p className="mt-0.5 text-sm font-extrabold text-primary">{money.formatDisplay(totalIncome)}</p>
          </div>
          <div className={`rounded-xl px-3 py-2.5 text-center ${totalIncome - totalExpense >= 0 ? 'bg-primary/10' : 'bg-destructive/10'}`}>
            <p className="text-[10px] text-muted-foreground">Net</p>
            <p className={`mt-0.5 text-sm font-extrabold ${totalIncome - totalExpense >= 0 ? 'text-primary' : 'text-destructive'}`}>
              {totalIncome - totalExpense >= 0 ? '+' : ''}{money.formatDisplay(totalIncome - totalExpense)}
            </p>
          </div>
        </div>

        {bills.length > 0 && (
          <div className="mb-4">
            <p className="mb-2 text-xs font-extrabold uppercase tracking-widest text-[#FFCF73]">Bills due</p>
            <div className="space-y-1.5">
              {bills.map(b => <BillRow key={b.id} bill={b} money={money} />)}
            </div>
          </div>
        )}

        {!(txs ?? []).length ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No transactions this day.</p>
        ) : (
          <div className="space-y-1.5">
            {txs!.map(tx => <TxRow key={tx.id} tx={tx} money={money} categories={categories} />)}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

// ─── Monthly Calendar ────────────────────────────────────────────────────────

function MonthlyCalendar() {
  const money = useMoney()
  const { data: transactions = [] } = useTransactions()
  const { data: categories = [] } = useBudgetCategories()
  const { data: rules = [] } = useRecurringRules()
  const isDesktop = useIsDesktop()
  const now = new Date()
  const [viewYear, setViewYear] = useState(now.getFullYear())
  const [viewMonth, setViewMonth] = useState(now.getMonth())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) }
    else setViewMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) }
    else setViewMonth(m => m + 1)
  }

  const prefix = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-`
  const dailyData = useMemo(() => {
    const map: Record<string, { total: number; income: number; txs: typeof transactions }> = {}
    transactions.filter(t => t.date.startsWith(prefix)).forEach(t => {
      if (!map[t.date]) map[t.date] = { total: 0, income: 0, txs: [] }
      map[t.date].txs.push(t)
      if (t.type !== 'income') map[t.date].total += t.amount
      else map[t.date].income += t.amount
    })
    return map
  }, [transactions, prefix])

  const maxDaily = Math.max(...Object.values(dailyData).map(d => d.total), 1)
  const days = daysInMonth(viewYear, viewMonth)
  const startDay = firstDayOfMonth(viewYear, viewMonth)
  const totalSpend = Object.values(dailyData).reduce((s, d) => s + d.total, 0)
  const totalIncome = Object.values(dailyData).reduce((s, d) => s + d.income, 0)
  const activeDays = Object.keys(dailyData).length

  // Due dates of active recurring bills within the viewed month
  const billsByDate = useMemo(() => {
    const map: Record<string, RecurringRule[]> = {}
    const monthStart = prefix + '01'
    const monthEnd = prefix + String(days).padStart(2, '0')
    for (const r of rules) {
      if (!r.active || r.type === 'income') continue
      if (r.installment_total != null && (r.installment_paid ?? 0) >= r.installment_total) continue
      let d = r.next_due_date || r.start_date
      let guard = 0
      while (d < monthStart && guard++ < 400) d = addRecurringInterval(d, r.frequency)
      while (d <= monthEnd && guard++ < 400) {
        if (d >= monthStart) (map[d] ??= []).push(r)
        if (r.end_date && d >= r.end_date) break
        d = addRecurringInterval(d, r.frequency)
      }
    }
    return map
  }, [rules, prefix, days])

  const cells: (number | null)[] = []
  for (let i = 0; i < startDay; i++) cells.push(null)
  for (let d = 1; d <= days; d++) cells.push(d)

  const selectedTxs = selectedDate ? (dailyData[selectedDate]?.txs ?? []) : []

  return (
    <div className={isDesktop ? 'max-w-3xl' : ''}>
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-5 py-3.5">
        <div className="flex items-center gap-1.5">
          <button onClick={prevMonth} className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-foreground hover:bg-muted" aria-label="Previous month">
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="min-w-[140px] text-center text-sm font-extrabold text-foreground">
            {MONTH_NAMES[viewMonth]} {viewYear}
          </span>
          <button onClick={nextMonth} className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-foreground hover:bg-muted" aria-label="Next month">
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
          <span className="text-muted-foreground">Spent <span className="font-bold text-destructive">{money.formatDisplay(totalSpend)}</span></span>
          <span className="text-muted-foreground">Received <span className="font-bold text-primary">{money.formatDisplay(totalIncome)}</span></span>
          <span className="text-muted-foreground">{activeDays} day{activeDays !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Grid */}
      <div className="rounded-2xl border border-border bg-card p-3 sm:p-5">
        <div className="mb-1.5 grid grid-cols-7 text-center">
          {DAY_NAMES.map(d => (
            <span key={d} className="text-[11px] font-bold text-muted-foreground py-1">{isDesktop ? d.slice(0, 3) : d.slice(0, 2)}</span>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
          {cells.map((day, i) => {
            if (day === null) return <div key={`empty-${i}`} className={`${isDesktop ? 'aspect-[4/3] max-h-[64px]' : 'aspect-square max-h-[80px]'}`} />

            const dateStr = `${prefix}${String(day).padStart(2, '0')}`
            const data = dailyData[dateStr]
            const amount = data?.total ?? 0
            const hasIncome = (data?.income ?? 0) > 0
            const dueBills = billsByDate[dateStr]
            const bg = amount > 0 ? heatColor(amount, maxDaily) : 'transparent'
            const today = dateStr === todayLocal()

            return (
              <button
                key={dateStr}
                type="button"
                className={`relative ${isDesktop ? 'aspect-[4/3] max-h-[64px]' : 'aspect-square max-h-[80px]'} flex flex-col items-center justify-center rounded-lg text-xs transition-colors hover:ring-1 hover:ring-primary/50 ${
                  today ? 'ring-1 ring-primary' : ''
                } ${selectedDate === dateStr ? 'ring-2 ring-foreground' : ''}`}
                style={{ backgroundColor: bg }}
                onClick={() => setSelectedDate(selectedDate === dateStr ? null : dateStr)}
                title={`${dateStr}${amount > 0 ? ` — spent ${money.formatDisplay(amount)}` : ''}${
                  dueBills?.length ? ` — ${dueBills.slice(0, 3).map(b => b.description).join(', ')}${dueBills.length > 3 ? '…' : ''} due` : ''
                }`}
              >
                <span className={`font-bold ${isDesktop ? 'text-xs' : 'text-xs sm:text-sm'} ${
                  amount > 0 && amount / maxDaily > 0.55 ? 'text-background' : 'text-foreground'
                }`}>
                  {day}
                </span>
                {hasIncome && (
                  <span className="absolute top-1 right-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
                )}
                {dueBills && dueBills.length > 0 && (
                  <span className="absolute bottom-1 left-1/2 flex -translate-x-1/2 gap-0.5">
                    {dueBills.slice(0, 3).map(b => (
                      <span key={b.id} className="h-1.5 w-1.5 rounded-full bg-[#FFCF73]" />
                    ))}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Legend */}
        <div className="mt-3 flex items-center justify-end gap-2 text-[10px] text-muted-foreground">
          <span>Less</span>
          {[0.1, 0.25, 0.45, 0.65, 0.85].map(r => (
            <span key={r} className="h-3 w-3 rounded-sm" style={{ backgroundColor: heatColor(r * maxDaily, maxDaily) }} />
          ))}
          <span>More</span>
          <span className="ml-2 flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" /> Income
          </span>
          <span className="ml-2 flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-[#FFCF73]" /> Bills due
          </span>
        </div>
      </div>

      {/* Selected day panel */}
      {isDesktop && selectedDate && (
        <div className="mt-6">
          <DesktopDayPanel
            dateStr={selectedDate}
            onClose={() => setSelectedDate(null)}
            txs={selectedTxs}
            money={money}
            categories={categories}
            bills={billsByDate[selectedDate] ?? []}
          />
        </div>
      )}

      {!isDesktop && (
        <MobileDaySheet
          dateStr={selectedDate ?? ''}
          open={selectedDate !== null}
          onClose={() => setSelectedDate(null)}
          txs={selectedTxs}
          money={money}
          categories={categories}
          bills={selectedDate ? billsByDate[selectedDate] ?? [] : []}
        />
      )}
    </div>
  )
}

// ─── Yearly Heatmap ──────────────────────────────────────────────────────────

function YearlyHeatmap() {
  const money = useMoney()
  const { data: transactions = [] } = useTransactions()
  const { data: categories = [] } = useBudgetCategories()
  const isDesktop = useIsDesktop()
  const now = new Date()
  const [viewYear, setViewYear] = useState(now.getFullYear())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const dailyData = useMemo(() => {
    const map: Record<string, { total: number; income: number; txs: typeof transactions }> = {}
    transactions.filter(t => t.date.startsWith(String(viewYear))).forEach(t => {
      if (!map[t.date]) map[t.date] = { total: 0, income: 0, txs: [] }
      map[t.date].txs.push(t)
      if (t.type !== 'income') map[t.date].total += t.amount
      else map[t.date].income += t.amount
    })
    return map
  }, [transactions, viewYear])

  const maxDaily = Math.max(...Object.values(dailyData).map(d => d.total), 1)
  const totalSpend = Object.values(dailyData).reduce((s, d) => s + d.total, 0)
  const activeDays = Object.keys(dailyData).length

  const startDayOfWeek = new Date(viewYear, 0, 1).getDay()
  const gridStart = new Date(viewYear, 0, 1 - startDayOfWeek)
  const current = new Date(gridStart)
  const weeks: { date: string; month: number }[][] = []

  while (current.getFullYear() <= viewYear || weeks.length < 53) {
    const week: { date: string; month: number }[] = []
    for (let row = 0; row < 7; row++) {
      week.push({ date: toLocalDateStr(current), month: current.getMonth() })
      current.setDate(current.getDate() + 1)
    }
    weeks.push(week)
    if (current.getFullYear() > viewYear) break
  }

  const monthLabels: { label: string; col: number }[] = []
  weeks.forEach((week, col) => {
    const m = week[0]?.month ?? 0
    const label = MONTH_NAMES[m].slice(0, 3)
    if (!monthLabels.length || monthLabels[monthLabels.length - 1].label !== label) {
      monthLabels.push({ label, col })
    }
  })

  const cellSize = 'w-[12px] h-[12px] sm:w-[14px] sm:h-[14px]'
  const cellGap = 'gap-[2px] sm:gap-[3px]'

  const selectedTxs = selectedDate ? (dailyData[selectedDate]?.txs ?? []) : []

  return (
    <div className={isDesktop ? 'max-w-4xl' : ''}>
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-5 py-3.5">
        <div className="flex items-center gap-2">
          <button onClick={() => setViewYear(y => y - 1)} className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-foreground hover:bg-muted" aria-label="Previous year">
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="w-14 text-center text-sm font-extrabold">{viewYear}</span>
          <button onClick={() => setViewYear(y => y + 1)} disabled={viewYear >= now.getFullYear()} className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-foreground hover:bg-muted disabled:opacity-30" aria-label="Next year">
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
          <span>Spent <span className="font-bold text-destructive">{money.formatDisplay(totalSpend)}</span></span>
          <span>{activeDays} active days</span>
        </div>
      </div>

      {/* Heatmap */}
      <div className="rounded-2xl border border-border bg-card p-3 sm:p-5 overflow-x-auto">
        <div className="flex gap-0.5 w-max mx-auto">
          <div className={`flex flex-col ${cellGap} mr-1.5 pt-[18px]`}>
            {['', 'Mon', '', 'Wed', '', 'Fri', ''].map((label, i) => (
              <span key={i} className={`${cellSize} flex items-center text-[9px] text-muted-foreground`}>{label}</span>
            ))}
          </div>

          <div>
            <div className="flex mb-0.5 h-[14px] relative" style={{ width: `${weeks.length * 15}px`, maxWidth: '100%' }}>
              {monthLabels.map((m, i) => (
                <span key={i} className="absolute text-[9px] font-bold text-muted-foreground" style={{ left: `${m.col * 15}px` }}>{m.label}</span>
              ))}
            </div>

            <div className={`flex ${cellGap}`}>
              {weeks.map((week, colIdx) => (
                <div key={colIdx} className={`flex flex-col ${cellGap}`}>
                  {week.map((day, rowIdx) => {
                    const data = dailyData[day.date]
                    const amount = data?.total ?? 0
                    const bg = heatColor(amount, maxDaily)
                    const inYear = day.date.startsWith(String(viewYear))

                    return (
                      <button
                        key={rowIdx}
                        type="button"
                        className={`${cellSize} rounded-sm transition-all hover:ring-1 hover:ring-primary/50 ${
                          !inYear ? 'opacity-25' : ''
                        } ${selectedDate === day.date ? 'ring-2 ring-foreground' : ''}`}
                        style={{ backgroundColor: inYear ? (amount > 0 ? bg : 'rgba(45,57,83,0.4)') : 'rgba(45,57,83,0.15)' }}
                        onClick={() => { if (!inYear) return; setSelectedDate(selectedDate === day.date ? null : day.date) }}
                        title={inYear && amount > 0 ? `${day.date}: ${money.formatDisplay(amount)}` : inYear ? day.date : ''}
                        aria-label={day.date}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-center gap-2 text-[10px] text-muted-foreground">
          <span>Less</span>
          {[0.1, 0.25, 0.45, 0.65, 0.85].map(r => (
            <span key={r} className="h-3 w-3 rounded-sm" style={{ backgroundColor: heatColor(r * maxDaily, maxDaily) }} />
          ))}
          <span>More</span>
        </div>
      </div>

      {/* Selected day */}
      {isDesktop && selectedDate && (
        <div className="mt-6">
          <DesktopDayPanel
            dateStr={selectedDate}
            onClose={() => setSelectedDate(null)}
            txs={selectedTxs}
            money={money}
            categories={categories}
          />
        </div>
      )}

      {!isDesktop && (
        <MobileDaySheet
          dateStr={selectedDate ?? ''}
          open={selectedDate !== null}
          onClose={() => setSelectedDate(null)}
          txs={selectedTxs}
          money={money}
          categories={categories}
        />
      )}
    </div>
  )
}

// ─── Main Calendar Page ──────────────────────────────────────────────────────

type CalendarTab = 'monthly' | 'yearly'

export function Calendar() {
  const [tab, setTab] = useState<CalendarTab>('monthly')

  return (
    <div>
      <PageHeader
        title="Calendar"
        subtitle="See your spending patterns across days, weeks, and months at a glance."
      />

      <Tabs value={tab} onValueChange={v => setTab(v as CalendarTab)} className="mb-6">
        <TabsList className="w-full max-w-sm">
          <TabsTrigger value="monthly" className="flex-1">Monthly</TabsTrigger>
          <TabsTrigger value="yearly" className="flex-1">Yearly</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === 'monthly' && <MonthlyCalendar />}
      {tab === 'yearly' && <YearlyHeatmap />}
    </div>
  )
}
