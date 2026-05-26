# FinPath v1.1 — Responsive Layout, Global Currency & Investing Upgrade

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Date:** 2026-05-26
**Goal:** Make the app fully responsive (mobile + desktop), replace all hardcoded currency with a global formatter, add an editable portfolio allocation editor on the Investing page, and improve the Budget page with real amounts and adaptive progress bars.

---

## 1. Scope

Four independent improvements bundled into one release:

| # | Area | What changes |
|---|---|---|
| 1 | Mobile layout | Bottom nav bar on mobile, sidebar on desktop |
| 2 | Global currency | One formatter used everywhere, reads from `app_settings.currency` |
| 3 | Investing — allocation editor | Editable donut + table, persisted as JSONB to Supabase |
| 4 | Budget — display improvements | Real amounts on category rows, adaptive bar colors |

---

## 2. File Map

### New files
```
src/lib/currency.ts               Global formatCurrency function + useCurrency hook
src/components/layout/BottomNav.tsx  Mobile bottom navigation bar
src/components/layout/MoreSheet.tsx  shadcn Sheet with extra nav links for mobile
src/components/investing/AllocationEditor.tsx  Donut + table allocation editor
```

### Modified files
```
src/components/layout/AppLayout.tsx  Add BottomNav, hide sidebar on mobile
src/components/layout/Sidebar.tsx    Hide on mobile (lg:flex, hidden)
src/pages/Dashboard.tsx              Use formatCurrency from hook
src/pages/Budget.tsx                 Use formatCurrency + amounts on rows + adaptive colors
src/pages/Transactions.tsx           Use formatCurrency for amounts
src/pages/Investing.tsx              Add AllocationEditor, use formatCurrency
src/pages/Estimation.tsx             Use formatCurrency
src/pages/Reports.tsx                Use formatCurrency
src/types/index.ts                   Add allocations field to InvestmentConfig
supabase/migrations/001_add_allocations.sql  ALTER TABLE migration
```

---

## 3. Section Designs

### 3.1 Mobile Layout

**Breakpoint:** `lg` (1024px) — Tailwind's existing breakpoint.

**Desktop (≥ 1024px):** No change. Fixed left sidebar at 250px, main content offset `ml-[320px]`.

**Mobile (< 1024px):**
- Sidebar hidden: `hidden lg:flex`
- `<BottomNav>` rendered in AppLayout, `fixed bottom-0 left-0 right-0 z-50 h-16`
- Main content padding-bottom `pb-20` added on mobile to avoid overlap with bottom nav
- `<MoreSheet>` is a shadcn `Sheet` (side="bottom") triggered by the "More" tab

**BottomNav items (5 visible):**
| Icon | Label | Route |
|---|---|---|
| LayoutDashboard | Dashboard | `/` |
| ArrowLeftRight | Transactions | `/transactions` |
| PieChart | Budget | `/budget` |
| TrendingUp | Investing | `/investing` |
| MoreHorizontal | More | (opens MoreSheet) |

Active item: icon + label in `text-primary`. Inactive: `text-muted-foreground`.

**MoreSheet contents:**
- Nav links: Estimation (`/estimation`), Reports (`/reports`), Settings (`/settings`)
- Goal progress card (same card from sidebar bottom)
- Sheet closes on nav link click

---

### 3.2 Global Currency System

**`src/lib/currency.ts`**

```ts
export function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'IDR' ? 0 : 2,
    minimumFractionDigits: currency === 'IDR' ? 0 : 2,
  }).format(amount)
}
```

For IDR this produces: `IDR 84,250,000`
For USD: `$84,250.00`

**Override display symbol for IDR:** The `Intl` default for IDR is `IDR` not `Rp`. Add a post-format replace:
```ts
return formatted.replace('IDR', 'Rp')
```

**`useCurrency()` hook** in the same file:
```ts
export function useCurrency() {
  const { data: settings } = useAppSettings()
  const currency = settings?.currency ?? 'IDR'
  return (amount: number) => formatCurrency(amount, currency)
}
```

**Usage in pages:**
```tsx
const fmt = useCurrency()
// ...
<StatCard value={fmt(balance)} />
```

**Applied to:** Dashboard, Budget, Transactions, Investing, Estimation, Reports. Every page that currently calls `formatWholeCurrency`, `formatIdrCompact`, `formatIdrInput`, or any other hardcoded formatter replaces it with `fmt(amount)`.

**Changing currency:** Settings page → Preferences → Currency select. Already wired to `app_settings`. TanStack Query cache invalidation causes all pages to re-render immediately.

---

### 3.3 Investing — Allocation Editor

#### Supabase migration

