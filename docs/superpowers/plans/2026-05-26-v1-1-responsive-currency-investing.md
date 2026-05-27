# FinPath v1.1 — Responsive, Currency & Investing Upgrade

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the app fully responsive on mobile, add real exchange-rate currency conversion fetched on app open, make the Budget page editable inline, and add an editable portfolio allocation editor to the Investing page.

**Architecture:** A new `src/lib/currency.ts` provides `formatCurrency`, `useExchangeRates` (fetches once per session from a free CDN-hosted API), and `useCurrency` (hook that reads base + display currency from `app_settings`, fetches the rate, and returns a formatter). All pages call `useCurrency()` instead of their own hardcoded formatters. Mobile layout adds a `BottomNav` bar + `MoreSheet` drawer rendered in `AppLayout`; the sidebar hides on mobile. The Budget page gains an inline row-edit mode and an inline add-category form. The Investing page replaces its hardcoded allocation pills with a live `AllocationEditor` (donut + table) persisted as JSONB.

**Tech Stack:** Vite + React 18 + TypeScript + Tailwind CSS + shadcn/ui + TanStack Query v5 + Supabase + fawazahmed0 exchange-rate API (free, no key)

---

## File Map

| File | Action |
|---|---|
| `supabase/migrations/001_add_allocations.sql` | Create — adds `allocations` jsonb to `investment_config` |
| `supabase/migrations/002_add_base_currency.sql` | Create — adds `base_currency` text to `app_settings` |
| `src/types/index.ts` | Modify — add `AllocationItem`, extend `InvestmentConfig` + `AppSettings` |
| `src/lib/currency.ts` | Create — `formatCurrency`, `useExchangeRates`, `useCurrency` |
| `src/lib/currency.test.ts` | Create — tests for `formatCurrency` |
| `src/lib/stats.ts` | Modify — remove exported `formatCurrency` (superseded) |
| `src/lib/stats.test.ts` | Modify — remove `formatCurrency` tests |
| `src/lib/queries.ts` | Modify — add `useUpdateBudgetCategory` |
| `src/components/ui/sheet.tsx` | Create — via `npx shadcn@latest add sheet` |
| `src/components/layout/BottomNav.tsx` | Create — mobile bottom nav bar |
| `src/components/layout/MoreSheet.tsx` | Create — bottom sheet with extra nav + goal card |
| `src/components/layout/AppLayout.tsx` | Modify — add BottomNav + MoreSheet, add `pb-24` on mobile |
| `src/components/layout/Sidebar.tsx` | Modify — hide on mobile (`hidden lg:flex`) |
| `src/pages/Dashboard.tsx` | Modify — replace `formatWholeCurrency` with `useCurrency` |
| `src/pages/Transactions.tsx` | Modify — replace `formatWholeCurrency` with `useCurrency` |
| `src/pages/Estimation.tsx` | Modify — replace `formatRpShort`/`formatNumber` with `useCurrency` |
| `src/pages/Reports.tsx` | Modify — replace `formatCurrency` from stats with `useCurrency` |
| `src/pages/Budget.tsx` | Rewrite — currency + adaptive bars + inline editing |
| `src/components/investing/AllocationEditor.tsx` | Create — donut SVG + table editor |
| `src/pages/Investing.tsx` | Modify — use `useCurrency`, add `AllocationEditor` |

---

## Task 1: Supabase Migrations + TypeScript Types

**Files:**
- Create: `supabase/migrations/001_add_allocations.sql`
- Create: `supabase/migrations/002_add_base_currency.sql`
- Modify: `src/types/index.ts`

- [ ] **Step 1: Create migration files**

`supabase/migrations/001_add_allocations.sql`:
```sql
ALTER TABLE investment_config
ADD COLUMN IF NOT EXISTS allocations jsonb NOT NULL DEFAULT '[]'::jsonb;
```

`supabase/migrations/002_add_base_currency.sql`:
```sql
ALTER TABLE app_settings
ADD COLUMN IF NOT EXISTS base_currency text NOT NULL DEFAULT 'IDR';
```

- [ ] **Step 2: Run both migrations in Supabase SQL Editor**

Open your Supabase project → SQL Editor → run each file in order.
Expected: no error, columns appear in table schema.

- [ ] **Step 3: Update `src/types/index.ts`**

Replace the entire file with:

```ts
export interface Transaction {
  id: string
  description: string
  amount: number
  type: 'income' | 'expense' | 'recurring'
  category: string
  date: string
  needs_review: boolean
  created_at?: string
}

export interface BudgetCategory {
  id: string
  name: string
  yearly_allocated: number
  color: string
  created_at?: string
}

export interface BudgetRule {
  id: string
  name: string
  category: string
  rule_type: 'cap' | 'minimum' | 'flexible' | 'emergency_months'
  value: number
  created_at?: string
}

export interface AllocationItem {
  name: string
  pct: number
  color: string
}

export interface InvestmentConfig {
  id: string
  monthly_contribution: number
  return_rate: number
  duration_years: number
  current_value: number
  allocations: AllocationItem[]
  created_at?: string
}

export interface EstimationPlan {
  id: string
  month: number
  year: number
  estimated_income: number
  fixed_expenses: number
  variable_estimate: number
  currency: string
  notes?: string
  created_at?: string
}

export interface AppSettings {
  id: string
  user_name: string
  email: string
  theme: string
  currency: string
  base_currency: string
  year_start: string
  default_view: string
  notifications: string
  annual_goal_label: string
  annual_goal_pct: number
  created_at?: string
}
```

- [ ] **Step 4: Verify TypeScript still compiles**

```
npx tsc --noEmit
```
Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/ src/types/index.ts
git commit -m "feat: add allocations + base_currency migrations and update types"
```

---

## Task 2: Currency Library + Tests

**Files:**
- Create: `src/lib/currency.ts`
- Create: `src/lib/currency.test.ts`
- Modify: `src/lib/stats.ts` (remove exported `formatCurrency`)
- Modify: `src/lib/stats.test.ts` (remove `formatCurrency` tests)

- [ ] **Step 1: Write failing tests in `src/lib/currency.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { formatCurrency } from './currency'

describe('formatCurrency', () => {
  it('formats IDR with Rp prefix and no decimals', () => {
    expect(formatCurrency(84250000, 'IDR')).toBe('Rp 84,250,000')
  })

  it('formats USD with $ symbol and 2 decimals', () => {
    expect(formatCurrency(84250, 'USD')).toBe('$84,250.00')
  })

  it('formats zero for IDR', () => {
    expect(formatCurrency(0, 'IDR')).toBe('Rp 0')
  })

  it('formats zero for USD', () => {
    expect(formatCurrency(0, 'USD')).toBe('$0.00')
  })

  it('never contains the string "IDR"', () => {
    expect(formatCurrency(1000000, 'IDR')).not.toContain('IDR')
  })
})
```

Note: ` ` is a non-breaking space — `Intl.NumberFormat` uses it between the currency symbol and number in some locales. Run the test first to confirm the exact format on your machine; adjust the expected strings if needed.

- [ ] **Step 2: Run tests — expect FAIL**

```
npx vitest run src/lib/currency.test.ts
```
Expected: FAIL — `formatCurrency` not found.

- [ ] **Step 3: Create `src/lib/currency.ts`**

```ts
import { useQuery } from '@tanstack/react-query'
import { useAppSettings } from './queries'

export function formatCurrency(amount: number, currency: string): string {
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'IDR' ? 0 : 2,
    minimumFractionDigits: currency === 'IDR' ? 0 : 2,
  }).format(amount)
  return formatted.replace('IDR', 'Rp')
}

