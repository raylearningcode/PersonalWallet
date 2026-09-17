# Budget Transaction Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build per-category rollover controls, focused budget allocation, and a cleaner mobile/desktop transaction entry flow.

**Architecture:** Add budget-setting fields at the `BudgetCategory` boundary, keep rollover math in pure helpers, and keep UI state in page/form components. Extract reusable category/emoji/select-sheet pieces so `Budget.tsx` and `TransactionForm.tsx` do not absorb every interaction detail.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Testing Library, Tailwind, Supabase SQL migrations, localStorage offline store.

---

## File Structure

- Modify `src/types/index.ts`: add budget reset and rollover fields to `BudgetCategory`.
- Create `supabase/migrations/020_budget_rollover_settings.sql`: add nullable/defaulted category budget settings.
- Modify `supabase/schema.sql`: keep schema snapshot aligned with the migration.
- Modify `src/lib/localStore.ts`: persist default values for guest/offline categories.
- Modify `src/lib/queries.ts`: allow add/update budget mutations to carry the new fields.
- Modify `src/lib/budget.ts`: add rollover settings helpers and replace unconditional `getMonthlyRollover` usage.
- Modify `src/lib/budget.test.ts`: pure tests for rollover settings and reset labels.
- Create `src/lib/categoryIcons.ts`: curated grouped emoji list and label helpers.
- Create `src/components/categories/EmojiPicker.tsx`: reusable broad emoji picker.
- Create `src/components/transactions/SelectorSheet.tsx`: mobile-safe searchable bottom sheet / desktop selector wrapper.
- Modify `src/components/transactions/TransactionForm.tsx`: remove advanced mode, start category/wallet blank, use selector sheets, expose split/multi-wallet/transfer-fee controls inline.
- Modify `src/components/layout/QuickAddSheet.tsx`: choose desktop side panel vs mobile bottom sheet dimensions.
- Modify `src/pages/AddTransaction.test.tsx`: new transaction defaults and fee controls.
- Modify `src/pages/Budget.tsx`: funded-only allocation, add-budget chooser, edit budget settings, no color editor.
- Modify `src/pages/Budget.test.tsx`: funded-only/add-budget/rollover UI coverage.
- Modify `src/pages/Dashboard.tsx`: fix spending trend spacing/overlap.
- Modify `src/pages/Dashboard.test.tsx`: regression for trend labels.
- Modify `src/lib/localStore.ts` and `src/lib/queries.ts`: verify new budget/category fields work in guest/offline mode and queued remote sync payloads include them.

---

### Task 1: Budget Category Settings Data Model

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/lib/localStore.ts`
- Modify: `src/lib/queries.ts`
- Create: `supabase/migrations/020_budget_rollover_settings.sql`
- Modify: `supabase/schema.sql`
- Test: `src/lib/budget.test.ts`

- [ ] **Step 1: Write failing type-level/pure tests for default budget settings**

Add these imports and tests to `src/lib/budget.test.ts`:

```ts
import {
  getBudgetResetStartLabel,
  normalizeBudgetSettings,
  type BudgetResetFrequency,
  type BudgetRolloverMode,
} from './budget'