```sql
ALTER TABLE investment_config
ADD COLUMN IF NOT EXISTS allocations jsonb NOT NULL DEFAULT '[]'::jsonb;
```

#### Type update (`src/types/index.ts`)

```ts
export interface AllocationItem {
  name: string
  pct: number
  color: string
}

export interface InvestmentConfig {
  // ... existing fields ...
  allocations: AllocationItem[]
}
```

#### `AllocationEditor` component (`src/components/investing/AllocationEditor.tsx`)

Props:
```ts
interface Props {
  value: AllocationItem[]
  onChange: (items: AllocationItem[]) => void
  onSave: () => void
  isSaving: boolean
}
```

Layout — two-column row, max-height constrained:
```
[Donut SVG ~90px]  |  [Compact table rows]
                   |  Name  ●color  %   ×
                   |  ETF   ●      60   ×
                   |  Bonds ●      20   ×
                   |  + Add asset
                   |  Total: 100% ✓  [Save]
```

**Donut chart:** SVG, 90×90px. One `<circle>` stroke per allocation item using `stroke-dasharray` math:
```
circumference = 2 * π * r  (r = 28)
dasharray = (pct / 100) * circumference
dashoffset calculated from cumulative offset of previous items
```

**Table rows:** Each row:
- Name: `<input type="text">` — editable
- Color: `<input type="color">` styled as a 14×14 swatch
- Pct: `<input type="number" min="0" max="100">` — right-aligned
- `×` remove button — disabled if only 1 row remains

**Total badge:**
- `pct sum === 100` → `text-green-400` "100% ✓"
- `pct sum !== 100` → `text-amber-400` "X% — needs Y% more/less"

**Add row:** Appends `{ name: '', pct: 0, color: '#6c63ff' }` to the array.

**Save:** Calls `onSave` which triggers `useSaveInvestmentConfig` with the updated `allocations` field. Save button disabled if total ≠ 100%.

**Overflow:** If > 6 rows, the table section scrolls internally (`max-h-[200px] overflow-y-auto`).

#### Integration in `Investing.tsx`

The `AllocationEditor` replaces the current hardcoded `ALLOCATION` pill row at the bottom of the page. It reads `investConfig?.allocations ?? DEFAULT_ALLOCATION` as initial value, where:

```ts
const DEFAULT_ALLOCATION: AllocationItem[] = [
  { name: 'ETF', pct: 60, color: '#6c63ff' },
  { name: 'Bonds', pct: 20, color: '#22c55e' },
  { name: 'Cash', pct: 10, color: '#f59e0b' },
  { name: 'Learning', pct: 10, color: '#60a5fa' },
]
```

---

### 3.4 Budget — Display Improvements

#### Category rows

**Before:** Name + `% used` label + single-color bar

**After:**
```
Housing                    Rp 12,500,000 of Rp 48,000,000
[████████░░░░░░░] 26% used
```

- Top line: bold category name left, `spent of allocated` right in `text-muted-foreground`
- Bottom line: adaptive-color bar + `XX% used` label right

#### Adaptive bar colors

Replace fixed `cat.color` with a computed bar color based on usage:

```ts
function getBarColor(pct: number, catColor: string): string {
  if (pct >= 90) return '#ef4444' // red
  if (pct >= 70) return '#f59e0b' // amber
  return catColor                  // category color (default green/blue/etc)
}
```

The category's assigned color is used normally when under 70%. At 70–90% it shifts to amber as a warning. Over 90% it turns red regardless of the category color.

#### Currency

All amounts (`yearly_allocated`, `spent`, stat card totals) formatted via `useCurrency()`.

---

## 4. Data Flow

```
app_settings.currency
  └─ useCurrency() hook
       ├─ Dashboard  (balance, spent, invested)
       ├─ Budget     (allocated, remaining, spent per category)
       ├─ Transactions (amount column)
       ├─ Investing  (contribution, capital, projected value)
       ├─ Estimation (income, expenses, saving)
       └─ Reports    (monthly bars, stat cards)

investment_config.allocations (jsonb)
  └─ AllocationEditor
       ├─ reads on mount (default if empty)
       ├─ edits in local state
       └─ saves via useSaveInvestmentConfig on button click
```

---

## 5. Error Handling

- `useCurrency()` defaults to `'IDR'` if `app_settings` hasn't loaded yet — no flash of wrong currency on fast connections
- `AllocationEditor` save button disabled when total ≠ 100% — prevents saving invalid state
- If Supabase migration hasn't been run, `allocations` returns `null` — default allocation is used as fallback

---

## 6. Out of Scope

- Editing budget category `yearly_allocated` amounts inline (stays in Settings)
- Currency conversion between currencies (amounts stay in one currency)
- Per-category currency (one global currency only)
- Animated transitions on the donut chart