export function useExchangeRates(baseCurrency: string) {
  return useQuery({
    queryKey: ['exchange_rates', baseCurrency],
    queryFn: async () => {
      const base = baseCurrency.toLowerCase()
      const res = await fetch(
        `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${base}.json`
      )
      if (!res.ok) throw new Error('Exchange rate fetch failed')
      const data = (await res.json()) as Record<string, unknown>
      return data[base] as Record<string, number>
    },
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 2,
  })
}

export function useCurrency() {
  const { data: settings } = useAppSettings()
  const baseCurrency = settings?.base_currency ?? 'IDR'
  const displayCurrency = settings?.currency ?? 'IDR'
  const { data: rates = {} } = useExchangeRates(baseCurrency)

  return (amount: number) => {
    if (baseCurrency === displayCurrency) {
      return formatCurrency(amount, displayCurrency)
    }
    const rate = rates[displayCurrency.toLowerCase()] ?? 1
    return formatCurrency(amount * rate, displayCurrency)
  }
}
```

- [ ] **Step 4: Run tests — expect PASS**

```
npx vitest run src/lib/currency.test.ts
```
Expected: 5 passed. If the ` ` assertion fails, run the test once and copy the actual output to fix the expected string.

- [ ] **Step 5: Remove `formatCurrency` from `src/lib/stats.ts`**

Replace entire file with:

```ts
export function calculateSavingsRate(totalIncome: number, totalExpenses: number): number {
  if (totalIncome === 0) return 0
  const rate = (totalIncome - totalExpenses) / totalIncome * 100
  return Math.max(0, Math.round(rate * 10) / 10)
}
```

- [ ] **Step 6: Remove `formatCurrency` tests from `src/lib/stats.test.ts`**

Replace entire file with:

```ts
import { describe, it, expect } from 'vitest'
import { calculateSavingsRate } from './stats'

describe('calculateSavingsRate', () => {
  it('returns 0 for zero income', () => {
    expect(calculateSavingsRate(0, 1000)).toBe(0)
  })
  it('returns 0 when expenses exceed income', () => {
    expect(calculateSavingsRate(100, 200)).toBe(0)
  })
  it('calculates 28.4% rate correctly', () => {
    expect(calculateSavingsRate(10000, 7160)).toBe(28.4)
  })
})
```

- [ ] **Step 7: Run all tests — expect PASS**

```
npx vitest run
```
Expected: all tests pass. If `Reports.tsx` or any page still imports `formatCurrency` from `stats`, fix those imports now (they'll be fully replaced in Tasks 5–7).

- [ ] **Step 8: Commit**

```bash
git add src/lib/currency.ts src/lib/currency.test.ts src/lib/stats.ts src/lib/stats.test.ts
git commit -m "feat: add currency library with exchange rate hook, remove legacy formatter"
```

---

## Task 3: `useUpdateBudgetCategory` Query

**Files:**
- Modify: `src/lib/queries.ts`

- [ ] **Step 1: Add mutation after `useDeleteBudgetCategory` in `src/lib/queries.ts`**

Find the block ending with `useDeleteBudgetCategory` (around line 90) and add this immediately after:

```ts
export function useUpdateBudgetCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, yearly_allocated, color }: Pick<BudgetCategory, 'id' | 'yearly_allocated' | 'color'>) => {
      const { error } = await supabase
        .from('budget_categories')
        .update({ yearly_allocated, color })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budget_categories'] }),
  })
}
```

- [ ] **Step 2: Verify TypeScript**

```
npx tsc --noEmit
```
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/queries.ts
git commit -m "feat: add useUpdateBudgetCategory mutation"
```

---

## Task 4: Mobile Layout (shadcn Sheet + BottomNav + MoreSheet + AppLayout + Sidebar)

**Files:**
- Create: `src/components/ui/sheet.tsx` (via CLI)
- Create: `src/components/layout/BottomNav.tsx`
- Create: `src/components/layout/MoreSheet.tsx`
- Modify: `src/components/layout/AppLayout.tsx`
- Modify: `src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Install shadcn Sheet component**

```
npx shadcn@latest add sheet
```
Expected: `src/components/ui/sheet.tsx` created. Accept any prompts.

- [ ] **Step 2: Create `src/components/layout/BottomNav.tsx`**

```tsx
import { NavLink } from 'react-router-dom'
import { LayoutDashboard, ArrowLeftRight, PieChart, TrendingUp, MoreHorizontal } from 'lucide-react'

const NAV = [
  { to: '/', label: 'Home', Icon: LayoutDashboard },
  { to: '/transactions', label: 'Txns', Icon: ArrowLeftRight },
  { to: '/budget', label: 'Budget', Icon: PieChart },
  { to: '/investing', label: 'Invest', Icon: TrendingUp },
]

interface BottomNavProps {
  onMoreClick: () => void
  moreActive: boolean
}

export function BottomNav({ onMoreClick, moreActive }: BottomNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-16 items-center border-t border-border bg-background lg:hidden">
      {NAV.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] font-bold transition-colors ${
              isActive ? 'text-primary' : 'text-muted-foreground'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <Icon className={`h-5 w-5 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
              {label}
            </>
          )}
        </NavLink>
      ))}
      <button
        onClick={onMoreClick}
        className={`flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] font-bold transition-colors ${
          moreActive ? 'text-primary' : 'text-muted-foreground'
        }`}
      >
        <MoreHorizontal className={`h-5 w-5 ${moreActive ? 'text-primary' : 'text-muted-foreground'}`} />
        More
      </button>
    </nav>
  )
}
```

- [ ] **Step 3: Create `src/components/layout/MoreSheet.tsx`**

```tsx
import { useNavigate } from 'react-router-dom'
import { BarChart2, Calculator, Settings, X } from 'lucide-react'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { useAppSettings } from '@/lib/queries'

const MORE_NAV = [
  { to: '/estimation', label: 'Estimation', Icon: Calculator },
  { to: '/reports', label: 'Reports', Icon: BarChart2 },
  { to: '/settings', label: 'Settings', Icon: Settings },
]

interface MoreSheetProps {
  open: boolean
  onClose: () => void
}

export function MoreSheet({ open, onClose }: MoreSheetProps) {
  const { data: settings } = useAppSettings()
  const navigate = useNavigate()
  const goalLabel = settings?.annual_goal_label ?? 'No goal set'
  const goalPct = Math.min(100, Math.max(0, settings?.annual_goal_pct ?? 0))

  const handleNav = (to: string) => {
    navigate(to)
    onClose()
  }

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="bottom" className="rounded-t-2xl border-border bg-background pb-8">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-foreground">More</h2>
          <button onClick={onClose} className="text-muted-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mb-6 flex flex-col gap-2">
          {MORE_NAV.map(({ to, label, Icon }) => (
            <button
              key={to}
              onClick={() => handleNav(to)}
              className="flex items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-bold text-foreground hover:bg-secondary"
            >
              <Icon className="h-5 w-5 text-primary" />
              {label}
            </button>
          ))}
        </div>
        <div className="rounded-2xl border border-border bg-card px-5 py-5">
          <p className="text-xs text-muted-foreground">2026 goal</p>
          <p className="mt-2 text-xl font-extrabold text-foreground">{goalLabel}</p>
          <p className="mt-1 text-sm text-primary">{goalPct}% completed</p>
          <div className="mt-3 h-2 rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${goalPct}%` }} />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