describe('budget setting defaults', () => {
  it('normalizes missing budget settings for older cached categories', () => {
    const normalized = normalizeBudgetSettings({
      id: 'food',
      name: 'Food',
      yearly_allocated: 1000,
      budget_period: 'monthly',
      color: '#A9F5C7',
    })

    expect(normalized.reset_frequency).toBe<BudgetResetFrequency>('monthly')
    expect(normalized.reset_start_day).toBe(1)
    expect(normalized.rollover_enabled).toBe(false)
    expect(normalized.rollover_mode).toBe<BudgetRolloverMode>('all_unused')
    expect(normalized.rollover_cap).toBeNull()
  })

  it('labels reset start days from 1st to 31st day of the month', () => {
    expect(getBudgetResetStartLabel(1)).toBe('1st day of the month')
    expect(getBudgetResetStartLabel(2)).toBe('2nd day of the month')
    expect(getBudgetResetStartLabel(3)).toBe('3rd day of the month')
    expect(getBudgetResetStartLabel(4)).toBe('4th day of the month')
    expect(getBudgetResetStartLabel(21)).toBe('21st day of the month')
    expect(getBudgetResetStartLabel(31)).toBe('31st day of the month')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/budget.test.ts --run`

Expected: FAIL because `normalizeBudgetSettings`, `getBudgetResetStartLabel`, and the exported types do not exist.

- [ ] **Step 3: Add TypeScript fields**

Update `src/types/index.ts`:

```ts
export type BudgetResetFrequency = 'monthly' | 'yearly'
export type BudgetRolloverMode = 'all_unused' | 'custom_cap'

export interface BudgetCategory {
  id: string
  user_id?: string | null
  name: string
  yearly_allocated: number
  budget_period: 'monthly' | 'yearly'
  reset_frequency?: BudgetResetFrequency | null
  reset_start_day?: number | null
  rollover_enabled?: boolean | null
  rollover_mode?: BudgetRolloverMode | null
  rollover_cap?: number | null
  color: string
  icon?: string | null
  created_at?: string
}
```

- [ ] **Step 4: Add Supabase migration**

Create `supabase/migrations/020_budget_rollover_settings.sql`:

```sql
alter table budget_categories
  add column if not exists reset_frequency text not null default 'monthly',
  add column if not exists reset_start_day integer not null default 1,
  add column if not exists rollover_enabled boolean not null default false,
  add column if not exists rollover_mode text not null default 'all_unused',
  add column if not exists rollover_cap numeric;

alter table budget_categories
  add constraint budget_categories_reset_frequency_check
  check (reset_frequency in ('monthly', 'yearly')) not valid;

alter table budget_categories
  add constraint budget_categories_reset_start_day_check
  check (reset_start_day between 1 and 31) not valid;

alter table budget_categories
  add constraint budget_categories_rollover_mode_check
  check (rollover_mode in ('all_unused', 'custom_cap')) not valid;

alter table budget_categories
  add constraint budget_categories_rollover_cap_nonnegative_check
  check (rollover_cap is null or rollover_cap >= 0) not valid;

update budget_categories
set reset_frequency = coalesce(budget_period, 'monthly')
where reset_frequency is null;
```

Also update the `budget_categories` table definition in `supabase/schema.sql` with the same columns and check constraints.

- [ ] **Step 5: Add helper implementation**

In `src/lib/budget.ts`, export these types from `src/types` and add:

```ts
import type { Transaction, BudgetCategory, BudgetResetFrequency, BudgetRolloverMode } from '@/types'

export type { BudgetResetFrequency, BudgetRolloverMode }

export function normalizeBudgetSettings<T extends BudgetCategory>(cat: T): T & {
  reset_frequency: BudgetResetFrequency
  reset_start_day: number
  rollover_enabled: boolean
  rollover_mode: BudgetRolloverMode
  rollover_cap: number | null
} {
  return {
    ...cat,
    reset_frequency: cat.reset_frequency ?? cat.budget_period ?? 'monthly',
    reset_start_day: Math.min(31, Math.max(1, cat.reset_start_day ?? 1)),
    rollover_enabled: Boolean(cat.rollover_enabled),
    rollover_mode: cat.rollover_mode ?? 'all_unused',
    rollover_cap: cat.rollover_cap ?? null,
  }
}

export function getBudgetResetStartLabel(day: number): string {
  const safe = Math.min(31, Math.max(1, Math.round(day)))
  const mod100 = safe % 100
  const suffix = mod100 >= 11 && mod100 <= 13
    ? 'th'
    : safe % 10 === 1 ? 'st'
    : safe % 10 === 2 ? 'nd'
    : safe % 10 === 3 ? 'rd'
    : 'th'
  return `${safe}${suffix} day of the month`
}
```

- [ ] **Step 6: Update local store defaults**

Update `localAddCategory` and `localUpdateCategory` in `src/lib/localStore.ts` so new categories receive:

```ts
const cat: BudgetCategory = {
  ...data,
  budget_period: data.budget_period ?? 'monthly',
  reset_frequency: data.reset_frequency ?? data.budget_period ?? 'monthly',
  reset_start_day: data.reset_start_day ?? 1,
  rollover_enabled: data.rollover_enabled ?? false,
  rollover_mode: data.rollover_mode ?? 'all_unused',
  rollover_cap: data.rollover_cap ?? null,
  id: newId(),
  user_id: null,
  created_at: nowIso(),
}
```

- [ ] **Step 7: Update mutations**

In `src/lib/queries.ts`, change `useAddBudgetCategory` to accept the new optional fields. Change `useUpdateBudgetCategory` mutation args from a fixed `Pick` to:

```ts
mutationFn: async ({ id, ...patch }: Pick<BudgetCategory, 'id'> & Partial<Pick<
  BudgetCategory,
  'yearly_allocated' | 'budget_period' | 'reset_frequency' | 'reset_start_day' |
  'rollover_enabled' | 'rollover_mode' | 'rollover_cap' | 'color' | 'icon' | 'name'
>>) => {
```

Keep existing offline queue behavior, but enqueue `patch`.

- [ ] **Step 8: Run tests**

Run: `npm run test -- src/lib/budget.test.ts --run`

Expected: PASS.

- [ ] **Step 9: Commit**

Run:

```bash
git add src/types/index.ts src/lib/localStore.ts src/lib/queries.ts src/lib/budget.ts src/lib/budget.test.ts supabase/migrations/020_budget_rollover_settings.sql supabase/schema.sql
git commit -m "Add budget rollover settings model"
```

---

### Task 2: Rollover Math

**Files:**
- Modify: `src/lib/budget.ts`
- Test: `src/lib/budget.test.ts`

- [ ] **Step 1: Write failing rollover tests**

Add to `src/lib/budget.test.ts`:

```ts
import { getCategoryRollover } from './budget'

describe('getCategoryRollover', () => {
  const periodDate = new Date(2026, 8, 15)
  const txs = [
    tx({ id: 'aug-food', category: 'Food', amount: 600, date: '2026-08-10' }),
    tx({ id: 'aug-fun', category: 'Fun', amount: 200, date: '2026-08-11' }),
    tx({ id: 'sep-food', category: 'Food', amount: 100, date: '2026-09-02' }),
  ]

  it('returns zero when rollover is disabled', () => {
    const cat = normalizeBudgetSettings({
      id: 'food',
      name: 'Food',
      yearly_allocated: 1000,
      budget_period: 'monthly',
      rollover_enabled: false,
      color: '#A9F5C7',
    })
    expect(getCategoryRollover(txs, cat, periodDate)).toBe(0)
  })

  it('rolls over all unused previous-period money when enabled', () => {
    const cat = normalizeBudgetSettings({
      id: 'food',
      name: 'Food',
      yearly_allocated: 1000,
      budget_period: 'monthly',
      rollover_enabled: true,
      rollover_mode: 'all_unused',
      color: '#A9F5C7',
    })
    expect(getCategoryRollover(txs, cat, periodDate)).toBe(400)
  })

  it('caps rollover when custom cap is set', () => {
    const cat = normalizeBudgetSettings({
      id: 'food',
      name: 'Food',
      yearly_allocated: 1000,
      budget_period: 'monthly',
      rollover_enabled: true,
      rollover_mode: 'custom_cap',
      rollover_cap: 250,
      color: '#A9F5C7',
    })
    expect(getCategoryRollover(txs, cat, periodDate)).toBe(250)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/budget.test.ts --run`

Expected: FAIL because `getCategoryRollover` does not exist.

- [ ] **Step 3: Implement rollover helper**

Add to `src/lib/budget.ts`:

```ts
export function getCategoryRollover(
  transactions: Transaction[],
  category: BudgetCategory,
  periodDate: Date = new Date(),
): number {
  const settings = normalizeBudgetSettings(category)
  if (!settings.rollover_enabled || settings.reset_frequency !== 'monthly' || settings.yearly_allocated <= 0) return 0

  const raw = getMonthlyRollover(transactions, settings.name, settings.yearly_allocated, periodDate)
  if (settings.rollover_mode === 'custom_cap') {
    return Math.min(raw, Math.max(0, settings.rollover_cap ?? 0))
  }
  return raw
}
```

- [ ] **Step 4: Run test**

Run: `npm run test -- src/lib/budget.test.ts --run`

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/lib/budget.ts src/lib/budget.test.ts
git commit -m "Add configurable budget rollover math"
```

---

### Task 3: Category Icon Picker

**Files:**
- Create: `src/lib/categoryIcons.ts`
- Create: `src/components/categories/EmojiPicker.tsx`
- Modify: `src/pages/Settings.tsx`
- Test: `src/pages/Settings.test.tsx`

- [ ] **Step 1: Write failing Settings test**

In `src/pages/Settings.test.tsx`, add:

```ts
it('adds a category with a selected emoji icon', async () => {
  renderSettings('/settings?section=categories')

  fireEvent.click(screen.getByRole('button', { name: 'Choose category icon' }))
  fireEvent.click(screen.getByRole('button', { name: 'Use emoji 🍔' }))
  fireEvent.change(screen.getByPlaceholderText('New category'), { target: { value: 'Dining out' } })
  fireEvent.click(screen.getByRole('button', { name: 'Add' }))

  await waitFor(() => expect(addCategory).toHaveBeenCalledWith(expect.objectContaining({
    name: 'Dining out',
    icon: '🍔',
  })))
})
```

Use the existing `renderSettings` helper already defined near the top of `src/pages/Settings.test.tsx`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/pages/Settings.test.tsx --run`

Expected: FAIL because the broad picker button labels do not exist.

- [ ] **Step 3: Add curated emoji list**

Create `src/lib/categoryIcons.ts`:

```ts
export const CATEGORY_EMOJI_GROUPS = [
  { name: 'People', emojis: ['😀', '🙂', '💼', '🎓', '👶', '🧑‍⚕️'] },
  { name: 'Food', emojis: ['🍔', '🍜', '🍚', '☕', '🍿', '🛒'] },
  { name: 'Home', emojis: ['🏠', '💡', '🛏️', '🧹', '🔧', '🌱'] },
  { name: 'Transport', emojis: ['🚗', '🚌', '🚆', '✈️', '⛽', '🅿️'] },
  { name: 'Health', emojis: ['💊', '🏥', '🦷', '🏋️', '🧘', '❤️'] },
  { name: 'Fun', emojis: ['🎮', '🎬', '🎵', '🎁', '📚', '📱'] },
  { name: 'Money', emojis: ['💰', '💳', '🏦', '📈', '⚖️', '🧾'] },
] as const

export const CATEGORY_EMOJIS = CATEGORY_EMOJI_GROUPS.flatMap(group => group.emojis)
```

- [ ] **Step 4: Create reusable picker**

Create `src/components/categories/EmojiPicker.tsx`:

```tsx
import { CATEGORY_EMOJI_GROUPS } from '@/lib/categoryIcons'

export function EmojiPicker({
  value,
  onChange,
  ariaLabel = 'Choose category icon',
}: {
  value: string
  onChange: (emoji: string) => void
  ariaLabel?: string
}) {
  return (
    <div aria-label={ariaLabel} className="space-y-3">
      {CATEGORY_EMOJI_GROUPS.map(group => (
        <div key={group.name}>
          <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">{group.name}</p>
          <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
            {group.emojis.map(emoji => (
              <button
                key={emoji}
                type="button"
                aria-label={`Use emoji ${emoji}`}
                aria-pressed={value === emoji}
                onClick={() => onChange(emoji)}
                className={`flex h-11 items-center justify-center rounded-xl border text-xl transition-colors ${
                  value === emoji ? 'border-primary bg-primary/10' : 'border-border bg-secondary hover:border-primary/40'
                }`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Replace inline Settings emoji picker**

In `src/pages/Settings.tsx`, import the new component and replace the local `EmojiPicker` implementation/usages with `src/components/categories/EmojiPicker`. Keep manual text input as a fallback.

- [ ] **Step 6: Run test**

Run: `npm run test -- src/pages/Settings.test.tsx --run`

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add src/lib/categoryIcons.ts src/components/categories/EmojiPicker.tsx src/pages/Settings.tsx src/pages/Settings.test.tsx
git commit -m "Add reusable category emoji picker"
```

---

### Task 4: Budget Page Funded-Only Allocation And Editor

**Files:**
- Modify: `src/pages/Budget.tsx`
- Test: `src/pages/Budget.test.tsx`

- [ ] **Step 1: Write failing Budget tests**

Add tests to `src/pages/Budget.test.tsx`:

```ts
it('hides unfunded categories from active budget allocation', () => {
  mockCategories = [
    { id: 'funded', name: 'Food', yearly_allocated: 600000, budget_period: 'monthly' as const, color: '#A9F5C7', icon: '🍜' },
    { id: 'unfunded', name: 'Entertainment', yearly_allocated: 0, budget_period: 'monthly' as const, color: '#FF8388', icon: '🎬' },
  ]
  mockTransactions = []

  renderBudget()

  expect(screen.getByRole('button', { name: /Open Food budget details/i })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Open Entertainment budget details/i })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Add budget/i })).toBeInTheDocument()
})

it('opens budget editor with reset start and rollover controls', () => {
  mockCategories = [
    {
      id: 'funded',
      name: 'Food',
      yearly_allocated: 600000,
      budget_period: 'monthly' as const,
      reset_frequency: 'monthly' as const,
      reset_start_day: 1,
      rollover_enabled: true,
      rollover_mode: 'custom_cap' as const,
      rollover_cap: 250000,
      color: '#A9F5C7',
      icon: '🍜',
    },
  ]
  mockTransactions = []

  renderBudget()
  fireEvent.click(screen.getByRole('button', { name: /Open Food budget details/i }))

  expect(screen.getByLabelText('Reset frequency')).toBeInTheDocument()
  expect(screen.getByLabelText('Reset start')).toHaveValue('1')
  expect(screen.getByRole('switch', { name: 'Rollover' })).toHaveAttribute('aria-checked', 'true')
  expect(screen.getByLabelText('Max rollover')).toBeInTheDocument()
  expect(screen.queryByLabelText(/Color/i)).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/pages/Budget.test.tsx --run`

Expected: FAIL because current Budget shows unfunded categories and lacks new editor controls.

- [ ] **Step 3: Update Budget calculations**

In `src/pages/Budget.tsx`, import `normalizeBudgetSettings`, `getCategoryRollover`, and `getBudgetResetStartLabel`. Normalize categories inside `categoriesWithSpent`, and replace direct `getMonthlyRollover` calls with:

```ts
const rollover = getCategoryRollover(transactions, cat, periodDate)
const effectiveBudget = cat.yearly_allocated + rollover
```

Set:

```ts
const activeBudgets = useMemo(() =>
  categoriesWithSpent
    .filter(c => c.yearly_allocated > 0)
    .sort((a, b) => getCategoryUsedPct(b.spent, b.yearly_allocated) - getCategoryUsedPct(a.spent, a.yearly_allocated)),
  [categoriesWithSpent]
)
```

Do not render `noBudget` as allocation rows.

- [ ] **Step 4: Replace add category action with Add budget**

Change the page header action label to `+ Add budget`. When clicked, open a sheet with:

```tsx
<SheetTitle>Add budget</SheetTitle>
<div className="space-y-2">
  {categoriesWithSpent.filter(c => c.yearly_allocated === 0).map(cat => (
    <button type="button" key={cat.id} onClick={() => openSheet(cat)} className="flex w-full items-center justify-between rounded-xl bg-secondary px-4 py-3 text-left font-bold">
      <span>{cat.icon} {cat.name}</span>
      <span className="text-xs text-muted-foreground">No budget</span>
    </button>
  ))}
  <button type="button" onClick={() => setShowCreateBudget(true)} className="flex w-full items-center justify-between rounded-xl border border-dashed border-border px-4 py-3 text-left font-bold">
    <span>+ Create new category</span>
  </button>
</div>
```

- [ ] **Step 5: Update budget editor draft state**

Extend `sheetDraft` in `Budget.tsx`:

```ts
const [sheetDraft, setSheetDraft] = useState({
  yearly_allocated: 0,
  budget_period: 'monthly' as BudgetPeriod,
  reset_frequency: 'monthly' as BudgetResetFrequency,
  reset_start_day: 1,
  rollover_enabled: false,
  rollover_mode: 'all_unused' as BudgetRolloverMode,
  rollover_cap: null as number | null,
})
```

Remove color from the edit form. Keep existing category color in data for backward compatibility but do not expose it in this editor.

- [ ] **Step 6: Render reset and rollover controls**

Inside the sheet edit form, add:

```tsx
<select aria-label="Reset frequency" value={sheetDraft.reset_frequency} onChange={e => setSheetDraft(d => ({ ...d, reset_frequency: e.target.value as BudgetResetFrequency, budget_period: e.target.value as BudgetPeriod }))}>
  <option value="monthly">Monthly</option>
  <option value="yearly">Yearly</option>
</select>
<select aria-label="Reset start" value={sheetDraft.reset_start_day} onChange={e => setSheetDraft(d => ({ ...d, reset_start_day: Number(e.target.value) }))}>
  {Array.from({ length: 31 }, (_, i) => i + 1).map(day => <option key={day} value={day}>{getBudgetResetStartLabel(day)}</option>)}
</select>
<button type="button" role="switch" aria-label="Rollover" aria-checked={sheetDraft.rollover_enabled} onClick={() => setSheetDraft(d => ({ ...d, rollover_enabled: !d.rollover_enabled }))}>
  {sheetDraft.rollover_enabled ? 'On' : 'Off'}
</button>
{sheetDraft.rollover_enabled && (
  <>
    <select aria-label="Rollover mode" value={sheetDraft.rollover_mode} onChange={e => setSheetDraft(d => ({ ...d, rollover_mode: e.target.value as BudgetRolloverMode }))}>
      <option value="all_unused">All unused</option>
      <option value="custom_cap">Custom cap</option>
    </select>
    {sheetDraft.rollover_mode === 'custom_cap' && (
      <MoneyField ariaLabel="Max rollover" value={sheetDraft.rollover_cap == null ? '' : String(sheetDraft.rollover_cap)} onChange={v => setSheetDraft(d => ({ ...d, rollover_cap: parseNumberInput(v) }))} currency={money.baseCurrency} />
    )}
  </>
)}
```

- [ ] **Step 7: Save new fields**

Update `saveSheet` mutation payload:

```ts
await updateCategory.mutateAsync({
  id,
  yearly_allocated: sheetDraft.yearly_allocated,
  budget_period: sheetDraft.reset_frequency,
  reset_frequency: sheetDraft.reset_frequency,
  reset_start_day: sheetDraft.reset_start_day,
  rollover_enabled: sheetDraft.rollover_enabled,
  rollover_mode: sheetDraft.rollover_mode,
  rollover_cap: sheetDraft.rollover_enabled && sheetDraft.rollover_mode === 'custom_cap' ? sheetDraft.rollover_cap : null,
})
```

- [ ] **Step 8: Run tests**

Run: `npm run test -- src/pages/Budget.test.tsx --run`

Expected: PASS.

- [ ] **Step 9: Commit**

Run:

```bash
git add src/pages/Budget.tsx src/pages/Budget.test.tsx
git commit -m "Polish budget allocation and rollover editor"
```

---

### Task 5: Transaction Selector Sheet

**Files:**
- Create: `src/components/transactions/SelectorSheet.tsx`
- Test: `src/components/transactions/SelectorSheet.test.tsx`

- [ ] **Step 1: Write failing selector tests**

Create `src/components/transactions/SelectorSheet.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SelectorSheet } from './SelectorSheet'

const items = [
  { id: 'food', label: 'Food', icon: '🍜', meta: 'Budgeted' },
  { id: 'transport', label: 'Transport', icon: '🚌', meta: 'Budgeted' },
]

describe('SelectorSheet', () => {
  it('opens a searchable mobile-safe list and selects an item', () => {
    const onSelect = vi.fn()
    render(<SelectorSheet title="Choose category" open items={items} value="" onOpenChange={() => {}} onSelect={onSelect} />)

    expect(screen.getByRole('dialog', { name: 'Choose category' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Search')).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('Search'), { target: { value: 'tran' } })
    expect(screen.queryByText('Food')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Transport/ }))
    expect(onSelect).toHaveBeenCalledWith('transport')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/components/transactions/SelectorSheet.test.tsx --run`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement SelectorSheet**

Create `src/components/transactions/SelectorSheet.tsx`:

```tsx
import { useMemo, useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'

export interface SelectorItem {
  id: string
  label: string
  icon?: string | null
  meta?: string | null
}

export function SelectorSheet({
  open,
  title,
  items,
  value,
  onSelect,
  onOpenChange,
  placeholder = 'Search',
}: {
  open: boolean
  title: string
  items: SelectorItem[]
  value: string
  onSelect: (id: string) => void
  onOpenChange: (open: boolean) => void
  placeholder?: string
}) {
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter(item => item.label.toLowerCase().includes(q) || item.meta?.toLowerCase().includes(q))
  }, [items, query])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[calc(100dvh-148px)] overflow-y-auto rounded-t-3xl border-border bg-background px-5 pb-safe-12">
        <SheetHeader className="mb-3 text-left">
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <Input value={query} onChange={e => setQuery(e.target.value)} placeholder={placeholder} className="mb-3 bg-secondary" />
        <div className="space-y-1.5 pb-6">
          {filtered.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelect(item.id)
                onOpenChange(false)
              }}
              className={`flex w-full items-center justify-between rounded-xl px-3 py-3 text-left transition-colors ${
                value === item.id ? 'bg-primary/10 text-primary' : 'bg-secondary text-foreground hover:bg-secondary/80'
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                {item.icon && <span className="text-base leading-none">{item.icon}</span>}
                <span className="truncate font-bold">{item.label}</span>
              </span>
              {item.meta && <span className="shrink-0 text-xs text-muted-foreground">{item.meta}</span>}
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  )
}
```

- [ ] **Step 4: Run test**

Run: `npm run test -- src/components/transactions/SelectorSheet.test.tsx --run`

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/components/transactions/SelectorSheet.tsx src/components/transactions/SelectorSheet.test.tsx
git commit -m "Add searchable transaction selector sheet"
```

---

### Task 6: Transaction Form Defaults And No Advanced Mode

**Files:**
- Modify: `src/components/transactions/TransactionForm.tsx`
- Modify: `src/pages/AddTransaction.test.tsx`

- [ ] **Step 1: Write failing transaction form tests**

Add to `src/pages/AddTransaction.test.tsx`:

```ts
it('starts with empty category and wallet and no advanced button', () => {
  renderPage()

  expect(screen.getByRole('button', { name: 'Choose category' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Choose wallet' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Advanced details/i })).not.toBeInTheDocument()
})

it('requires category and wallet before saving an expense', () => {
  renderPage()
  fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '100' } })

  fireEvent.click(screen.getByRole('button', { name: 'Save transaction' }))

  expect(mockToastError).toHaveBeenCalledWith('Choose a category')
  expect(mockAddTransactionMutate).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/pages/AddTransaction.test.tsx --run`

Expected: FAIL because current form preselects category/wallet and shows Advanced details.

- [ ] **Step 3: Remove last-used restore behavior for new transactions**

In `TransactionForm.tsx`, delete the effects that set category from `LAST_CATEGORY_KEY` and wallet from `LAST_WALLET_KEY` for non-edit mode. Replace them with edit-only/default-empty behavior:

```ts
const [category, setCategory] = useState('')
const [walletId, setWalletId] = useState('')

useEffect(() => {
  if (editTransaction) return
  if (type === 'transfer' && !transferWalletId && wallets.length > 1) setTransferWalletId('')
}, [editTransaction, type, transferWalletId, wallets.length])
```

Keep edit prefill unchanged so editing existing transactions still loads saved values.

- [ ] **Step 4: Add category/wallet selector fields**

Import `SelectorSheet`. Replace `categoryChips()` and `walletSection()` in quick mode with button fields:

```tsx
<button type="button" onClick={() => setCategorySelectorOpen(true)} className="flex h-12 w-full items-center justify-between rounded-xl border border-input bg-secondary px-3 text-sm font-bold">
  <span>{category || 'Choose category'}</span>
  <ChevronDown className="h-4 w-4" />
</button>
<SelectorSheet
  open={categorySelectorOpen}
  title="Choose category"
  value={category}
  items={categoryItems}
  onSelect={setCategory}
  onOpenChange={setCategorySelectorOpen}
/>
```

Use wallet equivalents for `walletId`, showing `Choose wallet` when blank.

- [ ] **Step 5: Remove Advanced mode toggle**

Remove `showAdvanced`, `quickSections`, `advancedSections`, the `Advanced details` and `Fewer options` buttons. Extract the current JSX into named section constants and render one ordered form body:

```tsx
const formBody = (
  <>
    {variant === 'sheet' && <div className="flex justify-center">{typeToggle(true)}</div>}
    {amountDateSection}
    {descriptionSection}
    {type === 'transfer' ? transferWalletSelectors : (
      <>
        {categorySelector}
        {walletSelector}
      </>
    )}
    {type === 'expense' && splitCategorySection}
    {type === 'expense' && multiWalletSection}
    {type === 'transfer' && transferFeeSection}
    {saveBar()}
  </>
)
```

- [ ] **Step 6: Add validation before save**

At the top of `handleSave`, add:

```ts
if (type !== 'transfer' && !category) {
  toast.error('Choose a category')
  return false
}
if (!walletId) {
  toast.error(type === 'transfer' ? 'Choose a from wallet' : 'Choose a wallet')
  return false
}
if (type === 'transfer' && !transferWalletId) {
  toast.error('Choose a to wallet')
  return false
}
```

- [ ] **Step 7: Run tests**

Run: `npm run test -- src/pages/AddTransaction.test.tsx --run`

Expected: PASS after updating old tests that clicked wallet/category chips to use the new selector fields.

- [ ] **Step 8: Commit**

Run:

```bash
git add src/components/transactions/TransactionForm.tsx src/pages/AddTransaction.test.tsx
git commit -m "Simplify transaction form selection flow"
```

---

### Task 7: Inline Split, Multi-Wallet, Cash, And Transfer Fee Controls

**Files:**
- Modify: `src/components/transactions/TransactionForm.tsx`
- Test: `src/pages/AddTransaction.test.tsx`

- [ ] **Step 1: Write failing transfer fee test**

Extend `mockWallets` in `src/pages/AddTransaction.test.tsx` with a bank wallet:

```ts
{ id: 'bank', name: 'Bank', type: 'bank' as const, balance: 0, currency: 'IDR' },
```

Add:

```ts
it('shows transfer fee controls for bank transfers without advanced mode', () => {
  render(
    <MemoryRouter initialEntries={['/add?type=transfer']}>
      <AddTransaction />
    </MemoryRouter>
  )

  fireEvent.click(screen.getByRole('button', { name: 'Choose from wallet' }))
  fireEvent.click(screen.getByRole('button', { name: /Bank/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Choose to wallet' }))
  fireEvent.click(screen.getByRole('button', { name: /Cash/ }))

  expect(screen.getByRole('switch', { name: 'Transfer fee' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Advanced details/i })).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/pages/AddTransaction.test.tsx --run`

Expected: FAIL because transfer fee is hidden in current advanced/edit-only logic.

- [ ] **Step 3: Keep optional sections inline but collapsed by their own switches**

In `TransactionForm.tsx`, render the existing split, multi-wallet, cash assistant, and transfer fee cards directly in the single form body. Keep each feature controlled by its own switch:

```tsx
{type === 'expense' && categories.length >= 2 && splitCategorySection}
{type === 'expense' && wallets.length >= 2 && multiWalletSection}
{showCashAssistant && cashChangeSection}
{canUseTransferFee && transferFeeSection}
```

The existing JSX blocks can be extracted into these section constants during the refactor. Do not hide them behind Advanced details.

- [ ] **Step 4: Show transfer fee when bank is involved**

Add:

```ts
const fromWallet = wallets.find(w => w.id === walletId) ?? null
const toWallet = wallets.find(w => w.id === transferWalletId) ?? null
const canUseTransferFee = type === 'transfer' && (fromWallet?.type === 'bank' || toWallet?.type === 'bank' || Boolean(editTransaction))
```

Render the transfer fee card when `canUseTransferFee`.

- [ ] **Step 5: Ensure save passes transfer fee to existing save helper**

Keep existing `transferFeeEnabled` and `transferFeeAmount` in the `saveTransactionEntry` call. For new transfers, pass those values the same way edit mode already does.

- [ ] **Step 6: Run tests**

Run: `npm run test -- src/pages/AddTransaction.test.tsx --run`

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add src/components/transactions/TransactionForm.tsx src/pages/AddTransaction.test.tsx
git commit -m "Expose transaction optional controls inline"
```

---

### Task 8: Desktop Transaction Layout

**Files:**
- Modify: `src/components/layout/QuickAddSheet.tsx`
- Modify: `src/components/transactions/TransactionForm.tsx`
- Test: `src/components/layout/QuickAddSheet.test.tsx`

- [ ] **Step 1: Write failing desktop layout test**

Add to `src/components/layout/QuickAddSheet.test.tsx`:

```ts
const desktopState = vi.hoisted(() => ({ value: false }))

vi.mock('@/hooks/useIsDesktop', () => ({
  useIsDesktop: () => desktopState.value,
}))

it('uses a desktop side panel instead of the mobile bottom sheet on desktop', () => {
  desktopState.value = true
  render(<QuickAddSheet open onClose={vi.fn()} />)

  const dialog = screen.getByRole('dialog')
  expect(dialog).toHaveClass('right-0')
  expect(dialog).toHaveClass('max-w-3xl')
  expect(dialog).not.toHaveClass('rounded-t-3xl')
})
```

Replace the existing fixed `useIsDesktop: () => false` mock in `src/components/layout/QuickAddSheet.test.tsx` with the `desktopState` mock shown above.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/components/layout/QuickAddSheet.test.tsx --run`

Expected: FAIL because `QuickAddSheet` always uses a bottom sheet.

- [ ] **Step 3: Update QuickAddSheet**

In `QuickAddSheet.tsx`, import `useIsDesktop` and branch:

```tsx
const isDesktop = useIsDesktop()

<SheetContent
  side={isDesktop ? 'right' : 'bottom'}
  className={isDesktop
    ? 'w-full max-w-3xl overflow-y-auto border-border bg-background px-6 pb-6'
    : 'max-h-[92dvh] overflow-y-auto rounded-t-3xl border-border bg-background px-5 pb-safe-10'}
>
```

- [ ] **Step 4: Add desktop layout class hook in TransactionForm**

Wrap the main form body:

```tsx
<div className={variant === 'sheet' && isDesktop ? 'grid grid-cols-[minmax(0,1fr)_320px] gap-5' : 'space-y-2'}>
```

Put amount/type/date/note in the first column and selectors/options/save in the second column for desktop.

- [ ] **Step 5: Run test**

Run: `npm run test -- src/components/layout/QuickAddSheet.test.tsx --run`

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/components/layout/QuickAddSheet.tsx src/components/transactions/TransactionForm.tsx src/components/layout/QuickAddSheet.test.tsx
git commit -m "Improve desktop quick add layout"
```

---

### Task 9: Dashboard Spending Trend Cleanup

**Files:**
- Modify: `src/pages/Dashboard.tsx`
- Test: `src/pages/Dashboard.test.tsx`

- [ ] **Step 1: Write failing chart structure test**

Add to `src/pages/Dashboard.test.tsx`:

```ts
it('reserves chart label space for spending trend', () => {
  renderDashboard()

  const chart = screen.getByRole('img', { name: /Daily spending for the last 7 days/i })
  expect(chart).toHaveClass('pt-6')
  expect(screen.getByText('Today')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/pages/Dashboard.test.tsx --run`

Expected: FAIL if current chart lacks the reserved class or label structure.

- [ ] **Step 3: Update chart layout**

In `Dashboard.tsx`, replace the spending trend bar block classes:

```tsx
<div className="relative flex h-28 items-end gap-2 pt-6" role="img" aria-label={...}>
```

Move max-value labels inside the reserved top padding:

```tsx
{isMax && (
  <span className="absolute -top-5 left-1/2 max-w-[72px] -translate-x-1/2 truncate text-center text-[10px] font-bold text-foreground">
    {fmt(d.total)}
  </span>
)}
```

Keep day labels in a separate fixed row below the bars.

- [ ] **Step 4: Run test**

Run: `npm run test -- src/pages/Dashboard.test.tsx --run`

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/pages/Dashboard.tsx src/pages/Dashboard.test.tsx
git commit -m "Clean up dashboard spending trend"
```

---

### Task 10: Basic Offline Compatibility

**Files:**
- Modify: `src/lib/localStore.ts`
- Modify: `src/lib/queries.ts`
- Test: `src/lib/queries.test.tsx`

- [ ] **Step 1: Write failing offline persistence tests**

Add to `src/lib/queries.test.tsx` or extend the existing offline/local tests in that file:

```tsx
it('keeps budget rollover settings when adding a category offline', async () => {
  setCurrentUserForTest(null)

  const { result } = renderHook(() => useAddBudgetCategory(), { wrapper: queryWrapper })
  await act(async () => {
    await result.current.mutateAsync({
      name: 'Dining out',
      yearly_allocated: 500000,
      budget_period: 'monthly',
      reset_frequency: 'monthly',
      reset_start_day: 5,
      rollover_enabled: true,
      rollover_mode: 'custom_cap',
      rollover_cap: 100000,
      color: '#64748B',
      icon: '🍔',
    })
  })

  expect(localGetCategories()).toEqual(expect.arrayContaining([
    expect.objectContaining({
      name: 'Dining out',
      reset_frequency: 'monthly',
      reset_start_day: 5,
      rollover_enabled: true,
      rollover_mode: 'custom_cap',
      rollover_cap: 100000,
      icon: '🍔',
    }),
  ]))
})

it('queues budget setting updates when offline with an authenticated user', async () => {
  setCurrentUserForTest('user-1')
  setOfflineForTest(true)
  localAddCategory({
    name: 'Food',
    yearly_allocated: 500000,
    budget_period: 'monthly',
    color: '#64748B',
  })
  const food = localGetCategories().find(c => c.name === 'Food')!

  const { result } = renderHook(() => useUpdateBudgetCategory(), { wrapper: queryWrapper })
  await act(async () => {
    await result.current.mutateAsync({
      id: food.id,
      yearly_allocated: 600000,
      reset_frequency: 'monthly',
      reset_start_day: 10,
      rollover_enabled: true,
      rollover_mode: 'all_unused',
      rollover_cap: null,
    })
  })

  expect(readQueuedOperationsForTest()).toEqual(expect.arrayContaining([
    expect.objectContaining({
      table: 'budget_categories',
      op: 'update',
      data: expect.objectContaining({
        reset_start_day: 10,
        rollover_enabled: true,
        rollover_mode: 'all_unused',
      }),
    }),
  ]))
})
```

If the existing `src/lib/queries.test.tsx` uses different test helper names, add small exported test helpers in the relevant modules instead of changing behavior-only assertions.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/queries.test.tsx --run`

Expected: FAIL until the local/offline helpers and mutation payloads preserve the new fields.

- [ ] **Step 3: Implement guest/local persistence**

Ensure `localAddCategory` and `localUpdateCategory` preserve every new budget setting:

```ts
reset_frequency: patch.reset_frequency ?? existing.reset_frequency ?? existing.budget_period ?? 'monthly',
reset_start_day: patch.reset_start_day ?? existing.reset_start_day ?? 1,
rollover_enabled: patch.rollover_enabled ?? existing.rollover_enabled ?? false,
rollover_mode: patch.rollover_mode ?? existing.rollover_mode ?? 'all_unused',
rollover_cap: patch.rollover_cap ?? existing.rollover_cap ?? null,
```

- [ ] **Step 4: Implement queued sync payload preservation**

In `useAddBudgetCategory` and `useUpdateBudgetCategory`, ensure offline `enqueue(...)` payloads include `reset_frequency`, `reset_start_day`, `rollover_enabled`, `rollover_mode`, `rollover_cap`, `icon`, and `name` whenever provided.

- [ ] **Step 5: Run offline test**

Run: `npm run test -- src/lib/queries.test.tsx --run`

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/lib/localStore.ts src/lib/queries.ts src/lib/queries.test.tsx
git commit -m "Cover budget settings offline persistence"
```

---

### Task 11: Final Verification

**Files:**
- Review all modified files.

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm run test -- src/lib/budget.test.ts src/lib/queries.test.tsx src/pages/Budget.test.tsx src/pages/AddTransaction.test.tsx src/components/transactions/SelectorSheet.test.tsx src/components/layout/QuickAddSheet.test.tsx src/pages/Dashboard.test.tsx --run
```

Expected: all listed suites PASS.

- [ ] **Step 2: Run full test suite**

Run: `npm run test -- --run`

Expected: all suites PASS.

- [ ] **Step 3: Run build**

Run: `npm run build`

Expected: TypeScript build and Vite build complete successfully.

- [ ] **Step 4: Run lint**

Run: `npm run lint`

Expected: no lint errors.

- [ ] **Step 5: Manual smoke**

Start dev server:

```bash
npm run dev
```

Manually check:

- Budget page only shows funded allocations.
- Add budget can select an unfunded category.
- Budget editor saves reset frequency, reset start day, and rollover cap.
- New expense starts with blank category/wallet.
- Category selector opens a bottom sheet that leaves only amount visible and has safe bottom padding.
- Wallet selector behaves the same way.
- Split category and multi-wallet controls are reachable without Advanced details.
- Desktop quick add no longer looks like a mobile bottom sheet.
- Bank transfer shows transfer fee controls.
- Dashboard spending trend labels do not overlap.
- Guest/offline category creation keeps icon and rollover settings.
- Offline authenticated budget edits queue all new budget setting fields.

- [ ] **Step 6: Commit verification fixes if any**

If verification required fixes:

```bash
git add <fixed-files>
git commit -m "Fix verification issues for budget transaction polish"
```

If no fixes were required, do not create an empty commit.
