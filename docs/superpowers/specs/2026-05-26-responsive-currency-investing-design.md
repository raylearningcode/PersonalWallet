# FinPath v1.1 — Responsive Layout, Global Currency & Investing Upgrade

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Date:** 2026-05-26
**Goal:** Make the app fully responsive (mobile + desktop), replace all hardcoded currency with a global formatter backed by real exchange rates fetched on app open, add an editable portfolio allocation editor on the Investing page, and improve the Budget page with real amounts and adaptive progress bars.

---

## 1. Scope

Four independent improvements bundled into one release:

| # | Area | What changes |
|---|---|---|
| 1 | Mobile layout | Bottom nav bar on mobile, sidebar on desktop |
| 2 | Global currency | One formatter + live exchange rate fetched on app open, reads from `app_settings.currency` |
| 3 | Investing — allocation editor | Editable donut + table, persisted as JSONB to Supabase |
| 4 | Budget — display improvements | Real amounts on category rows, adaptive bar colors |
| 5 | Budget — inline editing | Edit yearly_allocated + color per row, add new categories directly on page |

---

## 2. File Map

### New files
```
src/lib/currency.ts                   formatCurrency, useExchangeRates, useCurrency
src/components/layout/BottomNav.tsx   Mobile bottom navigation bar
src/components/layout/MoreSheet.tsx   shadcn Sheet with extra nav links for mobile
src/components/investing/AllocationEditor.tsx  Donut + table allocation editor
```

### Modified files
```
src/components/layout/AppLayout.tsx  Add BottomNav, hide sidebar on mobile
src/components/layout/Sidebar.tsx    Hide on mobile (lg:flex, hidden)
src/pages/Dashboard.tsx              Use useCurrency hook
src/pages/Budget.tsx                 Use useCurrency + amounts on rows + adaptive colors
src/pages/Transactions.tsx           Use useCurrency for amounts
src/pages/Investing.tsx              Add AllocationEditor, use useCurrency
src/pages/Estimation.tsx             Use useCurrency
src/pages/Reports.tsx                Use useCurrency
src/types/index.ts                   Add allocations to InvestmentConfig, base_currency to AppSettings
supabase/migrations/001_add_allocations.sql   ALTER investment_config ADD allocations
supabase/migrations/002_add_base_currency.sql ALTER app_settings ADD base_currency
src/lib/queries.ts                            Add useUpdateBudgetCategory mutation
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

#### Exchange rate API

**Provider:** [fawazahmed0/currency-api](https://github.com/fawazahmed0/exchange-api) — completely free, no API key, updated daily, served via jsDelivr CDN.

**Request URL:**
```
https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/{baseCurrency}.json
```
Example for IDR base:
```
https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/idr.json
```
Returns:
```json
{ "date": "2026-05-26", "idr": { "usd": 0.0000614, "eur": 0.0000567, "sgd": 0.0000830, ... } }
```

**Fetch strategy:** TanStack Query with `staleTime: Infinity` — fetched **once per session** (on page load), never auto-refetched. Refreshes only on full page reload. No polling, no websocket.

#### `src/lib/currency.ts`

```ts
// Pure formatter — no conversion, just Intl formatting + IDR symbol fix
export function formatCurrency(amount: number, currency: string): string {
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'IDR' ? 0 : 2,
    minimumFractionDigits: currency === 'IDR' ? 0 : 2,
  }).format(amount)
  return formatted.replace('IDR', 'Rp')
}

// Fetches rates for a given base currency (e.g. 'IDR')
// Returns a map: { usd: 0.0000614, eur: 0.0000567, ... }
export function useExchangeRates(baseCurrency: string) {
  return useQuery({
    queryKey: ['exchange_rates', baseCurrency],
    queryFn: async () => {
      if (!baseCurrency) return {}
      const base = baseCurrency.toLowerCase()
      const res = await fetch(
        `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${base}.json`
      )
      if (!res.ok) throw new Error('Exchange rate fetch failed')
      const data = await res.json() as Record<string, unknown>
      return data[base] as Record<string, number>
    },
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 2,
  })
}

// Main hook used by all pages
// Reads base + display currency from app_settings, fetches rate, returns formatter
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

#### Supabase — add `base_currency` to `app_settings`

```sql
-- supabase/migrations/002_add_base_currency.sql
ALTER TABLE app_settings
ADD COLUMN IF NOT EXISTS base_currency text NOT NULL DEFAULT 'IDR';
```