```

- [ ] **Step 4: Update `src/components/layout/AppLayout.tsx`**

Replace entire file with:

```tsx
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
```

- [ ] **Step 5: Hide sidebar on mobile in `src/components/layout/Sidebar.tsx`**

Change the `<aside>` opening className from:
```
"relative z-10 mx-4 mt-4 flex w-[calc(100%-2rem)] flex-col ..."
```
to:
```
"relative z-10 mx-4 mt-4 hidden w-[calc(100%-2rem)] flex-col ..."
```
and add `lg:flex` where the fixed positioning kicks in. The full updated className string:

```tsx
<aside className="relative z-10 mx-4 mt-4 hidden w-[calc(100%-2rem)] flex-col rounded-[1.7rem] border border-border bg-background/78 px-6 py-6 lg:fixed lg:flex lg:left-10 lg:top-8 lg:m-0 lg:h-[calc(100vh-4rem)] lg:w-[250px] lg:py-8">
```

- [ ] **Step 6: Verify TypeScript**

```
npx tsc --noEmit
```
Expected: zero errors.

- [ ] **Step 7: Run dev server and resize browser below 1024px**

```
npm run dev
```
Expected on mobile width: sidebar gone, bottom nav bar visible with Home/Txns/Budget/Invest/More tabs. Tapping "More" opens the bottom sheet. Tapping any sheet link closes it and navigates.

- [ ] **Step 8: Commit**

```bash
git add src/components/
git commit -m "feat: add mobile bottom nav, MoreSheet, and responsive AppLayout"
```

---

## Task 5: Apply `useCurrency` to Dashboard, Transactions, Estimation, Reports

**Files:**
- Modify: `src/pages/Dashboard.tsx`
- Modify: `src/pages/Transactions.tsx`
- Modify: `src/pages/Estimation.tsx`
- Modify: `src/pages/Reports.tsx`

- [ ] **Step 1: Update `src/pages/Dashboard.tsx`**

Replace the entire file with:

```tsx
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useTransactions, useInvestmentConfig, useBudgetCategories } from '@/lib/queries'
import { StatCard } from '@/components/shared/StatCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { calculateSavingsRate } from '@/lib/stats'
import { useCurrency } from '@/lib/currency'