`base_currency` = the currency that all stored transaction amounts are in (set once, rarely changed). `currency` = the display currency the user wants to see.

#### Type update (`src/types/index.ts`)

```ts
export interface AppSettings {
  // ... existing fields ...
  base_currency: string  // storage currency, e.g. 'IDR'
  // currency field already exists — this is the display currency
}
```

#### Seed update

```sql
UPDATE app_settings SET base_currency = 'IDR' WHERE true;
```

**Usage in pages:**
```tsx
const fmt = useCurrency()
// ...
<StatCard value={fmt(balance)} />
```

**Applied to:** Dashboard, Budget, Transactions, Investing, Estimation, Reports.

**Changing display currency:** Settings → Preferences → Currency. TanStack Query cache invalidation re-renders all pages instantly. The rate for the new currency is already in the fetched rates map — no extra fetch needed.

**Error fallback:** If the rate fetch fails (no internet), `rates` defaults to `{}`, the rate falls back to `1`, and amounts display in the base currency unchanged. A small "rates unavailable" note could appear — but it's not blocking.

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

### 3.5 Budget — Inline Editing

#### Category row — normal state

Each row shows:
- Left: bold category name + `Rp X,XXX,XXX spent of Rp X,XXX,XXX allocated` in muted text
- Right: `XX%` label (colored red/amber/normal per adaptive rule) + ✏ pencil button (`h-6 w-6`, `bg-secondary`, `rounded-md`)
- Progress bar below

#### Category row — edit state

Clicking ✏ expands the row inline (no modal). The row becomes a small form card (`bg-card border border-primary/30 rounded-xl p-3`):

```
[Category name — read-only label]          [✓ Save] [✗ Cancel]
Yearly budget:  [Rp | 24,000,000 input    ]
Color:          [■ color swatch input]   Spent: Rp 6,200,000 (read-only)
```

- **Yearly budget input:** number input pre-filled with current `yearly_allocated`. Currency prefix shown as muted label.
- **Color input:** `<input type="color">` styled as a 28×28 rounded swatch.
- **Spent:** read-only muted label — shows current year spend for context.
- **✓ Save:** calls `useUpdateBudgetCategory({ id, yearly_allocated, color })` → invalidates `budget_categories` cache → row collapses back to normal state.
- **✗ Cancel:** resets draft state, collapses row without saving.
- Only one row can be in edit mode at a time — opening a new row closes any open one.

#### Add category — inline form

A `+ Add category` button sits below the last row (`w-full`, dashed border, `rounded-xl`). Clicking it expands an inline form directly in the card:

```
[Category name input          ]
[Yearly amount input    ] [■ color]
[         Add category         ]
```

- Name: text input, required.
- Yearly amount: number input, required.
- Color: `<input type="color">`, default `#6c63ff`.
- **Add category** button: calls existing `useAddBudgetCategory` → invalidates cache → form resets and collapses.
- Form collapses if user clicks `+ Add category` again (toggle).

#### New query — `useUpdateBudgetCategory` (`src/lib/queries.ts`)

```ts
export function useUpdateBudgetCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...rest }: Pick<BudgetCategory, 'id' | 'yearly_allocated' | 'color'>) => {
      const { error } = await supabase
        .from('budget_categories')
        .update(rest)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budget_categories'] }),
  })
}
```

---

## 4. Data Flow

```
app open
  └─ useExchangeRates(base_currency)
       └─ fetches ONCE from cdn.jsdelivr.net (staleTime: Infinity)
            └─ returns rate map: { usd: 0.0000614, eur: 0.0000567, ... }

app_settings.base_currency + app_settings.currency
  └─ useCurrency() hook  (amount × rate → formatCurrency)
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

- `useCurrency()` defaults to `'IDR'` base + `'IDR'` display if `app_settings` hasn't loaded yet — no flash of wrong format
- Exchange rate fetch failure (no internet): `rates` defaults to `{}`, rate falls back to `1`, amounts show in base currency unchanged — not blocking
- `AllocationEditor` save button disabled when total ≠ 100% — prevents saving invalid state
- If Supabase `allocations` migration hasn't been run, `allocations` returns `null` — `DEFAULT_ALLOCATION` is used as fallback

---

## 6. Out of Scope

- Editing budget category `yearly_allocated` amounts inline (stays in Settings)
- Real-time / live-streaming exchange rates (fetch once on load is sufficient)
- Per-category currency (one global display currency only)
- Animated transitions on the donut chart