export function Dashboard() {
  const fmt = useCurrency()
  const { data: transactions = [] } = useTransactions()
  const { data: investConfig } = useInvestmentConfig()
  const { data: categories = [] } = useBudgetCategories()

  const year = new Date().getFullYear()
  const yearTx = transactions.filter(t => t.date.startsWith(String(year)))

  const totalIncome = useMemo(
    () => yearTx.filter(t => t.type === 'income').reduce((sum, tx) => sum + tx.amount, 0),
    [yearTx]
  )
  const totalExpenses = useMemo(
    () => yearTx.filter(t => t.type !== 'income').reduce((sum, tx) => sum + tx.amount, 0),
    [yearTx]
  )
  const balance = totalIncome - totalExpenses
  const savingsRate = calculateSavingsRate(totalIncome, totalExpenses)
  const invested = investConfig?.current_value ?? 0
  const monthlyContribution = investConfig?.monthly_contribution ?? 0

  const spendingByCategory = useMemo(() => {
    const map: Record<string, number> = {}
    yearTx.filter(t => t.type !== 'income').forEach(t => {
      map[t.category] = (map[t.category] || 0) + t.amount
    })
    return Object.entries(map).map(([name, amount]) => ({
      name,
      amount,
      color: categories.find(c => c.name === name)?.color ?? '#A9F5C7',
    }))
  }, [yearTx, categories])

  const topSpending = spendingByCategory.reduce(
    (top, item) => item.amount > top.amount ? item : top,
    { name: '', amount: 0, color: '#2D3953' }
  )
  const categoryRows = categories
    .filter(category => category.yearly_allocated > 0)
    .slice(0, 3)
    .map(category => {
      const spent = yearTx
        .filter(tx => tx.type !== 'income' && tx.category === category.name)
        .reduce((sum, tx) => sum + tx.amount, 0)
      const pct = category.yearly_allocated > 0 ? Math.min(100, Math.round((spent / category.yearly_allocated) * 100)) : 0
      return { ...category, spent, pct }
    })

  return (
    <div>
      <PageHeader
        title="Good morning, Rayhan"
        subtitle="Your yearly spending health, savings momentum, and investment progress."
      />
      <div className="mb-9 grid grid-cols-2 gap-6 lg:grid-cols-4">
        <StatCard label="Total balance" value={fmt(balance)} sub={`${savingsRate}% savings rate`} badgeVariant="success" />
        <StatCard label="Spent YTD" value={fmt(totalExpenses)} sub={`${yearTx.length} transactions`} badgeVariant="warning" />
        <StatCard label="Saved" value={fmt(balance)} sub={`${savingsRate}% savings rate`} />
        <StatCard label="Invested" value={fmt(invested)} sub={invested > 0 ? 'Investment plan active' : 'No investment value yet'} badgeVariant="danger" />
      </div>
      <div className="mb-10 grid grid-cols-1 gap-8 lg:grid-cols-[1.45fr_0.8fr]">
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-base text-primary">Investment path</CardTitle>
          </CardHeader>
          <CardContent className="p-8 pt-5">
            <p className="max-w-lg text-[2.75rem] font-extrabold leading-[0.98] text-foreground">
              Turn leftovers into future capital.
            </p>
            <p className="mt-5 max-w-lg text-sm leading-5 text-muted-foreground">
              {monthlyContribution > 0
                ? `Your current plan is ${fmt(monthlyContribution)}/month.`
                : 'Add a monthly contribution in Investing to start projecting your path.'}
            </p>
            <div className="mt-11 flex gap-3">
              <Button asChild><Link to="/investing">Open planner</Link></Button>
              <Button asChild variant="secondary"><Link to="/investing">Adjust risk</Link></Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Spending overview</CardTitle>
          </CardHeader>
          <CardContent className="px-8 pb-6">
            <div className="flex h-[170px] items-end justify-between gap-3">
              {(spendingByCategory.length > 0 ? spendingByCategory : Array.from({ length: 6 }, (_, index) => ({
                name: `empty-${index}`,
                amount: 0,
                color: '#2D3953',
              }))).map(entry => (
                <div
                  key={entry.name}
                  className="w-5 rounded-full"
                  style={{
                    height: `${spendingByCategory.length > 0 ? Math.max(36, (entry.amount / Math.max(topSpending.amount, 1)) * 150) : 36}px`,
                    backgroundColor: entry.color,
                  }}
                />
              ))}
            </div>
            <p className="mt-[-4px] text-[1.7rem] font-extrabold leading-none text-foreground">
              {topSpending.amount > 0 ? `${fmt(topSpending.amount)} ${topSpending.name}` : fmt(0) + ' category'}
            </p>
          </CardContent>
        </Card>
      </div>
      <div className="grid grid-cols-1 gap-7 lg:grid-cols-[1fr_1.1fr]">
        <Card>
          <CardHeader><CardTitle className="text-xl">Budget categories</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {categoryRows.length > 0 ? categoryRows.map(category => (
              <div key={category.id} className="grid grid-cols-[1fr_100px_102px] items-center gap-4 text-sm">
                <span className="text-muted-foreground">{category.name}</span>
                <span className="font-bold text-foreground">{fmt(category.spent)}</span>
                <span className="h-2 rounded-full bg-muted">
                  <span className="block h-full rounded-full" style={{ width: `${category.pct}%`, backgroundColor: category.color }} />
                </span>
              </div>
            )) : (
              <p className="text-sm text-muted-foreground">No budget categories yet.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-xl">Smart insight</CardTitle></CardHeader>
          <CardContent>
            <p className="max-w-lg text-sm leading-5 text-muted-foreground">
              {topSpending.amount > 0
                ? `${topSpending.name} is currently your largest spending category this year.`
                : 'No spending insight yet. Add transactions to generate one.'}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update `src/pages/Transactions.tsx`**

Remove the `formatWholeCurrency` local function (lines 15–16) and add the `useCurrency` import + hook call. Replace lines 1–16 with:

```tsx
import { useState } from 'react'
import { useTransactions, useDeleteTransaction, useMarkReviewed, useAddTransaction, useBudgetCategories } from '@/lib/queries'
import { PageHeader } from '@/components/shared/PageHeader'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Trash2, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'
import { useCurrency } from '@/lib/currency'

type Filter = 'all' | 'income' | 'expense' | 'recurring' | 'needs_review'
```

Then add `const fmt = useCurrency()` as the first line inside the `Transactions` function body.

Replace all three occurrences of `formatWholeCurrency(` with `fmt(`:
- Line ~73: `formatWholeCurrency(moneyIn)` → `fmt(moneyIn)`
- Line ~74: `formatWholeCurrency(moneyOut)` → `fmt(moneyOut)`
- Line ~131: `formatWholeCurrency(tx.amount)` → `fmt(tx.amount)`

- [ ] **Step 3: Update `src/pages/Estimation.tsx`**

Replace the entire file with:

```tsx
import { useMemo, useState } from 'react'
import { useEstimationPlans, useUpsertEstimationPlan } from '@/lib/queries'
import { StatCard } from '@/components/shared/StatCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { calculateSavingsRate } from '@/lib/stats'
import { useCurrency } from '@/lib/currency'
import { toast } from 'sonner'

type EstimateItem = {
  id: string
  name: string
  amount: number
}

const parseNumber = (value: string) => {
  const parsed = Number(value.replace(/[^\d.]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

export function Estimation() {
  const fmt = useCurrency()
  const { data: plans = [] } = useEstimationPlans()
  const upsert = useUpsertEstimationPlan()

  const [view, setView] = useState<'monthly' | 'yearly'>('monthly')
  const [currency, setCurrency] = useState('IDR')
  const [incomeItems, setIncomeItems] = useState<EstimateItem[]>([])
  const [expenseItems, setExpenseItems] = useState<EstimateItem[]>([])
  const [incomeSource, setIncomeSource] = useState('')
  const [incomeAmount, setIncomeAmount] = useState('')
  const [expenseDetail, setExpenseDetail] = useState('')
  const [expenseAmount, setExpenseAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [wishlist, setWishlist] = useState('')

  const income = useMemo(() => incomeItems.reduce((sum, item) => sum + item.amount, 0), [incomeItems])
  const expenses = useMemo(() => expenseItems.reduce((sum, item) => sum + item.amount, 0), [expenseItems])
  const multiplier = view === 'yearly' ? 12 : 1
  const saving = income - expenses
  const savingsRate = calculateSavingsRate(income, expenses)
  const latestPlan = plans[0]

  const addIncome = () => {
    const amount = parseNumber(incomeAmount)
    if (!incomeSource.trim() || amount <= 0) return
    setIncomeItems(current => [...current, { id: crypto.randomUUID(), name: incomeSource.trim(), amount }])
    setIncomeSource('')
    setIncomeAmount('')
  }

  const addExpense = () => {
    const amount = parseNumber(expenseAmount)
    if (!expenseDetail.trim() || amount <= 0) return
    setExpenseItems(current => [...current, { id: crypto.randomUUID(), name: expenseDetail.trim(), amount }])
    setExpenseDetail('')
    setExpenseAmount('')
  }

  const handleSave = async () => {
    await upsert.mutateAsync({
      month: new Date().getMonth() + 1,
      year: new Date().getFullYear(),
      estimated_income: income,
      fixed_expenses: expenses,
      variable_estimate: 0,
      currency,
      notes: [
        notes,
        incomeItems.length ? `Income: ${incomeItems.map(item => `${item.name} ${fmt(item.amount)}`).join(', ')}` : '',
        expenseItems.length ? `Expenses: ${expenseItems.map(item => `${item.name} ${fmt(item.amount)}`).join(', ')}` : '',
      ].filter(Boolean).join('\n'),
    })
    toast.success('Estimation plan saved')
  }

  return (
    <div>
      <PageHeader
        title="Estimation planner"
        subtitle="Plan future months one item at a time: income sources, expected expenses, notes, and wishlist."
        action={(
          <div className="flex h-11 items-center gap-5 rounded-full border border-border bg-secondary px-6 text-sm">
            <span className="text-muted-foreground">Main currency</span>
            <input
              aria-label="Main currency"
              className="w-14 bg-transparent font-extrabold text-primary outline-none"
              value={currency}
              onChange={event => setCurrency(event.target.value.toUpperCase())}
            />
          </div>
        )}
      />
      <div className="mb-6 flex gap-3">
        {(['monthly', 'yearly'] as const).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`h-10 min-w-24 rounded-full px-6 text-sm capitalize transition-colors ${
              view === v ? 'bg-primary text-primary-foreground' : 'border border-border bg-secondary text-muted-foreground'
            }`}
          >
            {v}
          </button>
        ))}
      </div>
      <div className="mb-8 grid grid-cols-2 gap-6 lg:grid-cols-4">
        <StatCard label="Estimated income" value={fmt(income * multiplier)} sub={`${incomeItems.length} income items`} badgeVariant="success" />
        <StatCard label="Planned expenses" value={fmt(expenses * multiplier)} sub={`${expenseItems.length} expense items`} badgeVariant="warning" />
        <StatCard label="Possible saving" value={fmt(saving * multiplier)} sub={`${savingsRate}% saving rate`} />
        <StatCard label="Latest saved" value={fmt(latestPlan?.estimated_income ?? 0)} sub="Saved income estimate" />
      </div>
      <div className="mb-6 grid grid-cols-1 gap-7 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-xl">Income sources</CardTitle>
            <p className="text-sm text-muted-foreground">Add where money is expected to come from.</p>
          </CardHeader>
          <CardContent className="space-y-4 p-6">
            <div className="grid grid-cols-[1fr_0.65fr_auto] items-end gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Income source</Label>
                <Input aria-label="Income source" className="mt-2 bg-secondary" value={incomeSource} onChange={event => setIncomeSource(event.target.value)} placeholder="Part-time work" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Income amount</Label>
                <Input aria-label="Income amount" className="mt-2 bg-secondary" inputMode="decimal" value={incomeAmount} onChange={event => setIncomeAmount(event.target.value)} placeholder="0" />
              </div>
              <Button onClick={addIncome}>Add</Button>
            </div>
            <ItemList items={incomeItems} empty="No income sources yet." fmt={fmt} onDelete={id => setIncomeItems(current => current.filter(item => item.id !== id))} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-xl">Expected expenses</CardTitle>
            <p className="text-sm text-muted-foreground">Add rent, bills, subscriptions, food, trips, and other planned costs.</p>
          </CardHeader>
          <CardContent className="space-y-4 p-6">
            <div className="grid grid-cols-[1fr_0.65fr_auto] items-end gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Expense detail</Label>
                <Input aria-label="Expense detail" className="mt-2 bg-secondary" value={expenseDetail} onChange={event => setExpenseDetail(event.target.value)} placeholder="Apartment rent" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Expense amount</Label>
                <Input aria-label="Expense amount" className="mt-2 bg-secondary" inputMode="decimal" value={expenseAmount} onChange={event => setExpenseAmount(event.target.value)} placeholder="0" />
              </div>
              <Button onClick={addExpense}>Add</Button>
            </div>
            <ItemList items={expenseItems} empty="No expected expenses yet." fmt={fmt} onDelete={id => setExpenseItems(current => current.filter(item => item.id !== id))} />
          </CardContent>
        </Card>
      </div>
      <div className="mb-6 grid grid-cols-1 gap-4 rounded-[1.4rem] border border-border bg-card p-6 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
        <div>
          <Label className="text-xs text-muted-foreground">Notes</Label>
          <Input aria-label="Notes" className="mt-2 bg-secondary" value={notes} onChange={event => setNotes(event.target.value)} placeholder="Optional notes" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Wanted item list</Label>
          <Input aria-label="Wanted item list" className="mt-2 bg-secondary" value={wishlist} onChange={event => setWishlist(event.target.value)} placeholder="Add wanted items" />
        </div>
        <Button onClick={handleSave} disabled={upsert.isPending}>
          {upsert.isPending ? 'Saving...' : 'Save plan'}
        </Button>
      </div>
    </div>
  )
}

function ItemList({ items, empty, fmt, onDelete }: {
  items: { id: string; name: string; amount: number }[]
  empty: string
  fmt: (amount: number) => string
  onDelete: (id: string) => void
}) {
  if (items.length === 0) return <p className="rounded-2xl border border-border bg-secondary p-4 text-sm text-muted-foreground">{empty}</p>

  return (
    <div className="space-y-2">
      {items.map(item => (
        <div key={item.id} className="flex items-center justify-between rounded-2xl border border-border bg-secondary px-4 py-3">
          <div>
            <p className="font-bold text-foreground">{item.name}</p>
            <p className="text-xs text-muted-foreground">{fmt(item.amount)}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-extrabold text-foreground">{fmt(item.amount)}</span>
            <button className="text-sm text-muted-foreground hover:text-foreground" onClick={() => onDelete(item.id)}>Remove</button>
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Update `src/pages/Reports.tsx`**

Replace the entire file with:

```tsx
import { useMemo, useState } from 'react'
import { useTransactions } from '@/lib/queries'
import { StatCard } from '@/components/shared/StatCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { calculateSavingsRate } from '@/lib/stats'
import { useCurrency } from '@/lib/currency'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function Reports() {
  const fmt = useCurrency()
  const { data: transactions = [] } = useTransactions()
  const [openInsight, setOpenInsight] = useState<string | null>(null)

  const year = new Date().getFullYear()
  const yearTx = transactions.filter(t => t.date.startsWith(String(year)))
  const hasData = yearTx.length > 0

  const totalIncome = yearTx.filter(t => t.type === 'income').reduce((sum, tx) => sum + tx.amount, 0)
  const totalExpenses = yearTx.filter(t => t.type !== 'income').reduce((sum, tx) => sum + tx.amount, 0)
  const savingsRate = calculateSavingsRate(totalIncome, totalExpenses)
  const avgMonthlySpend = Math.round(totalExpenses / 12)

  const categoryTotals = useMemo(() => {
    const map: Record<string, number> = {}
    yearTx.filter(t => t.type !== 'income').forEach(t => {
      map[t.category] = (map[t.category] || 0) + t.amount
    })
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [yearTx])
  const topCategory = categoryTotals[0]?.[0] ?? ''

  const monthlyData = MONTHS.map((name, index) => {
    const amount = yearTx
      .filter(tx => tx.type !== 'income' && new Date(tx.date).getMonth() === index)
      .reduce((sum, tx) => sum + tx.amount, 0)
    return { name, amount }
  })
  const maxMonthlySpend = Math.max(...monthlyData.map(month => month.amount), 1)

  const insights = [
    {
      id: 'monthly',
      title: 'Monthly summary',
      badge: hasData ? `${yearTx.length} transactions` : 'No data yet',
      detail: hasData ? `Total spending this year is ${fmt(totalExpenses)}.` : 'Add transactions to generate a monthly summary.',
    },
    {
      id: 'category',
      title: 'Top category',
      badge: topCategory || 'Empty',
      detail: topCategory ? `${topCategory} is currently the largest expense category.` : 'No expense categories found yet.',
    },
    {
      id: 'saving',
      title: 'Savings review',
      badge: `${savingsRate}% rate`,
      detail: hasData ? `Current savings rate is ${savingsRate}%.` : 'No income or expense data yet.',
    },
  ]

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Understand patterns with annual summaries, exportable charts, and personal insights."
      />
      <div className="mb-11 grid grid-cols-1 gap-6 sm:grid-cols-3">
        <StatCard label="Savings rate" value={`${savingsRate}%`} sub={hasData ? 'Based on current year' : 'No data yet'} badgeVariant="success" />
        <StatCard label="Avg. spend" value={fmt(avgMonthlySpend)} sub="Monthly average" />
        <StatCard label="Top category" value={topCategory || 'Empty'} sub={hasData ? 'Highest expense category' : 'No spending yet'} badgeVariant="warning" />
      </div>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.45fr_0.8fr]">
        <Card>
          <CardHeader><CardTitle className="text-xl">Annual spending trend</CardTitle></CardHeader>
          <CardContent className="flex h-[332px] items-end gap-8 px-9 pb-11">
            {monthlyData.map((month, index) => (
              <div
                key={month.name}
                className={`w-5 rounded-full ${index === new Date().getMonth() ? 'bg-[#93C5FD]' : 'bg-muted'}`}
                style={{ height: `${hasData ? Math.max(22, (month.amount / maxMonthlySpend) * 100) : 22}%` }}
                title={`${month.name}: ${fmt(month.amount)}`}
              />
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-xl">Insights library</CardTitle></CardHeader>
          <CardContent className="space-y-8 px-8">
            {insights.map(insight => (
              <div key={insight.id}>
                <div className="flex items-center justify-between gap-4">
                  <button className="text-left" onClick={() => setOpenInsight(openInsight === insight.id ? null : insight.id)}>
                    <p className="font-bold text-foreground">{insight.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{insight.badge}</p>
                  </button>
                  <button
                    className="rounded-full border border-border px-4 py-1 text-xs text-muted-foreground"
                    onClick={() => setOpenInsight(openInsight === insight.id ? null : insight.id)}
                  >
                    Open
                  </button>
                </div>
                {openInsight === insight.id && <p className="mt-3 text-sm text-muted-foreground">{insight.detail}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Verify TypeScript and tests**

```
npx tsc --noEmit && npx vitest run
```
Expected: zero TypeScript errors, all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Dashboard.tsx src/pages/Transactions.tsx src/pages/Estimation.tsx src/pages/Reports.tsx
git commit -m "feat: apply useCurrency hook to Dashboard, Transactions, Estimation, Reports"
```

---

## Task 6: Budget Page — Currency + Display + Inline Editing

**Files:**
- Modify: `src/pages/Budget.tsx` (full rewrite)

- [ ] **Step 1: Replace `src/pages/Budget.tsx` entirely**

```tsx
import { useMemo, useState } from 'react'
import {
  useBudgetCategories,
  useBudgetRules,
  useTransactions,
  useUpdateBudgetCategory,
  useAddBudgetCategory,
  useDeleteBudgetCategory,
} from '@/lib/queries'
import { StatCard } from '@/components/shared/StatCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getOverspendRisk, getCategoryUsedPct } from '@/lib/budget'
import { useCurrency } from '@/lib/currency'
import { toast } from 'sonner'
import type { RiskLevel } from '@/lib/budget'

const ruleColors: Record<string, string> = {
  cap: '#A9F5C7',
  minimum: '#93C5FD',
  flexible: '#C4AEFF',
  emergency_months: '#FFD276',
}

const riskVariant: Record<RiskLevel, 'success' | 'warning' | 'danger'> = {
  Low: 'success', Medium: 'warning', High: 'danger',
}

function getBarColor(pct: number, catColor: string): string {
  if (pct >= 90) return '#ef4444'
  if (pct >= 70) return '#f59e0b'
  return catColor
}

function ColorBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-3 overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full transition-all duration-300"
        style={{ width: `${Math.min(100, value)}%`, background: color }}
      />
    </div>
  )
}

export function Budget() {
  const fmt = useCurrency()
  const { data: categories = [] } = useBudgetCategories()
  const { data: rules = [] } = useBudgetRules()
  const { data: transactions = [] } = useTransactions()
  const updateCategory = useUpdateBudgetCategory()
  const addCategory = useAddBudgetCategory()
  const deleteCategory = useDeleteBudgetCategory()

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<{ yearly_allocated: number; color: string }>({
    yearly_allocated: 0,
    color: '#6c63ff',
  })

  // Add category state
  const [showAdd, setShowAdd] = useState(false)
  const [addName, setAddName] = useState('')
  const [addAmount, setAddAmount] = useState('')
  const [addColor, setAddColor] = useState('#6c63ff')

  const year = new Date().getFullYear()
  const yearExpenses = transactions.filter(
    t => t.type !== 'income' && t.date.startsWith(String(year))
  )

  const totalAllocated = useMemo(() => categories.reduce((s, c) => s + c.yearly_allocated, 0), [categories])
  const totalSpent = useMemo(() => yearExpenses.reduce((s, t) => s + t.amount, 0), [yearExpenses])
  const remaining = totalAllocated - totalSpent
  const risk = totalAllocated > 0 ? getOverspendRisk(remaining, totalAllocated) : 'Low'
  const hasData = categories.length > 0

  const categoriesWithSpent = useMemo(() =>
    categories.map(cat => ({
      ...cat,
      spent: yearExpenses
        .filter(t => t.category === cat.name)
        .reduce((s, t) => s + t.amount, 0),
    })),
    [categories, yearExpenses]
  )

  const startEdit = (id: string, yearly_allocated: number, color: string) => {
    setEditingId(id)
    setEditDraft({ yearly_allocated, color })
  }

  const cancelEdit = () => setEditingId(null)

  const saveEdit = async () => {
    if (!editingId) return
    await updateCategory.mutateAsync({ id: editingId, ...editDraft })
    setEditingId(null)
    toast.success('Category updated')
  }

  const handleAdd = async () => {
    const amount = Number(addAmount.replace(/[^\d.]/g, ''))
    if (!addName.trim() || !Number.isFinite(amount) || amount <= 0) return
    await addCategory.mutateAsync({ name: addName.trim(), yearly_allocated: amount, color: addColor })
    setAddName('')
    setAddAmount('')
    setAddColor('#6c63ff')
    setShowAdd(false)
    toast.success('Category added')
  }

  const handleDelete = async (id: string) => {
    await deleteCategory.mutateAsync(id)
    toast.success('Category removed')
  }

  return (
    <div>
      <PageHeader
        title="Budget"
        subtitle="Design your yearly plan, control monthly limits, and see what is safe to spend."
      />
      <div className="mb-11 grid grid-cols-1 gap-6 sm:grid-cols-3">
        <StatCard label="Yearly budget" value={fmt(totalAllocated)} sub="Allocated across categories" />
        <StatCard label="Remaining" value={fmt(hasData ? remaining : 0)} sub="Safe to spend this year" badgeVariant="success" />
        <StatCard label="Overspend risk" value={hasData ? risk : 'None'} sub={hasData ? 'Based on current spending' : 'No categories yet'} badgeVariant={riskVariant[risk]} />
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.45fr_0.8fr]">
        <Card>
          <CardHeader><CardTitle className="text-xl">Category allocation</CardTitle></CardHeader>
          <CardContent className="space-y-4 px-8 pb-8">
            {categoriesWithSpent.length > 0 ? categoriesWithSpent.map(cat => {
              const pct = getCategoryUsedPct(cat.spent, cat.yearly_allocated)
              const barColor = getBarColor(pct, cat.color)
              const isEditing = editingId === cat.id

              if (isEditing) {
                return (
                  <div key={cat.id} className="rounded-xl border border-primary/30 bg-card p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-foreground">{cat.name}</span>
                      <div className="flex gap-2">
                        <Button size="sm" className="h-7 px-3 text-xs" onClick={saveEdit} disabled={updateCategory.isPending}>
                          ✓ Save
                        </Button>
                        <Button size="sm" variant="secondary" className="h-7 px-3 text-xs" onClick={cancelEdit}>
                          ✗
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
                      <div>
                        <p className="mb-1 text-xs text-muted-foreground">Yearly budget</p>
                        <Input
                          aria-label="Yearly budget"
                          type="number"
                          className="h-8 bg-secondary text-sm font-bold"
                          value={editDraft.yearly_allocated}
                          onChange={e => setEditDraft(d => ({ ...d, yearly_allocated: Number(e.target.value) }))}
                        />
                      </div>
                      <div>
                        <p className="mb-1 text-xs text-muted-foreground">Color</p>
                        <input
                          type="color"
                          aria-label="Category color"
                          className="h-8 w-8 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
                          value={editDraft.color}
                          onChange={e => setEditDraft(d => ({ ...d, color: e.target.value }))}
                        />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Spent so far: {fmt(cat.spent)}
                    </p>
                  </div>
                )
              }

              return (
                <div key={cat.id}>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-foreground">{cat.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">
                        {fmt(cat.spent)} of {fmt(cat.yearly_allocated)}
                      </span>
                      <span className={`text-xs font-bold ${pct >= 90 ? 'text-red-400' : pct >= 70 ? 'text-amber-400' : 'text-muted-foreground'}`}>
                        {pct}%
                      </span>
                      <button
                        onClick={() => startEdit(cat.id, cat.yearly_allocated, cat.color)}
                        className="flex h-6 w-6 items-center justify-center rounded-md bg-secondary text-xs text-muted-foreground hover:text-foreground"
                        aria-label={`Edit ${cat.name}`}
                      >
                        ✏
                      </button>
                      <button
                        onClick={() => handleDelete(cat.id)}
                        className="flex h-6 w-6 items-center justify-center rounded-md bg-secondary text-xs text-destructive hover:text-red-300"
                        aria-label={`Delete ${cat.name}`}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                  <ColorBar value={pct} color={barColor} />
                </div>
              )
            }) : (
              <p className="text-sm text-muted-foreground">No budget categories yet.</p>
            )}

            {/* Add category inline form */}
            {showAdd ? (
              <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                <p className="text-sm font-bold text-foreground">New category</p>
                <Input
                  aria-label="Category name"
                  className="h-8 bg-secondary text-sm"
                  placeholder="Category name"
                  value={addName}
                  onChange={e => setAddName(e.target.value)}
                />
                <div className="flex gap-3 items-center">
                  <Input
                    aria-label="Yearly amount"
                    type="number"
                    className="h-8 bg-secondary text-sm font-bold flex-1"
                    placeholder="Yearly amount"
                    value={addAmount}
                    onChange={e => setAddAmount(e.target.value)}
                  />
                  <input
                    type="color"
                    aria-label="Category color"
                    className="h-8 w-8 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
                    value={addColor}
                    onChange={e => setAddColor(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <Button className="h-8 flex-1 text-xs" onClick={handleAdd} disabled={addCategory.isPending}>
                    Add category
                  </Button>
                  <Button variant="secondary" className="h-8 text-xs" onClick={() => setShowAdd(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowAdd(true)}
                className="w-full rounded-xl border border-dashed border-border py-3 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
              >
                + Add category
              </button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-xl">Budget rules</CardTitle></CardHeader>
          <CardContent className="space-y-9 px-8">
            {rules.length > 0 ? rules.map(rule => (
              <div key={rule.id} className="flex items-center gap-4">
                <div className="h-10 w-10 shrink-0 rounded-2xl" style={{ backgroundColor: ruleColors[rule.rule_type] ?? '#A9F5C7' }} />
                <div>
                  <p className="text-base font-bold text-foreground">{rule.name}</p>
                  <p className="text-xs text-muted-foreground">{rule.category}</p>
                </div>
              </div>
            )) : (
              <p className="text-sm text-muted-foreground">No budget rules yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```
npx tsc --noEmit
```
Expected: zero errors.

- [ ] **Step 3: Smoke test in browser**

Open `/budget`. Verify:
- Amounts show in IDR format
- ✏ pencil opens inline form, Save/✗ work
- Bars turn amber at 70%+, red at 90%+
- "+ Add category" expands inline form and saves correctly

- [ ] **Step 4: Commit**

```bash
git add src/pages/Budget.tsx
git commit -m "feat: budget inline editing, adaptive bars, and global currency"
```

---

## Task 7: Investing — AllocationEditor + Currency

**Files:**
- Create: `src/components/investing/AllocationEditor.tsx`
- Modify: `src/pages/Investing.tsx`

- [ ] **Step 1: Create `src/components/investing/AllocationEditor.tsx`**

```tsx
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { AllocationItem } from '@/types'

const CIRCUMFERENCE = 2 * Math.PI * 28  // r = 28 → ≈ 175.93

function AllocationDonut({ items }: { items: AllocationItem[] }) {
  const valid = items.filter(item => item.pct > 0)
  const total = valid.reduce((sum, item) => sum + item.pct, 0)
  let cumulativePct = 0

  return (
    <svg width="90" height="90" viewBox="0 0 72 72" className="shrink-0">
      <circle cx="36" cy="36" r="28" fill="none" stroke="hsl(var(--muted))" strokeWidth="12" />
      {total > 0 && valid.map((item, i) => {
        const dash = (item.pct / 100) * CIRCUMFERENCE
        const offset = CIRCUMFERENCE * (0.25 - cumulativePct / 100)
        cumulativePct += item.pct
        return (
          <circle
            key={i}
            cx="36"
            cy="36"
            r="28"
            fill="none"
            stroke={item.color}
            strokeWidth="12"
            strokeDasharray={`${dash} ${CIRCUMFERENCE}`}
            strokeDashoffset={offset}
          />
        )
      })}
      <text x="36" y="40" textAnchor="middle" fill="hsl(var(--foreground))" fontSize="9" fontWeight="800">
        {total}%
      </text>
    </svg>
  )
}

interface Props {
  value: AllocationItem[]
  onChange: (items: AllocationItem[]) => void
  onSave: () => void
  isSaving: boolean
}

export function AllocationEditor({ value, onChange, onSave, isSaving }: Props) {
  const total = value.reduce((sum, item) => sum + item.pct, 0)
  const isValid = total === 100

  const update = (index: number, field: keyof AllocationItem, val: string | number) => {
    onChange(value.map((item, i) => i === index ? { ...item, [field]: val } : item))
  }

  const remove = (index: number) => {
    if (value.length <= 1) return
    onChange(value.filter((_, i) => i !== index))
  }

  const add = () => {
    onChange([...value, { name: '', pct: 0, color: '#6c63ff' }])
  }

  return (
    <div className="flex gap-5">
      <AllocationDonut items={value} />
      <div className="flex flex-1 flex-col gap-2">
        <div className="max-h-[200px] overflow-y-auto space-y-1.5 pr-1">
          {value.map((item, i) => (
            <div key={i} className="grid grid-cols-[1fr_28px_56px_18px] items-center gap-1.5">
              <Input
                aria-label="Asset name"
                className="h-7 rounded-lg bg-secondary px-2 text-xs font-bold"
                placeholder="Name"
                value={item.name}
                onChange={e => update(i, 'name', e.target.value)}
              />
              <input
                type="color"
                aria-label="Asset color"
                className="h-7 w-7 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
                value={item.color}
                onChange={e => update(i, 'color', e.target.value)}
              />
              <Input
                type="number"
                aria-label="Allocation percent"
                className="h-7 rounded-lg bg-secondary px-2 text-right text-xs font-bold"
                min={0}
                max={100}
                value={item.pct}
                onChange={e => update(i, 'pct', Number(e.target.value))}
              />
              <button
                onClick={() => remove(i)}
                disabled={value.length <= 1}
                className="text-sm text-destructive disabled:opacity-30"
                aria-label="Remove asset"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={add}
          className="text-left text-xs font-bold text-primary hover:underline"
        >
          + Add asset
        </button>
        <div className="flex items-center justify-between">
          <span className={`text-xs font-bold ${isValid ? 'text-green-400' : 'text-amber-400'}`}>
            {isValid
              ? '100% ✓'
              : total < 100
                ? `${total}% — needs ${100 - total}% more`
                : `${total}% — reduce by ${total - 100}%`}
          </span>
          <Button
            size="sm"
            className="h-7 px-4 text-xs"
            onClick={onSave}
            disabled={!isValid || isSaving}
          >
            {isSaving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Replace `src/pages/Investing.tsx` entirely**

```tsx
import { useEffect, useMemo, useState } from 'react'
import { useInvestmentConfig, useSaveInvestmentConfig } from '@/lib/queries'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { calculateInvestmentPlan, generateGrowthData } from '@/lib/investing'
import { useCurrency } from '@/lib/currency'
import { AllocationEditor } from '@/components/investing/AllocationEditor'
import { toast } from 'sonner'
import type { AllocationItem } from '@/types'

type SimulatorValues = {
  monthlyContribution: number
  annualReturnRate: number
  durationYears: number
  initialCapital: number
}

const DEFAULT_ALLOCATION: AllocationItem[] = [
  { name: 'ETF', pct: 60, color: '#6c63ff' },
  { name: 'Bonds', pct: 20, color: '#22c55e' },
  { name: 'Cash', pct: 10, color: '#f59e0b' },
  { name: 'Learning', pct: 10, color: '#60a5fa' },
]

const parseRate = (value: string) => {
  const parsed = Number(value.replace(/[^\d.,]/g, '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

const parseMoney = (value: string) => {
  const parsed = Number(value.replace(/[^\d]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

export function Investing() {
  const fmt = useCurrency()
  const { data: investConfig } = useInvestmentConfig()
  const saveInvestmentConfig = useSaveInvestmentConfig()

  const emptySimulator: SimulatorValues = useMemo(() => ({
    monthlyContribution: investConfig?.monthly_contribution ?? 0,
    annualReturnRate: investConfig?.return_rate ?? 0,
    durationYears: investConfig?.duration_years ?? 0,
    initialCapital: investConfig?.current_value ?? 0,
  }), [investConfig])

  const [draft, setDraft] = useState<SimulatorValues>({
    monthlyContribution: 0, annualReturnRate: 0, durationYears: 0, initialCapital: 0,
  })
  const [simulator, setSimulator] = useState<SimulatorValues>({
    monthlyContribution: 0, annualReturnRate: 0, durationYears: 0, initialCapital: 0,
  })
  const [allocation, setAllocation] = useState<AllocationItem[]>(DEFAULT_ALLOCATION)

  useEffect(() => {
    setDraft(emptySimulator)
    setSimulator(emptySimulator)
  }, [emptySimulator])

  useEffect(() => {
    if (investConfig?.allocations && investConfig.allocations.length > 0) {
      setAllocation(investConfig.allocations)
    }
  }, [investConfig])

  const plan = useMemo(() => calculateInvestmentPlan(simulator), [simulator])
  const growthData = useMemo(
    () => generateGrowthData(
      simulator.monthlyContribution,
      simulator.annualReturnRate,
      Math.max(0, simulator.durationYears)
    ).map(point => ({
      ...point,
      value: point.value + simulator.initialCapital * Math.pow(1 + simulator.annualReturnRate / 100 / 12, point.year * 12),
    })),
    [simulator]
  )
  const maxValue = Math.max(...growthData.map(row => row.value), 1)

  const updateDraft = (key: keyof SimulatorValues, value: string) => {
    const parser = key === 'annualReturnRate' ? parseRate : parseMoney
    setDraft(current => ({ ...current, [key]: parser(value) }))
  }

  const setDuration = (durationYears: number) => {
    setDraft(current => ({ ...current, durationYears }))
    setSimulator(current => ({ ...current, durationYears }))
  }

  const saveSimulator = async () => {
    await saveInvestmentConfig.mutateAsync({
      id: investConfig?.id,
      monthly_contribution: draft.monthlyContribution,
      return_rate: draft.annualReturnRate,
      duration_years: draft.durationYears,
      current_value: draft.initialCapital,
      allocations: allocation,
    })
    setSimulator(draft)
    toast.success('Investment simulator saved')
  }

  const saveAllocation = async () => {
    await saveInvestmentConfig.mutateAsync({
      id: investConfig?.id,
      monthly_contribution: simulator.monthlyContribution,
      return_rate: simulator.annualReturnRate,
      duration_years: simulator.durationYears,
      current_value: simulator.initialCapital,
      allocations: allocation,
    })
    toast.success('Allocation saved')
  }

  return (
    <div>
      <PageHeader
        title="Investing"
        subtitle="Simulate monthly contributions, expected returns, and long-term compound growth."
      />
      <Card className="mb-6">
        <CardContent className="flex min-h-[146px] flex-col gap-6 px-8 py-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-extrabold text-primary">
              Purpose: track real investments and simulate expected ROI before committing money.
            </p>
            <p className="mt-3 text-xs font-bold text-primary">Projected portfolio</p>
            <p className="mt-2 text-[2.25rem] font-extrabold leading-none text-foreground">
              {fmt(plan.projectedPortfolio)}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Estimated in {simulator.durationYears} years with {fmt(simulator.monthlyContribution)}/month and {simulator.annualReturnRate}% annual return.
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              className="px-9"
              onClick={event => { setSimulator(draft); event.currentTarget.blur() }}
            >
              Run ROI sim
            </Button>
            <Button variant="secondary" className="px-8" onClick={saveSimulator} disabled={saveInvestmentConfig.isPending}>
              Save simulator
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
        <Card>
          <CardHeader><CardTitle className="text-xl">Growth simulation</CardTitle></CardHeader>
          <CardContent className="flex h-[266px] items-end justify-center gap-12 px-8 pb-8">
            {growthData.map((point) => (
              <button
                key={point.year}
                className={`w-5 rounded-full transition-colors ${point.year === simulator.durationYears ? 'bg-primary' : 'bg-muted'}`}
                style={{ height: `${Math.max(32, (point.value / maxValue) * 230)}px` }}
                onClick={() => setDuration(point.year)}
                aria-label={`Use ${point.year} year duration`}
              />
            ))}
          </CardContent>
        </Card>

        <Card className="relative z-10">
          <CardHeader className="p-6 pb-2">
            <CardTitle className="text-xl">Investment ROI simulator</CardTitle>
            <p className="text-xs leading-4 text-muted-foreground">
              Try different monthly contribution, return rate, and duration.
            </p>
          </CardHeader>
          <CardContent className="space-y-2.5 px-6 pb-5">
            <div className="rounded-2xl bg-[#164629] p-3">
              <p className="text-xs font-bold text-primary">Projected portfolio</p>
              <p className="mt-1 text-2xl font-extrabold text-primary">{fmt(plan.projectedPortfolio)}</p>
              <p className="mt-1 text-xs text-primary/80">
                Gain: {fmt(plan.projectedGain)} · Invested: {fmt(plan.totalInvested)}
              </p>
            </div>
            {([
              ['Monthly contribution', 'monthlyContribution', String(draft.monthlyContribution)],
              ['Expected return / year', 'annualReturnRate', String(draft.annualReturnRate)],
              ['Duration (years)', 'durationYears', String(draft.durationYears)],
              ['Initial capital', 'initialCapital', String(draft.initialCapital)],
            ] as [string, keyof SimulatorValues, string][]).map(([label, key, value]) => (
              <div key={key}>
                <Label className="text-[11px] text-muted-foreground">{label}</Label>
                <Input
                  aria-label={label}
                  className="mt-1 h-8 rounded-xl bg-secondary text-sm font-extrabold"
                  value={value}
                  onChange={event => updateDraft(key, event.target.value)}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-xl">Portfolio allocation</CardTitle></CardHeader>
        <CardContent className="px-8 pb-6">
          <AllocationEditor
            value={allocation}
            onChange={setAllocation}
            onSave={saveAllocation}
            isSaving={saveInvestmentConfig.isPending}
          />
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 3: Verify TypeScript**

```
npx tsc --noEmit
```
Expected: zero errors.

- [ ] **Step 4: Smoke test in browser**

Open `/investing`. Verify:
- Amounts show in correct currency (from app_settings)
- Donut chart renders and updates as you change % values
- Add/remove asset rows work
- Save stores to Supabase (check Supabase table editor)
- Bar chart + simulator still work

- [ ] **Step 5: Commit**

```bash
git add src/components/investing/ src/pages/Investing.tsx
git commit -m "feat: add portfolio AllocationEditor with live donut chart to Investing page"
```

---

## Task 8: TypeScript Compile Check + Final Commit

**Files:** none new

- [ ] **Step 1: Full TypeScript check**

```
npx tsc --noEmit
```
Expected: zero errors.

- [ ] **Step 2: Run all tests**

```
npx vitest run
```
Expected: all tests pass.

- [ ] **Step 3: Run dev server and walk through every page**

```
npm run dev
```

Check each page at desktop width:
- Dashboard: amounts in IDR (or active currency), stat cards correct
- Transactions: amounts formatted, add/delete/review work
- Budget: category bars adaptive color, inline edit opens/saves/cancels, add category works
- Investing: donut renders, allocation saves, simulator works, amounts formatted
- Estimation: amounts formatted, items list formatted
- Reports: amounts formatted, insights use formatted values

Then resize browser to < 1024px:
- Sidebar hidden
- Bottom nav visible with 5 items
- "More" sheet opens with Estimation, Reports, Settings + goal card

---

## 2026-05-27 Follow-Up: Daily Use Polish

**Status:** Implemented in this pass.

- [x] Investing now has a saved target portfolio amount and target currency in addition to monthly contribution currency.
- [x] Supabase migration `008_add_investment_target.sql` was added and applied to the remote project.
- [x] Investing shows projected portfolio, base value, target progress, and target gap so the simulator reads more like an investment planning screen.
- [x] Transactions now lets users click an expense category to drill into only that category's history.
- [x] Expense-by-category on Transactions is compact and scrollable so it does not push the history too far down when many categories exist.
- [x] Reports now has previous/next period navigation for week, month, and year views instead of only the current period.
- [x] Added regression tests for investing target persistence, category drilldown, compact category scrolling, and report period navigation.

**Daily-user notes for next passes:**

- Add a richer category detail page with budget remaining, average daily pace, and unusually high transactions.
- Add calendar-style reports after the period controls feel stable.
- Add plain-language financial insights such as "food spending is 18% above your usual pace" or "this wallet could run negative before month end."
- Replace native browser confirmations with an in-app confirmation dialog for a smoother mobile feel.

## 2026-05-27 Follow-Up: UI Detail, Validation, and Daily Flow Polish

**Status:** Implemented in this pass.

- [x] Replaced remaining native browser delete confirmations with an in-app confirmation dialog across Settings, Transactions, Budget, and Estimation.
- [x] Added editable yearly goal controls in Settings so the sidebar and mobile goal card are no longer fixed text.
- [x] Added formatted number typing for money inputs so values are easier to read while entering them.
- [x] Simplified Transactions expense-by-category into compact scrollable filter buttons that show category name and item count only.
- [x] Improved Dashboard Spending overview into a ranked category bar view with a clearer purpose: quick daily spotting of where money is going before opening Reports.
- [x] Added Supabase validation constraints for currencies, non-negative numeric values, and yearly goal percentage bounds.
- [x] Added regression tests for in-app confirmations, yearly goal saving, compact category filters, number input formatting, and the improved spending overview.

**Daily-user notes for next passes:**

- Add account-level trend warnings such as low wallet balance, high card usage, or sudden category spikes.
- Add report exports once week/month/year review is stable.
- Add budget pacing guidance, for example "you can spend about X per day for the rest of this month."

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: FinPath v1.1 — responsive layout, global currency with exchange rates, budget editing, investing allocation"
```
