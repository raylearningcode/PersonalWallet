# Fix + Polish Round + Balancing Budget Category — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all failing tests and audit-found bugs, polish UI/UX for mobile and desktop, add the "Balancing" default budget category with auto-catch budget math, and ship it as a PR.

**Architecture:** Shared pure helpers (`lib/utils` dates, `lib/budget` balancing math, `lib/cashSave` split/cash payloads) are built and unit-tested first; pages then integrate them. A reusable `MoneyField` replaces every money input (custom keypad on mobile, native input on desktop). Bug fixes are grouped by file so no two tasks edit the same file. Work happens on branch `claude/fix-polish-balancing`.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Vitest 4, React Query 5, Tailwind 3, Capacitor 8, Supabase.

**Spec:** `docs/superpowers/specs/2026-08-28-wallet-polish-budget-balancing-design.md` — the plan argues from the spec; executors read both.

## Global Constraints

- Work on branch `claude/fix-polish-balancing`; commit after each task with the exact messages given.
- `npm run build` (`tsc -b && vite build`) must pass at every task boundary; full `npm test -- --run` must stay green from Task 1 onward (new tests added are expected to pass).
- Design language: card surfaces `rounded-[1.4rem]`; danger color `#FF8388`; warning color `#FFCF73`; no hardcoded Tailwind palette colors in new code.
- Desktop behavior for money inputs: plain editable inputs, external keyboard, no keypad panel. Mobile: custom keypad, native keyboard never opens.
- Date strings are `YYYY-MM-DD` built from LOCAL date parts — never `toISOString().slice(0,10)` for user-facing dates.
- All user-facing strings must be clean UTF-8 (no `â€”`, `Ã—`, `Â·`, `â†’`, `?EUR"` sequences).
- Do not rewrite existing transaction data (Approach B rejected in spec).

---

### Task 1: Fix the failing test suite (green baseline)

**Files:**
- Modify: `package.json` (add dependency)
- Modify: `src/components/layout/QuickAddSheet.test.tsx`
- Modify: `src/pages/Goals.test.tsx`
- Modify: `src/pages/Transactions.test.tsx`
- Modify: `src/lib/financeOs.test.ts`
- Modify: `src/pages/Reports.test.tsx`
- Modify: `vite.config.ts` (remove obsolete `external` entry)

**Interfaces:**
- Produces: a fully green test suite. Later tasks extend tests; anything regressing them is a task failure.

- [ ] **Step 1: Add the missing @capacitor/camera dependency**

In `package.json`, inside `"dependencies"` (keep alphabetical order with the other `@capacitor/*` entries), add:

```json
"@capacitor/camera": "^8.5.0",
```

Then run: `npm install`
Expected: install succeeds; `node_modules/@capacitor/camera` exists.

- [ ] **Step 2: Remove the now-unneeded build workaround in vite.config.ts**

Delete the `'@capacitor/camera'` entry from `build.rollupOptions.external` (the array becomes empty — keep the empty array or remove `external` entirely, matching surrounding style).

- [ ] **Step 3: Stub the camera module in QuickAddSheet.test.tsx**

Add at the top of `src/components/layout/QuickAddSheet.test.tsx`, next to the other `vi.mock` calls:

```tsx
vi.mock('@/lib/camera', () => ({
  takePhotoWithCamera: vi.fn(async () => null),
  isNativeCameraAvailable: vi.fn(async () => false),
  pickPhotoFromLibrary: vi.fn(),
}))
```

- [ ] **Step 4: Add the missing query hook to the Goals.test.tsx mock**

In `src/pages/Goals.test.tsx`, inside the existing `vi.mock('@/lib/queries', () => ({ ... }))` factory, add one line alongside the other hooks:

```tsx
useTransactions: () => ({ data: [] }),
```

- [ ] **Step 5: Make Transactions.test.tsx fixtures month-relative**

In `src/pages/Transactions.test.tsx`, near the top of the file (before the mock data), add:

```ts
const d = new Date()
const thisMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
```

Replace the three hardcoded fixture dates:
- `date: '2026-06-01'` → `date: `${thisMonth}-01``
- `date: '2026-06-02'` → `date: `${thisMonth}-02``
- any other `2026-06-*` dates in fixtures → same month via `` `${thisMonth}-${dd}` `` (check the file for all occurrences: lines ~29, 41, 53, and the "Old lunch" fixture used by the failing tests).

- [ ] **Step 6: Make financeOs.test.ts fixtures month-relative**

In `src/lib/financeOs.test.ts`, replace the frozen fixture dates with month-relative values:

```ts
const now = new Date()
const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
const todayMid = new Date(now.getFullYear(), now.getMonth(), 20) // mid-month, after pace math
const todayEarly = new Date(now.getFullYear(), now.getMonth(), 5)
```

Use `${thisMonth}-01` for transaction fixture dates and pass `todayMid`/`todayEarly` as the `today` arguments the tests already use (matching the existing test structure — the original tests were authored expecting mid-June dates and pace math of 55% spent / 16% of month elapsed; keep the same proportions with the computed dates).

- [ ] **Step 7: Make Reports.test.tsx expectations dynamic**

In `src/pages/Reports.test.tsx`, replace the hardcoded `'June 2026'` / `'May 2026'` strings:

```ts
const now = new Date()
const thisMonthLabel = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
const prevMonthLabel = prev.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
```

Use `thisMonthLabel` where the test asserted `'June 2026'` and `prevMonthLabel` where it asserted `'May 2026'` (the "moves between specific reporting periods" test navigates one period back).

- [ ] **Step 8: Run the full suite**

Run: `npm test -- --run`
Expected: all suites pass (0 failed, no failed suite). If any of the 14 previously-failing tests still fails, re-read its error and fix the fixture change in that file before moving on.

- [ ] **Step 9: Run the build**

Run: `npm run build`
Expected: PASS. (Removing the `external` entry must not break the build now that the dep is installed.)

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "test: green baseline — add @capacitor/camera dep, fix stale mocks and time-bomb fixtures"
```

---

### Task 2: Local-date helpers in lib/utils

**Files:**
- Modify: `src/lib/utils.ts` (add helpers)
- Test: `src/lib/utils.test.ts` (create)

**Interfaces:**
- Produces: `toLocalDateStr(d: Date): string`, `todayLocal(): string` — `YYYY-MM-DD` from local date parts; `safeGet(key: string): string | null` — non-throwing localStorage read. Used by every later task.

- [ ] **Step 1: Write failing tests**

Create `src/lib/utils.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { toLocalDateStr, todayLocal, safeGet } from './utils'

describe('toLocalDateStr', () => {
  it('formats from local date parts, not UTC', () => {
    // 2026-08-15 23:30 local in a UTC+8 zone would be 2026-08-15 (toISOString would give 2026-08-15 too);
    // use a time near local midnight to prove local-part math:
    const d = new Date(2026, 7, 28, 0, 30) // local Aug 28 00:30
    expect(toLocalDateStr(d)).toBe('2026-08-28')
  })
  it('pads month and day', () => {
    expect(toLocalDateStr(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})

describe('todayLocal', () => {
  it('equals toLocalDateStr(new Date())', () => {
    expect(todayLocal()).toBe(toLocalDateStr(new Date()))
  })
  it('matches /^\d{4}-\d{2}-\d{2}$/', () => {
    expect(todayLocal()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('safeGet', () => {
  it('returns the stored value', () => {
    localStorage.setItem('k', 'v')
    expect(safeGet('k')).toBe('v')
  })
  it('returns null when storage throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    expect(safeGet('k')).toBeNull()
    spy.mockRestore()
  })
})
```

(Add `vi` to the vitest imports for the safeGet test.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest --run src/lib/utils.test.ts`
Expected: FAIL — `toLocalDateStr` is not exported.

- [ ] **Step 3: Implement**

In `src/lib/utils.ts`, append:

```ts
/** Format a Date as YYYY-MM-DD using LOCAL date parts (never UTC). */
export function toLocalDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Today's date as YYYY-MM-DD in the user's local timezone. */
export function todayLocal(): string {
  return toLocalDateStr(new Date())
}

/** localStorage.getItem that never throws (private browsing, blocked storage). */
export function safeGet(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest --run src/lib/utils.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils.ts src/lib/utils.test.ts
git commit -m "feat: local-date helpers toLocalDateStr/todayLocal"
```

---

### Task 3: Balancing budget-math helpers in lib/budget

**Files:**
- Modify: `src/lib/budget.ts` (add helpers)
- Test: `src/lib/budget.test.ts` (extend)

**Interfaces:**
- Consumes: `Transaction`, `BudgetCategory` types from `@/types` (already exist); `toLocalDateStr` (Task 2, optional).
- Produces:
  - `getUnmatchedExpenses(transactions: Transaction[], categories: BudgetCategory[], periodDate: Date): Transaction[]` — expense transactions in `periodDate`'s month whose category matches no budget category name (case-insensitive).
  - `getSplitRemainders(transactions: Transaction[], periodDate: Date): number` — sum of positive `amount - sum(split_portions)` for split expenses in the month.
  - `getSplitAttribution(transactions: Transaction[], categories: BudgetCategory[], periodDate: Date): Record<string, number>` — portion amounts attributed per matching budget category name (lowercase keys).
  - `getBalancingSpent(transactions: Transaction[], categories: BudgetCategory[], periodDate: Date): number` — `unmatched total + split remainders` (NOT including direct 'Balancing' category matches; the Budget page sums those separately).

- [ ] **Step 1: Write failing tests**

Append to `src/lib/budget.test.ts`:

```ts
import { getUnmatchedExpenses, getSplitRemainders, getSplitAttribution, getBalancingSpent } from './budget'
import type { Transaction, BudgetCategory } from '@/types'

const periodDate = new Date(2026, 7, 15) // Aug 2026
const cats: BudgetCategory[] = [
  { id: 'c1', name: 'Food', yearly_allocated: 100, budget_period: 'monthly', color: '#fff' },
  { id: 'c2', name: 'Balancing', yearly_allocated: 0, budget_period: 'monthly', color: '#64748B' },
]
const tx = (partial: Partial<Transaction>): Transaction => ({
  id: 'x', description: 'x', amount: 10, original_amount: 10, original_currency: 'USD',
  type: 'expense', category: 'Food', date: '2026-08-05', needs_review: false, ...partial,
})

describe('balancing helpers', () => {
  const txs: Transaction[] = [
    tx({ id: 'a', category: 'Food', amount: 30 }),
    tx({ id: 'b', category: 'Other', amount: 12 }),
    tx({ id: 'c', category: 'Old Category', amount: 8 }),
    tx({ id: 'd', category: 'Split', amount: 50, split_portions: [
      { category: 'Food', amount: 40 }, { category: 'Old Category', amount: 5 },
    ] }),
    tx({ id: 'e', type: 'income', category: 'Wage', amount: 500 }),
    tx({ id: 'f', type: 'transfer', category: 'Transfer', amount: 20 }),
    tx({ id: 'g', category: 'Food', amount: 30, date: '2026-07-05' }), // wrong month
  ])

  it('getUnmatchedExpenses returns only unmatched expenses in the month', () => {
    const unmatched = getUnmatchedExpenses(txs, cats, periodDate)
    expect(unmatched.map(t => t.id).sort()).toEqual(['b', 'c', 'd'])
  })

  it('getSplitRemainders sums unallocated split leftovers', () => {
    // split 'd': 50 - (40+5) = 5
    expect(getSplitRemainders(txs, periodDate)).toBe(5)
  })

  it('getSplitAttribution attributes portions to matching categories', () => {
    const att = getSplitAttribution(txs, cats, periodDate)
    expect(att['food']).toBe(40)
    // 'Old Category' matches nothing → not attributed
    expect(att['old category']).toBeUndefined()
  })

  it('getBalancingSpent = unmatched total + remainders', () => {
    // unmatched: 12 + 8 + 50 = 70; remainders: 5
    expect(getBalancingSpent(txs, cats, periodDate)).toBe(75)
  })

  it('is case-insensitive on category names', () => {
    const t = [tx({ id: 'h', category: 'food', amount: 3 })]
    expect(getUnmatchedExpenses(t, cats, periodDate)).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest --run src/lib/budget.test.ts`
Expected: FAIL — imports don't exist.

- [ ] **Step 3: Implement helpers**

Append to `src/lib/budget.ts`:

```ts
import type { Transaction, BudgetCategory } from '@/types'

/** Expense transactions in periodDate's month whose category matches no budget category (case-insensitive). */
export function getUnmatchedExpenses(
  transactions: Transaction[],
  categories: BudgetCategory[],
  periodDate: Date,
): Transaction[] {
  const y = String(periodDate.getFullYear())
  const m = String(periodDate.getMonth() + 1).padStart(2, '0')
  const prefix = `${y}-${m}`
  const names = new Set(categories.map(c => c.name.toLowerCase()))
  return transactions.filter(t =>
    t.type !== 'income' && t.type !== 'transfer' &&
    t.date.startsWith(prefix) &&
    !names.has(t.category.toLowerCase()),
  )
}

/** Sum of positive split leftovers (amount − sum(portions)) for split expenses in the month. */
export function getSplitRemainders(transactions: Transaction[], periodDate: Date): number {
  const y = String(periodDate.getFullYear())
  const m = String(periodDate.getMonth() + 1).padStart(2, '0')
  const prefix = `${y}-${m}`
  return transactions.reduce((sum, t) => {
    if (t.type === 'income' || t.type === 'transfer' || !t.date.startsWith(prefix)) return sum
    if (!t.split_portions || t.split_portions.length === 0) return sum
    const allocated = t.split_portions.reduce((s, p) => s + p.amount, 0)
    return sum + Math.max(0, t.amount - allocated)
  }, 0)
}

/** Map of lowercased budget-category name → attributed split-portion total for the month. */
export function getSplitAttribution(
  transactions: Transaction[],
  categories: BudgetCategory[],
  periodDate: Date,
): Record<string, number> {
  const y = String(periodDate.getFullYear())
  const m = String(periodDate.getMonth() + 1).padStart(2, '0')
  const prefix = `${y}-${m}`
  const names = new Set(categories.map(c => c.name.toLowerCase()))
  const att: Record<string, number> = {}
  for (const t of transactions) {
    if (t.type === 'income' || t.type === 'transfer' || !t.date.startsWith(prefix)) continue
    if (!t.split_portions) continue
    for (const p of t.split_portions) {
      const key = p.category.toLowerCase()
      if (!names.has(key)) continue
      att[key] = (att[key] ?? 0) + p.amount
    }
  }
  return att
}

/** Unknown/unallocated spending that the Balancing category absorbs. */
export function getBalancingSpent(
  transactions: Transaction[],
  categories: BudgetCategory[],
  periodDate: Date,
): number {
  const unmatchedTotal = getUnmatchedExpenses(transactions, categories, periodDate)
    .reduce((s, t) => s + t.amount, 0)
  return unmatchedTotal + getSplitRemainders(transactions, periodDate)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest --run src/lib/budget.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/budget.ts src/lib/budget.test.ts
git commit -m "feat: balancing budget-math helpers (unmatched catch, split attribution, remainders)"
```

---

### Task 4: Shared split/cash save logic in lib/cashSave

**Files:**
- Create: `src/lib/cashSave.ts`
- Test: `src/lib/cashSave.test.ts`

**Interfaces:**
- Consumes: `splitChangeByPolicy`, `getFiftyCoinRouting`, `CashPolicy` from `@/lib/cashChange`; `parseNumberInput` from `@/lib/numberInput`; `Transaction`, `SplitPortion`, `WalletSplit` from `@/types`.
- Produces (all pure; `toBase(amount: number, currency: string): number` passed in as an argument):
  - `validateSplitAmounts(total: number, portions: { amount: string }[], currency: string): string | null` — null = OK; else user-facing error message.
  - `validateWalletSplits(total: number, splits: { amount: string }[], currency: string): string | null`
  - `buildSplitPortions(portions: { category: string; amount: string }[], currency: string, toBase: (n: number, c: string) => number): SplitPortion[]`
  - `buildWalletSplits(splits: { wallet_id: string; amount: string }[], currency: string, toBase: (n: number, c: string) => number): WalletSplit[]`
  - `planCashChange(amount: number, tendered: number, currency: string): { isTWD: boolean; bills: number; coins: number; change: number }` — uses `splitChangeByPolicy` with the stored fifty-coin routing for TWD; for non-TWD returns `{ isTWD: false, bills: 0, coins: change, change }`.
  - `buildChangeTransferPayloads(params: { savedTxId: string; safeDescription: string; walletId: string | null; changeBillsWalletId: string; changeCoinsWalletId: string; plan: { isTWD: boolean; bills: number; coins: number; change: number }; date: string; inputCurrency: string; toBase: (n: number, c: string) => number }): Partial<Transaction>[]` — returns 0–2 system-generated transfer payloads; every transfer requires `transfer_wallet_id !== walletId` (self-transfer guard built in).

- [ ] **Step 1: Write failing tests**

Create `src/lib/cashSave.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  validateSplitAmounts, validateWalletSplits, buildSplitPortions, buildWalletSplits,
  planCashChange, buildChangeTransferPayloads,
} from './cashSave'

const toBase = (n: number, _c: string) => n

describe('validateSplitAmounts', () => {
  it('accepts a fully-allocated split', () => {
    expect(validateSplitAmounts(100, [{ amount: '60' }, { amount: '40' }], 'USD')).toBeNull()
  })
  it('rejects fewer than 2 valid portions', () => {
    expect(validateSplitAmounts(100, [{ amount: '100' }], 'USD')).toMatch(/at least 2/i)
  })
  it('rejects empty amounts', () => {
    expect(validateSplitAmounts(100, [{ amount: '' }, { amount: '' }], 'USD')).toMatch(/amount/i)
  })
  it('rejects a sum below total', () => {
    expect(validateSplitAmounts(100, [{ amount: '30' }, { amount: '30' }], 'USD')).toMatch(/40/i)
  })
  it('rejects a sum above total', () => {
    expect(validateSplitAmounts(100, [{ amount: '70' }, { amount: '40' }], 'USD')).toMatch(/over/i)
  })
  it('uses exact equality for IDR (no decimals)', () => {
    expect(validateSplitAmounts(100000, [{ amount: '99999' }, { amount: '1' }], 'IDR')).toBeNull()
  })
})

describe('validateWalletSplits', () => {
  it('accepts a fully-allocated wallet split', () => {
    expect(validateWalletSplits(50, [{ amount: '20' }, { amount: '30' }], 'USD')).toBeNull()
  })
  it('rejects a mismatched sum', () => {
    expect(validateWalletSplits(50, [{ amount: '20' }, { amount: '20' }], 'USD')).toMatch(/10/i)
  })
})

describe('buildSplitPortions', () => {
  it('converts amounts to base and drops empty rows', () => {
    const out = buildSplitPortions(
      [{ category: 'Food', amount: '10' }, { category: 'Fun', amount: '' }], 'USD', toBase)
    expect(out).toEqual([{ category: 'Food', amount: 10 }])
  })
})

describe('buildWalletSplits', () => {
  it('converts amounts to base and keeps wallet ids', () => {
    const out = buildWalletSplits(
      [{ wallet_id: 'w1', amount: '7' }, { wallet_id: 'w2', amount: '3' }], 'USD', toBase)
    expect(out).toEqual([{ wallet_id: 'w1', amount: 7 }, { wallet_id: 'w2', amount: 3 }])
  })
})

describe('planCashChange', () => {
  it('splits TWD change into bills and coins', () => {
    const p = planCashChange(950, 1000, 'TWD')
    expect(p.isTWD).toBe(true)
    expect(p.change).toBe(50)
    expect(p.bills + p.coins).toBe(50)
  })
  it('routes non-TWD change entirely as coins', () => {
    const p = planCashChange(9, 10, 'USD')
    expect(p.isTWD).toBe(false)
    expect(p.coins).toBe(1)
    expect(p.bills).toBe(0)
  })
})

describe('buildChangeTransferPayloads', () => {
  const base = {
    savedTxId: 'tx1', safeDescription: 'Lunch', walletId: 'walletA',
    changeBillsWalletId: 'walletB', changeCoinsWalletId: 'walletC',
    date: '2026-08-28', inputCurrency: 'TWD', toBase,
  }
  it('builds bills+coins transfers for TWD', () => {
    const plan = planCashChange(750, 1000, 'TWD')
    const payloads = buildChangeTransferPayloads({ ...base, plan })
    expect(payloads).toHaveLength(2)
    expect(payloads.every(p => p.type === 'transfer' && p.is_system_generated && p.linked_transaction_id === 'tx1')).toBe(true)
    expect(payloads.map(p => p.transfer_wallet_id).sort()).toEqual(['walletB', 'walletC'])
  })
  it('skips a change wallet that equals the paying wallet', () => {
    const plan = planCashChange(750, 1000, 'TWD')
    const payloads = buildChangeTransferPayloads({ ...base, changeCoinsWalletId: 'walletA', plan })
    expect(payloads.some(p => p.transfer_wallet_id === 'walletA')).toBe(false)
  })
  it('returns no payloads when change is zero', () => {
    const payloads = buildChangeTransferPayloads({ ...base, plan: { isTWD: false, bills: 0, coins: 0, change: 0 } })
    expect(payloads).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest --run src/lib/cashSave.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement the module**

Create `src/lib/cashSave.ts`:

```ts
import type { SplitPortion, Transaction, WalletSplit } from '@/types'
import { parseNumberInput } from '@/lib/numberInput'
import { splitChangeByPolicy, getFiftyCoinRouting } from '@/lib/cashChange'

const TOLERANCE = 0.01

function sumValidAmounts(rows: { amount: string }[]): { total: number; validCount: number } {
  let total = 0
  let validCount = 0
  for (const r of rows) {
    const n = parseNumberInput(r.amount)
    if (Number.isFinite(n) && n > 0) { total += n; validCount += 1 }
  }
  return { total, validCount }
}

function validatePortionSum(total: number, rows: { amount: string }[], currency: string, label: string): string | null {
  const { total: sum, validCount } = sumValidAmounts(rows)
  if (validCount < 2) return `Enter at least 2 ${label} amounts`
  const diff = total - sum
  const tolerance = currency === 'IDR' ? 0 : TOLERANCE
  if (Math.abs(diff) > tolerance) {
    return diff > 0
      ? `${label} amounts are ${currency} ${formatShort(diff)} short of the total`
      : `${label} amounts are ${currency} ${formatShort(Math.abs(diff))} over the total`
  }
  return null
}

function formatShort(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

/** null = valid; otherwise a user-facing error message. */
export function validateSplitAmounts(total: number, portions: { amount: string }[], currency: string): string | null {
  return validatePortionSum(total, portions, currency, 'portion')
}

/** null = valid; otherwise a user-facing error message. */
export function validateWalletSplits(total: number, splits: { amount: string }[], currency: string): string | null {
  return validatePortionSum(total, splits, currency, 'wallet')
}

export function buildSplitPortions(
  portions: { category: string; amount: string }[],
  currency: string,
  toBase: (n: number, c: string) => number,
): SplitPortion[] {
  return portions
    .map(p => ({ category: p.category, amount: toBase(parseNumberInput(p.amount), currency) }))
    .filter(p => p.amount > 0)
}

export function buildWalletSplits(
  splits: { wallet_id: string; amount: string }[],
  currency: string,
  toBase: (n: number, c: string) => number,
): WalletSplit[] {
  return splits
    .map(w => ({ wallet_id: w.wallet_id, amount: toBase(parseNumberInput(w.amount), currency) }))
    .filter(w => w.amount > 0)
}

export interface CashChangePlan { isTWD: boolean; bills: number; coins: number; change: number }

export function planCashChange(amount: number, tendered: number, currency: string): CashChangePlan {
  const change = Math.max(0, tendered - amount)
  const isTWD = currency === 'TWD'
  if (!isTWD) return { isTWD: false, bills: 0, coins: change, change }
  const { bills, coins } = splitChangeByPolicy(change, { currency: 'TWD', routeFiftyCoinTo: getFiftyCoinRouting() })
  return { isTWD: true, bills, coins, change }
}

export interface ChangeTransferParams {
  savedTxId: string
  safeDescription: string
  walletId: string | null
  changeBillsWalletId: string
  changeCoinsWalletId: string
  plan: CashChangePlan
  date: string
  inputCurrency: string
  toBase: (n: number, c: string) => number
}

/** 0–2 system-generated change-transfer payloads (self-transfers guarded out). */
export function buildChangeTransferPayloads(p: ChangeTransferParams): Partial<Transaction>[] {
  if (p.plan.change <= 0 || !p.savedTxId) return []
  const payloads: Partial<Transaction>[] = []
  const basePayload = {
    type: 'transfer' as const,
    category: 'Transfer',
    wallet_id: p.walletId,
    recurring_rule_id: null,
    recurring_due_date: null,
    date: p.date,
    needs_review: false,
    is_system_generated: true,
    linked_transaction_id: p.savedTxId,
    cash_tendered: null,
  }

  if (p.plan.isTWD && p.plan.bills > 0 && p.changeBillsWalletId && p.changeBillsWalletId !== p.walletId) {
    payloads.push({
      ...basePayload,
      description: `Change bills — ${p.safeDescription}`,
      amount: p.toBase(p.plan.bills, p.inputCurrency),
      original_amount: p.plan.bills,
      original_currency: p.inputCurrency,
      transfer_wallet_id: p.changeBillsWalletId,
    })
  }
  if (p.plan.coins > 0 && p.changeCoinsWalletId && p.changeCoinsWalletId !== p.walletId) {
    const label = p.plan.isTWD ? 'Change coins' : 'Change'
    payloads.push({
      ...basePayload,
      description: `${label} — ${p.safeDescription}`,
      amount: p.toBase(p.plan.coins, p.inputCurrency),
      original_amount: p.plan.coins,
      original_currency: p.inputCurrency,
      transfer_wallet_id: p.changeCoinsWalletId,
    })
  }
  return payloads
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest --run src/lib/cashSave.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cashSave.ts src/lib/cashSave.test.ts
git commit -m "feat: shared split/cash save logic with hard validation and self-transfer guards"
```

---

### Task 5: MoneyField component (custom keypad mobile / plain input desktop)

**Files:**
- Create: `src/components/mobile/MoneyField.tsx`
- Test: `src/components/mobile/MoneyField.test.tsx`
- Modify: `src/components/mobile/MoneyKeypad.tsx` (only if `variant`/`doneLabel` props are missing — verify first)

**Interfaces:**
- Consumes: `MoneyKeypad` from `@/components/mobile/MoneyKeypad` (props: `value`, `onChange`, `currency`, `allowDecimal`, `quickAmounts`, `onDone`, `variant`, `doneLabel` — verify exact prop names before use); `useIsDesktop` from `@/hooks/useIsDesktop`.
- Produces:
  ```tsx
  export function MoneyField(props: {
    value: string
    onChange: (v: string) => void
    currency: string
    ariaLabel: string
    placeholder?: string
    className?: string      // applied to the input
    keypadDoneLabel?: string
    keypadQuickAmounts?: number[]
  }): JSX.Element
  ```
  - Mobile: `readOnly` input; tap/focus opens the keypad panel (sticky, safe-area, closes on outside tap and on `finpath-close-keypad` events).
  - Desktop: normal editable `<Input>`; no keypad.
  - Dispatches `finpath-keypad-change` custom events on open/close (existing app event name).

- [ ] **Step 1: Verify MoneyKeypad props**

Read `src/components/mobile/MoneyKeypad.tsx` and confirm the prop list used by QuickAddSheet (`value`, `onChange`, `currency`, `allowDecimal`, `quickAmounts`, `onDone`, `variant`, `doneLabel`). If names differ, note them and use the real ones in Step 3.

- [ ] **Step 2: Write failing tests**

Create `src/components/mobile/MoneyField.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MoneyField } from './MoneyField'

// jsdom: useIsDesktop matches min-width 1024 — desktop is the default true branch in tests
// unless the window is narrow; mock to force mobile:
vi.mock('@/hooks/useIsDesktop', () => ({ useIsDesktop: vi.fn(() => false) }))

describe('MoneyField (mobile)', () => {
  it('renders a readOnly input and opens the keypad on tap', () => {
    const onChange = vi.fn()
    render(<MoneyField value="12" onChange={onChange} currency="USD" ariaLabel="Amount" />)
    const input = screen.getByLabelText('Amount')
    expect(input).toHaveAttribute('readonly')
    fireEvent.click(input)
    // Keypad is rendered (MoneyKeypad is in the tree; assert by its confirm button label)
    expect(screen.getByRole('button', { name: /confirm amount/i })).toBeInTheDocument()
  })
  it('passes keypad edits to onChange', () => {
    const onChange = vi.fn()
    render(<MoneyField value="" onChange={onChange} currency="USD" ariaLabel="Amount" />)
    fireEvent.click(screen.getByLabelText('Amount'))
    fireEvent.click(screen.getByRole('button', { name: '5' }))
    expect(onChange).toHaveBeenCalledWith('5')
  })
})
```

Note: adjust the keypad button label assertions to match MoneyKeypad's actual digit-button aria-labels after reading it in Step 1.

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest --run src/components/mobile/MoneyField.test.tsx`
Expected: FAIL — module doesn't exist.

- [ ] **Step 4: Implement MoneyField**

Create `src/components/mobile/MoneyField.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { MoneyKeypad } from '@/components/mobile/MoneyKeypad'
import { useIsDesktop } from '@/hooks/useIsDesktop'

export function MoneyField(props: {
  value: string
  onChange: (v: string) => void
  currency: string
  ariaLabel: string
  placeholder?: string
  className?: string
  keypadDoneLabel?: string
  keypadQuickAmounts?: number[]
}) {
  const { value, onChange, currency, ariaLabel, placeholder, className, keypadDoneLabel, keypadQuickAmounts } = props
  const isDesktop = useIsDesktop()
  const [keypadOpen, setKeypadOpen] = useState(false)
  const fieldRef = useRef<HTMLInputElement>(null)

  const setOpen = (open: boolean) => {
    setKeypadOpen(open)
    window.dispatchEvent(new CustomEvent('finpath-keypad-change', { detail: { active: open } }))
  }

  useEffect(() => {
    const close = () => setOpen(false)
    window.addEventListener('finpath-close-keypad', close)
    return () => window.removeEventListener('finpath-close-keypad', close)
  }, [])

  return (
    <div>
      <Input
        ref={fieldRef}
        aria-label={ariaLabel}
        readOnly={!isDesktop}
        inputMode={isDesktop ? 'decimal' : undefined}
        className={className ?? 'bg-secondary'}
        placeholder={placeholder ?? '0'}
        value={value}
        onChange={e => onChange(e.target.value)}
        onClick={() => { if (!isDesktop) setOpen(true) }}
        onFocus={() => { if (!isDesktop) setOpen(true) }}
      />
      {!isDesktop && keypadOpen && (
        <div
          className="-mx-5 sticky z-20"
          style={{ bottom: 'calc(5.25rem + env(safe-area-inset-bottom, 0px))' }}
          data-money-keypad-panel
        >
          <MoneyKeypad
            value={value}
            onChange={onChange}
            currency={currency}
            allowDecimal={currency !== 'IDR'}
            quickAmounts={keypadQuickAmounts ?? (currency === 'TWD' ? [50, 100, 500, 1000] : [])}
            onDone={() => setOpen(false)}
            variant="panel"
            doneLabel={keypadDoneLabel ?? 'Confirm amount'}
          />
        </div>
      )}
    </div>
  )
}
```

Note: match MoneyKeypad's real prop names; also read how QuickAddSheet dismisses the keypad on outside pointer-down and reuse the same `data-money-keypad-panel` / `data-keypad-trigger` convention (add `data-keypad-trigger="amount"` to the input if MoneyKeypad or sheet logic keys off it).

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest --run src/components/mobile/MoneyField.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/mobile/MoneyField.tsx src/components/mobile/MoneyField.test.tsx
git commit -m "feat: MoneyField — custom keypad on mobile, plain input on desktop"
```

---

### Task 6: Budget page — Balancing integration + math fixes + stashed 3-column stat grid

**Files:**
- Modify: `src/lib/categories.ts` (add Balancing default)
- Modify: `src/pages/Budget.tsx`
- Modify: `src/pages/Budget.test.tsx` (add balancing test)
- Test: `src/lib/budget.test.ts` (already covers helpers — no change)

**Interfaces:**
- Consumes: `getBalancingSpent`, `getSplitAttribution`, `getUnmatchedExpenses` (Task 3); `useAddBudgetCategory` (existing query hook).
- Produces: Budget page shows a Balancing row (or Unassigned prompt), split-attributed spending, fixed daily/yearly math, 3-column stat grid.

- [ ] **Step 1: Add Balancing to default categories**

In `src/lib/categories.ts`, append to `DEFAULT_BUDGET_CATEGORIES`:

```ts
{ name: 'Balancing', yearly_allocated: 0, budget_period: 'monthly', color: '#64748B' },
```

- [ ] **Step 2: Budget page — split attribution + balancing math**

In `src/pages/Budget.tsx`:
- Extend the import from `@/lib/budget` with the new helpers.
- In `categoriesWithSpent`, after computing the exact-match `spent`, add split attribution:

```ts
const splitAtt = getSplitAttribution(expenseTransactions, categories, periodDate)

const categoriesWithSpent = useMemo(() => {
  const att = getSplitAttribution(expenseTransactions, categories, periodDate)
  return categories.map(cat => {
    const direct = expenseTransactions
      .filter(t => t.category === cat.name && isInBudgetPeriod(t.date, cat.budget_period ?? 'yearly', periodDate))
      .reduce((s, t) => s + t.amount, 0)
    return {
      ...cat,
      budget_period: cat.budget_period ?? 'yearly',
      spent: direct + (att[cat.name.toLowerCase()] ?? 0),
    }
  })
}, [categories, expenseTransactions, periodDate])
```

(Note: also add `periodDate` to the deps — the old memo was missing it.)

- [ ] **Step 3: Balancing row / Unassigned prompt**

Below the `noBudget` block (before the closing of the `categoriesWithSpent.length > 0` branch), compute:

```ts
const balancingSpent = getBalancingSpent(expenseTransactions, categories, periodDate)
const balancingCat = categoriesWithSpent.find(c => c.name.toLowerCase() === 'balancing')
```

Render one of:
- If `balancingCat` exists: show it as an extra row in the allocation list with `spent: balancingCat.spent + balancingSpent` and a small "Includes unknown & unallocated" caption (its budget/color come from the category; it participates in Active budgets or No budget set based on its `yearly_allocated`).
- If not: render an "Unassigned" card between the two sections:

```tsx
{balancingSpent > 0 && !balancingCat && (
  <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#FFCF73]/30 bg-[#FFCF73]/5 px-5 py-4">
    <div>
      <p className="text-sm font-extrabold text-foreground">Unassigned spending — {fmt(balancingSpent)}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">Unknown categories and split leftovers. Add a Balancing category to track them.</p>
    </div>
    <Button size="sm" variant="secondary" onClick={async () => {
      try {
        await addCategory.mutateAsync({ name: 'Balancing', yearly_allocated: 0, budget_period: 'monthly', color: '#64748B' })
        toast.success('Balancing category added')
      } catch { toast.error('Failed to add Balancing category') }
    }}>Add Balancing</Button>
  </div>
)}
```

Include `balancingSpent` in `totalSpent`/`remaining` (so stats reconcile): change the `totalSpent` memo to add `+ balancingSpent`.

- [ ] **Step 4: Budget math fixes (from audit M4/M5)**

- Daily allowance per category: only when `cat.budget_period === 'monthly'`:

```ts
const catDailyAllowance = cat.budget_period === 'monthly' && cat.yearly_allocated > cat.spent && daysLeft > 0
  ? (cat.yearly_allocated - cat.spent) / daysLeft
  : null
```

- Yearly "monthly-equivalent spent": cap yearly spent to transactions on/before the viewed month end. In `categoriesWithSpent`, for yearly categories filter additionally by `t.date <= lastDayOfViewedMonth` where `lastDayOfViewedMonth` is `\`${currentYear}-${String(periodDate.getMonth() + 1).padStart(2, '0')}-${daysInMonth}\`` — pass this via a memoized variable and use it inside `isInBudgetPeriod`-filtered yearly sums; keep `monthsElapsed` division as-is (it then divides Jan–viewed-month spend by elapsed months).

- [ ] **Step 5: Re-apply stashed 3-column stat grid**

In the stats row (currently `grid grid-cols-2 gap-4 sm:grid-cols-4 lg:gap-6`), apply the stashed version:

```tsx
<div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3 lg:gap-6">
  <StatCard label="Monthly budget" value={fmt(totalAllocated)} sub={money.formatRef(totalAllocated) ?? 'Blended monthly equivalent'} />
  <StatCard label="Remaining" value={fmt(hasData ? remaining : 0)} sub={money.formatRef(hasData ? remaining : 0) ?? 'Safe inside active periods'} badgeVariant={hasData && remaining < 0 ? 'danger' : 'success'} />
  <StatCard label="Overspend risk" value={hasData ? risk : 'None'} sub={hasData && totalAllocated > 0 ? `${Math.round((totalSpent / totalAllocated) * 100)}% of budget used` : 'No categories yet'} badgeVariant={hasData ? riskVariant[risk] : undefined} />
</div>
```

(Removes the top-row "Daily allowance" card; the per-category Daily view stays.)

- [ ] **Step 6: Add a Budget page test for the Unassigned card**

In `src/pages/Budget.test.tsx`, add a test that renders Budget with a mock transaction whose category is `'Other'` and a `useBudgetCategories` mock returning only `Food`, then asserts the text `Unassigned spending` appears. Follow the file's existing mock style (read the top of the file first and mirror it).

- [ ] **Step 7: Run tests + build**

Run: `npx vitest --run src/pages/Budget.test.tsx src/lib/budget.test.ts` then `npm run build`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/categories.ts src/pages/Budget.tsx src/pages/Budget.test.tsx
git commit -m "feat: Balancing category in budget — auto-catch unknown spending, split attribution, math fixes, 3-col stats"
```

---

### Task 7: QuickAddSheet rework — cashSave integration, validation, MoneyField, mojibake re-encode

**Files:**
- Modify: `src/components/layout/QuickAddSheet.tsx`
- Modify: `src/components/layout/QuickAddSheet.test.tsx` (extend with validation tests)

**Interfaces:**
- Consumes: `validateSplitAmounts`, `validateWalletSplits`, `buildSplitPortions`, `buildWalletSplits`, `planCashChange`, `buildChangeTransferPayloads` (Task 4); `MoneyField` (Task 5); `todayLocal` (Task 2).
- Produces: QuickAddSheet that blocks invalid splits/cash, routes change without self-transfers, uses MoneyField for all money inputs, resets cash/split state on wallet/type switch, and contains zero mojibake.

- [ ] **Step 1: Re-encode mojibake strings**

Replace every corrupted sequence with the real character across the file:
- `?"EUR?"EUR` → `──` (section dividers) — restore original em-dash-style dividers `—`
- `?EUR"` → `—`
- `?+'` → `→`
- `?--` → `−` (minus sign in remove buttons — use `−`)
- `?oe"` → `✓`
- `??` → `→`
- `?EUR?` → `…`
- `Saving?EUR?` → `Saving…`
Verify with: `grep -rn 'EUR\|?+' src/components/layout/QuickAddSheet.tsx` → no matches.

- [ ] **Step 2: Replace date default with todayLocal**

- Line ~51: `useState(() => new Date().toISOString().slice(0, 10))` → `useState(todayLocal)`
- Line ~145 in `reset()`: same replacement.
- Import `{ todayLocal } from '@/lib/utils'`.

- [ ] **Step 3: Hard validation in handleSave**

In `handleSave`, after the existing amount/cash checks and before building `computedSplitPortions`/`computedWalletSplits`:

```ts
const parsedAmount = parseNumberInput(amount)
const splitError = splitEnabled ? validateSplitAmounts(parsedAmount, splitPortions, inputCurrency) : null
if (splitError) { toast.error(splitError); return }
const walletSplitError = multiWalletEnabled ? validateWalletSplits(parsedAmount, walletSplits, inputCurrency) : null
if (walletSplitError) { toast.error(walletSplitError); return }
if (cashEnabled && type === 'expense' && (!Number.isFinite(parseNumberInput(cashTendered)) || parseNumberInput(cashTendered) <= 0)) {
  toast.error('Enter the cash amount given'); return
}
```

- [ ] **Step 4: Replace inline split/change logic with cashSave**

Replace the `computedSplitPortions`/`computedWalletSplits` blocks with:

```ts
const computedSplitPortions = splitEnabled
  ? buildSplitPortions(splitPortions, inputCurrency, money.toBase)
  : null
const computedWalletSplits = multiWalletEnabled
  ? buildWalletSplits(walletSplits, inputCurrency, money.toBase)
  : null
```

Replace the whole change-transfer block (after `addTransaction.mutateAsync`) with:

```ts
if (cashEnabled && baseChange > 0 && savedTx?.id) {
  const plan = planCashChange(parsedAmount, parsedTendered, inputCurrency)
  const changePayloads = buildChangeTransferPayloads({
    savedTxId: savedTx.id, safeDescription, walletId,
    changeBillsWalletId, changeCoinsWalletId,
    plan, date, inputCurrency,
    toBase: money.toBase,
  })
  for (const p of changePayloads) {
    try { await addTransaction.mutateAsync(p as Parameters<typeof addTransaction.mutateAsync>[0]) }
    catch (err) { console.error('Failed to create change transfer:', err); toast.error('Failed to route change') }
  }
  if (changePayloads.length > 0) {
    try { await updateTransaction.mutateAsync({ id: savedTx.id, linked_transaction_id: changePayloads[0].id ?? undefined as any }) }
    catch { /* link failure is non-fatal */ }
  }
}
```

(Adapt types: the payloads omit `id`; the linking step needs the created ids — capture each `await addTransaction.mutateAsync(payload)` result and use its `id`, mirroring the old `changeTxIds` array but with payloads from the helper. Keep the Undo toast behavior using the collected ids.)

- [ ] **Step 5: Self-transfer + reset guards**

- In the quick-mode wallet picker and advanced wallet select `onChange`, the existing handlers already call `setCashEnabled(false); setCashTendered('')` in quick mode — add the same to the advanced select, and also reset `setSplitEnabled(false)`, `setMultiWalletEnabled(false)`.
- In the advanced type switch (line ~663), add `setCashEnabled(false); setCashTendered('')` alongside the existing resets (the audit found it missing there).
- Coins/bills wallet selects (inside `CashChangeAssistant` props or wherever `changeCoinsWalletId`/`changeBillsWalletId` are chosen): disable the option equal to `walletId` (add `disabled={w.id === walletId}` to those option lists).

- [ ] **Step 6: Replace money inputs with MoneyField**

- Main amount input (quick + advanced): replace the `<Input ... data-keypad-trigger>` blocks + their separate `<MoneyKeypad>` panels with `<MoneyField value={amount} onChange={setAmount} currency={inputCurrency} ariaLabel="Amount" className="h-16 w-44 cursor-pointer border-0 bg-transparent text-center text-5xl font-extrabold shadow-none focus-visible:ring-0" keypadDoneLabel="Confirm amount" />` (keep the same className so visuals don't change).
- Cash tendered input inside `CashChangeAssistant` (read that component to find its `Input`; replace with `MoneyField` if it is a money input).
- Each split-portion amount `Input` → `MoneyField` with `className="h-10 w-28 rounded-lg bg-secondary text-sm font-extrabold"` and `ariaLabel={\`Portion ${i + 1} amount\`}`.
- Each wallet-split amount `Input` → `MoneyField` similarly.
- Remove now-unused `activeKeypad` state, `setActiveKeypad` wrapper, the `finpath-keypad-change` dispatcher, and the two inline `MoneyKeypad` panel blocks + `amountInputRef` if unused.

- [ ] **Step 7: Extend tests**

In `QuickAddSheet.test.tsx`, add tests:
- Saving with split toggle on and empty amounts shows the validation toast and does NOT call the add mutation (assert `useAddTransaction` mock not called).
- Saving with split portions summing short shows the "short of the total" toast.
- Saving cash mode with empty tendered shows "Enter the cash amount given".
Follow the file's existing render/mock helpers.

- [ ] **Step 8: Run tests + build**

Run: `npx vitest --run src/components/layout/QuickAddSheet.test.tsx` then `npm run build`
Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
git add src/components/layout/QuickAddSheet.tsx src/components/layout/QuickAddSheet.test.tsx
git commit -m "fix: QuickAddSheet — hard split/cash validation, shared cashSave logic, MoneyField inputs, mojibake re-encode"
```

---

### Task 8: AddTransaction rework — same integration + mojibake + MoneyField

**Files:**
- Modify: `src/pages/AddTransaction.tsx`

**Interfaces:**
- Consumes: cashSave helpers (Task 4), `MoneyField` (Task 5), `todayLocal` (Task 2).
- Produces: AddTransaction with identical validation/routing behavior to QuickAddSheet, no mojibake, MoneyField inputs, `isTWD` from input currency only.

- [ ] **Step 1: Re-encode mojibake**

Same replacement table as Task 7 Step 1. Verify with: `grep -rn 'EUR\|â€' src/pages/AddTransaction.tsx` → no matches (also fixes the AI toast "Set up your AI API in Settings → AI Features").

- [ ] **Step 2: Date default**

Line ~61 `new Date().toISOString().slice(0, 10)` → `todayLocal()`.

- [ ] **Step 3: isTWD fix (audit L9)**

Find `isTWD = inputCurrency === 'TWD' || selectedWallet?.currency === 'TWD'` → `const isTWD = inputCurrency === 'TWD'`.

- [ ] **Step 4: Integrate validation + change routing**

Mirror Task 7 Steps 3–5 in this file (its save flow is the duplicate identified in the audit — same structure): add split/wallet-split/cash validation via cashSave; replace inline change-transfer creation with `planCashChange` + `buildChangeTransferPayloads`; disable change-wallet options equal to the paying wallet; reset cash/split state when wallet/type changes.

- [ ] **Step 5: Replace money inputs with MoneyField**

Replace the amount, cash-tendered, and split-portion inputs with `MoneyField` (keep existing classNames), remove inline keypad panels.

- [ ] **Step 6: Run tests + build**

Run: `npx vitest --run src/pages/AddTransaction.test.tsx` (if the file exists) + `npm run build`
Expected: PASS. If `AddTransaction.test.tsx` doesn't exist, skip the test run; the Transactions suite must still pass (it exercises the page indirectly only — verify no import breaks).

- [ ] **Step 7: Commit**

```bash
git add src/pages/AddTransaction.tsx
git commit -m "fix: AddTransaction — cashSave integration, MoneyField, isTWD fix, mojibake re-encode"
```

---

### Task 9: Transactions page — timezone, stashed Net-flow stat, long-press, memo deps, mark-reviewed, empty state, mojibake

**Files:**
- Modify: `src/pages/Transactions.tsx`
- Modify: `src/pages/Transactions.test.tsx` (add/adjust for Net flow + empty state if cheap; at minimum keep existing green)

**Interfaces:**
- Consumes: `todayLocal`, `toLocalDateStr` (Task 2).
- Produces: Transactions page with correct month defaults, Net flow stat card, fixed long-press/memo/review bugs, "Show all dates" empty-state escape hatch, no mojibake.

- [ ] **Step 1: Re-encode mojibake**

Replace `â€”` → `—`, `Ã—` → `×`, `Â·` → `·`, `â†’` → `→` across the file (audit listed ~35 lines, e.g. 264, 428, 443, 576, 1073). Verify: `grep -n 'â€\|Ã—\|Â·\|â†' src/pages/Transactions.tsx` → no matches.

- [ ] **Step 2: Timezone fixes**

- `getLastDay(year, month)` helper (line ~48): if it uses `toISOString()`, rebuild from local parts: `const d = new Date(year, month, 0); return toLocalDateStr(d)`.
- Default `dateTo` (line ~70) and default tx date (line ~80) and month presets (lines ~815-835): replace `toISOString().slice(0, 10)` with `toLocalDateStr(...)`/`todayLocal()`.
- Also fix any `new Date(t.date)` parsing used for grouping where a `t.date` string could parse as UTC — prefer string comparisons on `YYYY-MM-DD` (existing code mostly does; only change what's needed).

- [ ] **Step 3: Re-apply stashed Net-flow stat**

Replace the 2-stat block (audit showed it at lines ~885-905) with the stashed 3-stat version:

```tsx
<div className="mb-9 grid grid-cols-2 gap-4 lg:grid-cols-3 lg:gap-6">
  {(() => {
    const net = moneyIn - moneyOut
    const netCount = transactions.filter(t => t.type !== 'transfer').length
    return [
      { label: 'Money in', value: money.formatDisplay(moneyIn), dot: 'bg-primary', sub: `${transactions.filter(t => t.type === 'income').length} income entries` },
      { label: 'Money out', value: money.formatDisplay(moneyOut), dot: 'bg-[#FF8388]', sub: `${transactions.filter(t => t.type === 'expense').length} expenses` },
      { label: 'Net flow', value: `${net >= 0 ? '+' : ''}${money.formatDisplay(net)}`, dot: net >= 0 ? 'bg-primary' : 'bg-[#FF8388]', sub: `${netCount} transactions` },
    ]
  })().map(({ label, value, dot, sub }) => (
    <div key={label} className="relative rounded-[1.4rem] border border-border bg-card px-6 py-5">
      <span className={`absolute right-7 top-7 h-4 w-4 rounded-full ${dot}`} />
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-extrabold tabular-nums text-foreground">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
    </div>
  ))}
</div>
```

(Keep the existing card's inner classes if they differ — match the file's current card markup; the change is 2 → 3 cards with these labels/subs.)

- [ ] **Step 4: Long-press scroll fix (audit M3)**

In the pointer handlers (~lines 1724-1765): in the vertical-scroll branch (where `dy >= dx` and the swipe ref is nulled) also clear the long-press timer; and add an `onPointerCancel` handler that clears both.

- [ ] **Step 5: Memo deps + mark-reviewed (audit L4/L7)**

- Add `wallets` to the `sortedTransactions` memo dependency array.
- `handleMarkReviewed`: call it only when the save succeeded — make `handleSaveTransaction` return a boolean (or rethrow) and gate `handleMarkReviewed` on it.

- [ ] **Step 6: Empty-state escape hatch**

Where the history renders "No transactions yet" (the empty state), add below it:

```tsx
{dateFrom || dateTo ? (
  <button
    type="button"
    onClick={() => { setDateFrom(''); setDateTo('') }}
    className="mt-3 text-sm font-bold text-primary hover:underline"
  >
    Show all dates
  </button>
) : null}
```

Adjust the "No transactions yet" copy so it says "No transactions in this period" when a filter is active.

- [ ] **Step 7: Wrap unguarded mutations (audit M2)**

Wrap `handleDuplicateTransaction`, `bulkChangeCategory`, `handleMarkReviewed`, `runDueRecurringRules` bodies in try/catch with `toast.error('...')` on failure (each already has a success toast; add the catch).

- [ ] **Step 8: Run tests + build**

Run: `npx vitest --run src/pages/Transactions.test.tsx` then `npm run build`
Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
git add src/pages/Transactions.tsx src/pages/Transactions.test.tsx
git commit -m "fix: Transactions — local dates, Net flow stat, long-press/memo/review fixes, empty-state escape, mojibake"
```

---

### Task 10: Subscriptions detail-sheet save fix

**Files:**
- Modify: `src/pages/Subscriptions.tsx`

**Interfaces:**
- Consumes: existing `useUpdateRecurringRule` (verify hook name in the file).
- Produces: detail sheet "Save changes" works on mobile and desktop.

- [ ] **Step 1: Fix editTarget wiring**

In `openDetail` (line ~228), set the edit state the save handler reads. Read `handleEdit` (line ~260) to see its exact guard (`if (!editTarget) return`), then in `openDetail` set `setEditTarget(detailRule)` (or the equivalent state used). If `editForm` holds the editable values, initialize it from the rule in `openDetail` too.

- [ ] **Step 2: Add failure toast**

Wrap the update mutation call in `handleEdit` with try/catch and `toast.error('Failed to save changes')` on error (success toast may already exist — keep both).

- [ ] **Step 3: Test**

Run: `npx vitest --run src/pages/Subscriptions.test.tsx` — if a save-flow test exists extend it (click Save in detail sheet → assert update mutation called); otherwise add a minimal one following the file's mock style. Then `npm run build`.
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Subscriptions.tsx src/pages/Subscriptions.test.tsx
git commit -m "fix: Subscriptions detail sheet Save now updates the rule"
```

---

### Task 11: CategoryDetail rules-of-hooks fix

**Files:**
- Modify: `src/pages/CategoryDetail.tsx`

**Interfaces:**
- Produces: no conditional hooks; page can't crash on late category load.

- [ ] **Step 1: Move hooks above early returns**

Move every hook call (the `useMemo` at lines ~139-145 and any other hooks below the `if (catPending)` / `if (!category)` returns) to the top of the component, before the early returns. The memos can reference `category` and return empty defaults when `!category` (e.g. `if (!category) return []` inside the memo body).

- [ ] **Step 2: Test + build**

Run: `npx vitest --run src/pages/CategoryDetail.test.tsx` (if exists) + `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/pages/CategoryDetail.tsx
git commit -m "fix: CategoryDetail — hoist hooks above early returns (rules-of-hooks crash)"
```

---

### Task 12: Settings — split-aware balances, AI section, dead links, safeGet

**Files:**
- Modify: `src/pages/Settings.tsx`
- Modify: `src/lib/ai.ts` (AI key helpers already exist — verify names)
- Modify: `src/pages/DesktopTools.tsx` (AI link target)
- Test: `src/pages/Settings.test.tsx` (extend)

**Interfaces:**
- Consumes: `getWalletBalances` from `@/lib/financeOs`; `getAiKey/saveAiKey` from `@/lib/ai` (verify exact export names first); `safeGet` from `@/lib/utils` (Task 2).
- Produces: Settings wallet balances match Dashboard; an "AI Features" tab/section where users paste a Gemini key; DesktopTools AI link works; safe localStorage reads; mutation failures toast.

- [ ] **Step 1: Wallet balances via getWalletBalances**

Replace the inline `walletBalances` replay (lines ~167-178) with:

```ts
import { getWalletBalances } from '@/lib/financeOs'
const walletBalances = getWalletBalances(wallets, transactions)
```

Verify the return shape in `src/lib/financeOs.ts` and adjust the render code that consumed the old map (likely `Record<walletId, balance>` — match its shape).

- [ ] **Step 2: Add AI section**

Add a new tab `'ai'` to the Settings tab list (`'profile' | 'wallets' | 'categories' | 'security' | 'backup' | 'ai'`) with a panel: a password-style input bound to `getAiKey()` (or the current storage name in ai.ts), a Save button calling `saveAiKey(value)` with a toast, and copy: "Paste your Gemini API key to enable AI insights and receipt scanning. The key is stored on this device and sent only to Google's Gemini API." Reuse the existing tab UI pattern (read the tabs render code first and mirror it).

- [ ] **Step 3: Fix dead links**

- Mobile "Desktop tools" row (line ~572): make it a `Link to="/desktop-tools"` (or add onClick navigate) so it navigates like the rows above it.
- `DesktopTools.tsx` AI link: change `/settings?section=ai` → `/settings/ai` if the app's Settings route supports a path param, otherwise keep query but have Settings read `?section=ai` and select the `ai` tab on mount (pick whichever the router setup supports — check `App.tsx` route for Settings).

- [ ] **Step 4: safeGet for localStorage reads**

Wrap the localStorage reads in Settings state initializers (lines ~150-161) with `safeGet` imported from `@/lib/utils`.

- [ ] **Step 4b: Mutation try/catch (audit M2)**

Wrap `saveProfile`, `saveCurrency`, `handleSignIn`, `handleSignUp` and the `signOut.mutateAsync()` call in try/catch with `toast.error('Something went wrong — please try again')` (or per-action copy) on failure.

- [ ] **Step 5: Test + build**

Extend `Settings.test.tsx`: rendering the AI tab shows the key input; saving calls `saveAiKey` (mock `@/lib/ai`). Run: `npx vitest --run src/pages/Settings.test.tsx` + `npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Settings.tsx src/pages/Settings.test.tsx src/pages/DesktopTools.tsx
git commit -m "feat: Settings — split-aware balances, AI key section, fixed dead links"
```

---

### Task 13: PinLock — session key, real hash, keyboard input

**Files:**
- Modify: `src/components/layout/PinLock.tsx`

**Interfaces:**
- Consumes: `PIN_SESSION_KEY` constant (already exported); `crypto.subtle` (WebCrypto, available in secure contexts).
- Produces: unlock persists per session; PIN stored as salted SHA-256; desktop keyboard digits work; first press after error registers.

- [ ] **Step 1: Salted SHA-256 instead of btoa**

Replace `hashPin`:

```ts
const PIN_SALT = 'finpath-pin-salt-v1'

async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(`${PIN_SALT}:${pin}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}
```

Storage key stays the same; the stored value format changes. Read the stored value and compare `await hashPin(entered) === stored`. (Existing users' btoa values will fail comparison — treat a stored value that doesn't look like 64-hex as legacy and re-verify via the old btoa comparison once, then re-store hashed on success.)

- [ ] **Step 2: Write session key on unlock**

In the unlock success path (`onUnlock`), add:

```ts
try { sessionStorage.setItem(PIN_SESSION_KEY, '1') } catch { /* ignore */ }
```

- [ ] **Step 3: Physical keyboard input + first-press-after-error**

- Add a `keydown` listener on the lock screen: digits `0-9` append, `Backspace` removes, `Escape` cancels.
- In the digit press handler, when `error` is shown: clear the error AND register the pressed digit (current code swallows it — restructure so the digit is always appended).

- [ ] **Step 4: Test + build**

Run: `npx vitest --run src/pages/Settings.mobile.test.tsx src/pages/Settings.test.tsx` (they exercise PIN flows) + `npm run build`
Expected: PASS. If a test asserts the old btoa hash format, update the assertion to the legacy-compat behavior.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/PinLock.tsx
git commit -m "fix: PIN — session unlock persistence, salted SHA-256, keyboard input"
```

---

### Task 14: lib fixes A — syncQueue, offlineCache, queries dedupe

**Files:**
- Modify: `src/lib/syncQueue.ts`
- Modify: `src/lib/offlineCache.ts`
- Modify: `src/lib/queries.ts` (dedupe at ~line 190)

**Interfaces:**
- Consumes: existing signatures (read files first).
- Produces:
  - `isNetworkError` narrows to fetch-related `TypeError`s only.
  - Non-network errors keep the item with a retry counter instead of dropping.
  - `getQueue()` tolerates malformed entries (filter per entry).
  - `useAddTransaction` success prepends deduped (filters temp id).

- [ ] **Step 1: Narrow isNetworkError**

In `syncQueue.ts`, replace the blanket `err instanceof TypeError` check with a fetch signature check:

```ts
function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) {
    const msg = err.message.toLowerCase()
    return msg.includes('fetch') || msg.includes('network') || msg.includes('failed to fetch') || msg.includes('load failed')
  }
  return false
}
```

- [ ] **Step 2: Retry counter instead of permanent drop**

In the queue processing loop, keep the existing "drop item" behavior ONLY for known-permanent failures (HTTP 4xx except 429, or Supabase error codes 23505 duplicate / 404). For other non-network errors, re-enqueue the item with an incremented `attempts` field (add `attempts?: number` to the queued item shape, default 0) and stop processing that item once `attempts >= 5`.

- [ ] **Step 3: Tolerant queue reads**

In `offlineCache.ts` `getQueue()`, parse the stored JSON inside a try/catch per entry:

```ts
try {
  const parsed = JSON.parse(raw)
  if (!Array.isArray(parsed)) return []
  return parsed.filter(e => e && typeof e === 'object' && 'mutation' in e)
} catch {
  return []
}
```

(Check the actual stored shape first and filter on its real key, e.g. `payload`/`mutation`.)

- [ ] **Step 4: Dedupe optimistic temp on success**

In `queries.ts` around line 190, in the onSuccess that prepends the new transaction, filter out the temp id:

```ts
setData(prev => [newTx, ...(prev ?? []).filter(t => t.id !== tempId)])
```

(Read the surrounding code to capture the exact variable names.)

- [ ] **Step 4b: Local-date fixes in queries.ts + localStore.ts (spec §3.1)**

- `queries.ts` run-due default "today" (~line 372): replace `new Date().toISOString().slice(0, 10)` with `todayLocal()` (import from `./utils`).
- `localStore.ts` `localRunDueRules` default (~line 123): same replacement.

- [ ] **Step 5: Test + build**

Add/extend tests in `src/lib/syncQueue`-adjacent test files if present; at minimum run: `npm test -- --run` and `npm run build`.
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/syncQueue.ts src/lib/offlineCache.ts src/lib/queries.ts
git commit -m "fix: sync queue retry policy, tolerant cache reads, react-query dedupe"
```

---

### Task 15: lib fixes B — notifications

**Files:**
- Modify: `src/lib/notifications.ts`
- Modify: `src/components/layout/NotificationsSheet.tsx` (prune dismissedIds)

**Interfaces:**
- Consumes: `toLocalDateStr`/`todayLocal` (Task 2).
- Produces: rule-derived notification IDs (deleted rules cancel cleanly), correct monthStart/daysUntil in all timezones, yearly budget alerts use monthly-equivalent, dismissedIds pruned.

- [ ] **Step 1: Local-date fixes**

- `monthStart` (line ~29): `const now = new Date(); const monthStart = toLocalDateStr(new Date(now.getFullYear(), now.getMonth(), 1))`.
- `daysUntil` (lines ~14-18): parse `'YYYY-MM-DD'` into parts and build a local `Date(y, m-1, d)` instead of `new Date(dateStr)` + `setHours(0,0,0,0)`.

- [ ] **Step 2: Rule-derived IDs**

Replace positional `9000 + i` ids with a stable hash of `rule.id`:

```ts
function ruleNotificationId(ruleId: string, kind: string): number {
  let h = 0
  for (const ch of `${kind}:${ruleId}`) h = (h * 31 + ch.charCodeAt(0)) | 0
  return 9000 + (Math.abs(h) % 90000)
}
```

Before scheduling, cancel ALL previously-scheduled ids for rules no longer active (keep a registry of scheduled ids in localStorage, or compute ids for all rules the sheet knows about — implement with the simplest correct approach: store the last scheduled id list under a key and cancel each before rescheduling).

- [ ] **Step 3: Yearly budget comparison**

In the budget-alert computation (line ~37), divide the comparison limit by 12 when `budget_period === 'yearly'` (mirror `financeOs.getCategoryInsights` semantics).

- [ ] **Step 4: Prune dismissedIds**

In `NotificationsSheet.tsx`, when computing `visibleNotifications`, compute the set of live notification ids and prune `dismissedIds` (filter to ids present in the live set) then persist the pruned set.

- [ ] **Step 5: Test + build**

Run: `npm test -- --run` + `npm run build`. Extend any notification tests that assert IDs.
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/notifications.ts src/components/layout/NotificationsSheet.tsx
git commit -m "fix: notifications — local dates, rule-derived ids, yearly limits, dismissed pruning"
```

---

### Task 16: lib fixes C — currency, priceFetch, ai, supabase, totp, calendarExport

**Files:**
- Modify: `src/lib/currency.ts`
- Modify: `src/lib/priceFetch.ts`
- Modify: `src/lib/ai.ts`
- Modify: `src/lib/supabase.ts`
- Modify: `src/lib/totp.ts`
- Modify: `src/lib/calendarExport.ts`
- Modify: `package.json` (+ `qrcode` + `@types/qrcode`)

**Interfaces:**
- Produces: unknown currencies fail loudly; price fetches time out; Gemini key via header; sane dailyBurn; robust receipt JSON parse; supabase fails fast on missing env; TOTP QR generated locally; iCal DTEND/CRLF correct.

- [ ] **Step 1: Currency validation**

In `currency.ts`: for codes outside the known table, return `null` from the conversion helper (check callers — Dashboard/most pages should skip such wallets with a console.warn instead of 1:1 math); in `formatCurrency`, validate the code against a supported set before calling `Intl.NumberFormat` and fall back to the raw number + code string if invalid. Update any callers that assume a number is always returned.

- [ ] **Step 2: priceFetch timeouts**

Wrap CoinGecko/Yahoo fetches with `AbortController` + `setTimeout(..., 8000)`; on abort, keep the holding's stored price and surface a gentle console.warn (no error toast spam).

- [ ] **Step 3: ai.ts fixes**

- Replace the `?key=` query param with an `X-Goog-Api-Key` header on the Gemini request (check the fetch call and move the key to headers).
- `dailyBurn` (line ~143): `const elapsedDays = Math.max(1, Math.min(daysInMonth - daysLeftInMonth, daysInMonth)); const dailyBurn = monthlySpent / elapsedDays`.
- `scanReceipt` JSON extraction (line ~83): replace the non-greedy regex with a greedy extract from the first `{` to the LAST `}` (`json.slice(json.indexOf('{'), json.lastIndexOf('}') + 1)`) and wrap `JSON.parse` in try/catch that rethrows `new Error('Receipt scan returned an unreadable result — try again')`.

- [ ] **Step 4: supabase fail-fast**

Remove the hardcoded fallback URL/anon key; throw a descriptive error when `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` are missing.

- [ ] **Step 5: Local TOTP QR**

`npm install qrcode` + `npm install -D @types/qrcode`. Replace the `api.qrserver.com` URL with local generation:

```ts
import QRCode from 'qrcode'
export async function generateTOTPQRCode(otpauthUrl: string): Promise<string> {
  return QRCode.toDataURL(otpauthUrl)
}
```

Update the TOTP UI (Settings) to render the data URL in an `<img>` instead of a remote URL. Keep the old exported name so callers change minimally (verify call sites).

- [ ] **Step 6: calendarExport DTEND + CRLF**

- Compute DTEND by UTC-safe math: take the start date string, build `new Date(Date.UTC(y, m-1, d) + 86400000)` and format from `getUTC*` parts.
- Join lines/events with `\r\n` per RFC 5545.

- [ ] **Step 7: Test + build**

Run: `npm test -- --run` + `npm run build`. Fix any test that mocked `api.qrserver.com` (assert the new `qrcode` mock).
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/currency.ts src/lib/priceFetch.ts src/lib/ai.ts src/lib/supabase.ts src/lib/totp.ts src/lib/calendarExport.ts package.json package-lock.json
git commit -m "fix: lib hardening — currency validation, fetch timeouts, Gemini header, local TOTP QR, iCal correctness"
```

---

### Task 17: Simulator fixes

**Files:**
- Modify: `src/components/investing/SimulatorTab.tsx`

**Interfaces:**
- Produces: weekly contributions round-trip correctly; drafts don't reset on rate refetch.

- [ ] **Step 1: Fix frequency round-trip**

- On save: persist the per-period amount AND the frequency (keep existing storage shape; add a `contribution_frequency` field — verify `InvestmentConfig` allows extra fields or extend the type in `src/types/index.ts`).
- On hydrate (`emptySimulator`): if `contribution_frequency` is `'weekly'`, set the draft's per-period field to `monthly_contribution / FREQ_TO_MONTHLY.weekly` (read `FREQ_TO_MONTHLY`'s real shape in the file and use its value).

- [ ] **Step 2: Draft wipe fix**

Change the hydration `useEffect` so it only runs when `investConfig?.id` changes (use a ref storing the last-hydrated id), not when `money.rates` produces a new `emptySimulator` object.

- [ ] **Step 3: Test + build**

Run: `npx vitest --run src/pages/Investing.test.tsx` + `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/investing/SimulatorTab.tsx src/types/index.ts
git commit -m "fix: Simulator — weekly contribution round-trip, draft survives rate refetch"
```

---

### Task 18: Goals / GoalDetail / Auth — navigate fixes, input retention, route shadow

**Files:**
- Modify: `src/pages/Goals.tsx`
- Modify: `src/pages/GoalDetail.tsx`
- Modify: `src/pages/AuthPage.tsx`
- Modify: `src/pages/Auth.tsx` (delete)
- Modify: `src/App.tsx` (remove shadowed route)

**Interfaces:**
- Consumes: existing query hooks.
- Produces: no navigate-in-render warnings; failed goal submission keeps the draft; dead Auth route removed; safeGet used.

- [ ] **Step 1: GoalDetail + AuthPage navigate-in-render**

In `GoalDetail.tsx` (~line 77) and `AuthPage.tsx` (~line 21): replace the render-body `navigate()` calls with `return <Navigate to="..." replace />` (import from `react-router-dom`).

- [ ] **Step 2: Goals draft retention (audit L8)**

In `Goals.tsx` `handleSubmit`: on catch, call `setForm(prev => ({ ...prev, ...payload }))`-style restore — simplest: capture the payload in a variable before `setForm(emptyForm())` and on failure do `setForm(payload)` and `setShowForm(true)`.

- [ ] **Step 3: Remove shadowed Auth route**

- In `src/App.tsx`, delete the nested `auth` → `Auth` route (the top-level `AuthPage` route wins).
- Delete `src/pages/Auth.tsx` and its test if it only covers the dead component (keep the test if it covers shared helpers — check imports first).

- [ ] **Step 4: safeGet in Goals/GoalDetail/Investing/Estimation localStorage reads**

Import `safeGet` from `@/lib/utils` and wrap the state-initializer reads in `Goals.tsx:87`, `GoalDetail.tsx:74`, `Investing.tsx:15`, `Estimation.tsx:75`.

- [ ] **Step 5: Test + build**

Run: `npx vitest --run src/pages/Goals.test.tsx src/pages/Auth.test.tsx` + `npm run build`
Expected: PASS (skip Auth tests if the file was deleted).

- [ ] **Step 6: Commit**

```bash
git add src/pages/Goals.tsx src/pages/GoalDetail.tsx src/pages/AuthPage.tsx src/App.tsx
git rm -q src/pages/Auth.tsx src/pages/Auth.test.tsx 2>/dev/null || true
git commit -m "fix: Goals/Auth — Navigate components, draft retention, remove shadowed route, safeGet"
```

---

### Task 19: Estimation fixes

**Files:**
- Modify: `src/pages/Estimation.tsx`

**Interfaces:**
- Produces: mutation failures surface toasts; wishlist edit keeps 'Later' type.

- [ ] **Step 1: try/catch mutations**

Wrap `handleClearAll`, `saveEditItem`, `saveEditWishlist`, `confirmDeleteSelected`, `convertToGoal` mutation awaits in try/catch with `toast.error('Something went wrong — please try again')` style messages (specific copy per action).

- [ ] **Step 2: 'Later' type in edit select**

Add `'Later'` to the wishlist edit options list (~line 757) so it matches the add form (`['Want','Need','Work','Travel','Gift','Later']` — use the same array constant for both; extract it once at the top of the file).

- [ ] **Step 3: safeGet**

Wrap the localStorage read at line ~75 with `safeGet` imported from `@/lib/utils` (if Task 18 already covered it, skip).

- [ ] **Step 4: Test + build**

Run: `npx vitest --run src/pages/Estimation.test.tsx` + `npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Estimation.tsx
git commit -m "fix: Estimation — mutation error handling, Later wishlist type, safeGet"
```

---

### Task 19A: MoneyField rollout — remaining money inputs (spec §5)

**Files:**
- Modify: `src/pages/Budget.tsx` (add-category amount input)
- Modify: `src/pages/Goals.tsx` (contribution input)
- Modify: `src/pages/GoalDetail.tsx` (contribution input, if any)
- Modify: `src/pages/Estimation.tsx` (all money inputs)
- Modify: `src/pages/CategoryDetail.tsx` (money inputs, if any)
- Modify: `src/pages/Settings.tsx` (wallet starting balance input)

**Interfaces:**
- Consumes: `MoneyField` (Task 5).
- Produces: every money input app-wide uses the custom keypad on mobile and a plain input on desktop.

- [ ] **Step 1: Replace inputs page by page**

For each file, find `<Input ... inputMode="decimal"` (or type="number") bound to a money string state and replace with:

```tsx
<MoneyField value={value} onChange={setValue} currency={money.displayCurrency ?? money.baseCurrency} ariaLabel="Amount" className="<keep the input's existing className>" />
```

- `Budget.tsx` add-category amount (bound to `addAmount`; note it uses `formatNumberInput` — keep that in the setter: `onChange={v => setAddAmount(formatNumberInput(v))}`).
- `Goals.tsx` / `GoalDetail.tsx` contribution inputs (find via grep `inputMode="decimal"` in those files).
- `Estimation.tsx` money inputs (grep and replace each).
- `CategoryDetail.tsx` — only if it has money inputs (grep; skip if none).
- `Settings.tsx` wallet starting balance input (grep `inputMode="decimal"`).

- [ ] **Step 2: Test + build**

Run: `npm test -- --run` + `npm run build`
Expected: PASS (page tests render at desktop width by default — MoneyField falls back to plain input there, so existing tests stay green).

- [ ] **Step 3: Commit**

```bash
git add src/pages/Budget.tsx src/pages/Goals.tsx src/pages/GoalDetail.tsx src/pages/Estimation.tsx src/pages/CategoryDetail.tsx src/pages/Settings.tsx
git commit -m "feat: MoneyField rollout — custom keypad on all remaining money inputs"
```

---

### Task 20: AppLayout + Sidebar + keyboard + Dashboard (incl. stashed tweaks)

**Files:**
- Modify: `src/components/layout/AppLayout.tsx`
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/lib/keyboard.ts`
- Modify: `src/pages/Dashboard.tsx`

**Interfaces:**
- Consumes: `processSyncQueue` from `@/lib/syncQueue`.
- Produces: queue processes on mount; shortcuts don't fire under sheets and don't re-subscribe per render; sidebar 240px (stashed); Dashboard shows 10/7/8 items (stashed) + safeGet.

- [ ] **Step 1: processSyncQueue on mount**

In `AppLayout`, add a mount effect:

```ts
useEffect(() => {
  processSyncQueue().catch(() => { /* queue keeps items; next sync retries */ })
}, [])
```

(Also call it when the auth session becomes non-null.)

- [ ] **Step 2: Keyboard shortcut fixes**

- In `AppLayout`, wrap the `useKeyboardShortcuts({...})` handlers object in `useMemo(() => ({...}), [isDesktop])` (all handlers are stable closures over setters/navigate — include only what's used).
- Gate the bare-key keydown handler (lines ~128-146) behind "no sheet open": track `moreOpen || profileOpen || quickAddOpen || shortcutsOpen || quickActionsOpen` and early-return when any is true.
- In `lib/keyboard.ts`, keep the effect deps but read handlers from a ref (update the ref each render) so the listener binds once.

- [ ] **Step 3: Sidebar stashed width**

Apply the stash: aside `lg:w-[210px]` → `lg:w-[240px]`; nav item classes `gap-2.5 px-3 py-2 text-[13px]` → `gap-3 px-3 py-2.5 text-sm`; active indicator `h-4 w-1` → `h-5 w-1.5`; icons `h-3.5 w-3.5` → `h-4 w-4`; and AppLayout main padding `lg:ml-[240px]` → `lg:ml-[260px]` with `lg:w-full lg:max-w-[1600px]` (matches the stashed diff exactly).

- [ ] **Step 4: Sidebar credential cleanup**

In `Sidebar`, on profile sheet close (`onProfileOpenChange(false)`), clear `authEmail`/`authPassword` state.

- [ ] **Step 5: Dashboard stashed list sizes + safeGet**

- `topCategories.slice(0, 5)` → `slice(0, 10)`; `upcomingBills.slice(0, 3)` → `slice(0, 7)`; `recentTx.slice(0, 5)` → `slice(0, 8)`.
- Wrap the localStorage read at line ~32 with safeGet (add the helper or import from utils if promoted — promote `safeGet` into `src/lib/utils.ts` in this task and reuse).

- [ ] **Step 6: Test + build**

Run: `npx vitest --run src/components/layout/Sidebar.test.tsx src/components/layout/BottomNav.test.tsx src/pages/Dashboard.test.tsx` + `npm run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/layout/AppLayout.tsx src/components/layout/Sidebar.tsx src/lib/keyboard.ts src/pages/Dashboard.tsx src/lib/utils.ts
git commit -m "fix: layout — sync on mount, shortcut gating, stashed sidebar/dashboard tweaks, safeGet in utils"
```

---

### Task 21: Onboarding, PortfolioTab, Calendar — small page batch

**Files:**
- Modify: `src/components/onboarding/OnboardingFlow.tsx`
- Modify: `src/components/investing/PortfolioTab.tsx`
- Modify: `src/pages/Calendar.tsx`

**Interfaces:**
- Consumes: `toLocalDateStr`/`todayLocal` (Task 2).
- Produces: local-date defaults everywhere; per-holding refresh tolerates failures; no unhandled mutation rejections.

- [ ] **Step 1: OnboardingFlow**

- Line ~71 default date → `todayLocal()`.
- Wrap `addWallet.mutateAsync` / `addTransaction.mutateAsync` in try/catch with `toast.error('Setup step failed — please try again')`.

- [ ] **Step 2: PortfolioTab**

- Lines ~59/71/461: `toISOString().slice(0, 10)` → `toLocalDateStr(...)` / `todayLocal()`.
- Refresh loop (lines ~200-218): wrap each `updateHolding` in its own try/catch; collect failures; toast `Updated ${ok} of ${n} prices${failures ? ` — ${failures} failed` : ''}` instead of the all-or-nothing throw.

- [ ] **Step 3: Calendar**

- `todayStr` (lines ~21-23) → `todayLocal()`.
- Cell dates (line ~368): build from local parts with `toLocalDateStr(cellDate)` (cellDate is the local `current` used for grid position).

- [ ] **Step 4: Test + build**

Run: `npx vitest --run src/pages/Investing.test.tsx` + `npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/onboarding/OnboardingFlow.tsx src/components/investing/PortfolioTab.tsx src/pages/Calendar.tsx
git commit -m "fix: onboarding/portfolio/calendar — local dates, resilient price refresh, mutation toasts"
```

---

### Task 22: Design-language polish — radii, colors, SheetTitle, ConfirmDialog

**Files:**
- Modify: `src/components/layout/MoreSheet.tsx`
- Modify: `src/components/layout/AppLayout.tsx` (quick-actions sheet title)
- Modify: `src/components/shared/ConfirmDialog.tsx`
- Modify: `src/components/investing/RebalancingHelper.tsx`
- Modify: `src/components/layout/NotificationsSheet.tsx`
- Modify: `src/components/ui/card.tsx` (verify it already uses `rounded-[1.4rem]`)

**Interfaces:**
- Produces: consistent `rounded-[1.4rem]` cards, palette tokens instead of raw Tailwind colors, a11y sheet titles, ConfirmDialog keyboard support.

- [ ] **Step 1: Palette swaps**

- `RebalancingHelper.tsx`: `bg-yellow-500/10` → `bg-[#FFCF73]/10`, `text-yellow-600` → `text-[#FFCF73]`.
- `NotificationsSheet.tsx`: critical badge `bg-red-500` → `bg-[#FF8388]`.
- Grep for `yellow-500|red-500|green-500|blue-500` in `src/components` and swap any remaining ones to the app tokens (`#FFCF73` warning, `#FF8388` danger, primary color otherwise).

- [ ] **Step 2: Missing SheetTitles**

- `MoreSheet.tsx` (~line 68): wrap/replace the plain `<h2>` with Radix `<SheetTitle>` (import from `@/components/ui/sheet`) keeping the same text.
- `AppLayout.tsx` quick-actions sheet (~line 271): add a visually-hidden `<SheetTitle>` ("Quick actions") — use `className="sr-only"`; keep the visible heading as-is.

- [ ] **Step 3: ConfirmDialog focus + Escape**

Add to the dialog root: `useEffect` on open that focuses the Cancel (or primary) button; a keydown listener closing on Escape (call `onCancel`); `role="dialog" aria-modal="true"` already present — verify.

- [ ] **Step 4: Radius audit**

Grep `rounded-\[1\.25rem\]|rounded-\[1\.7rem\]|rounded-t-2xl` across `src/`: normalize card surfaces to `rounded-[1.4rem]`, EXCEPT Sidebar keeps `rounded-[1.7rem]` and bottom sheets keep `rounded-t-3xl` (their established look). Update `QuickAddSheet.tsx`/`AddTransaction.tsx` inner cards from `rounded-[1.25rem]` to `rounded-[1.4rem]` (these files were already touched in Tasks 7/8 — do it now if missed there).

- [ ] **Step 5: Test + build**

Run: `npm test -- --run` + `npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components
git commit -m "polish: design-language consistency — palette tokens, radii, sheet titles, dialog keyboard support"
```

---

### Task 23: Tags wiring, PDF export button, dead-code removal

**Files:**
- Modify: `src/pages/Transactions.tsx` (detail sheet — add tags editor)
- Modify: `src/components/transactions/TransactionTagsEditor.tsx` (read its props; adjust to the sheet)
- Modify: `src/pages/Reports.tsx` (PDF export button)
- Modify: `src/lib/pdfExport.ts` (sanitize before innerHTML)
- Delete: `src/components/ui/MoneyKeypad.tsx`, `src/components/ui/numpad.tsx`

**Interfaces:**
- Consumes: `lib/tags` functions (`updateTag`, `deleteTag`, `removeTagFromAllTransactions` — verify names); `generatePDFFromHTML`/`downloadPDF` from `lib/pdfExport`.
- Produces: tags editable in transaction detail; Reports PDF download; dead UI keypads removed.

- [ ] **Step 1: Wire TransactionTagsEditor**

Read `TransactionTagsEditor.tsx` and `lib/tags.ts` exports. In the Transactions detail sheet (find where the detail edit form lives), render the editor for the open transaction, passing the tx id/description and wiring `updateTag`/`deleteTag` with toasts (wrap in try/catch). If the editor expects a different shape, adapt it minimally.

- [ ] **Step 2: PDF export button in Reports**

In `Reports.tsx` header actions, add a "Download PDF" button:

```tsx
<Button size="sm" variant="secondary" className="gap-2" onClick={async () => {
  try {
    const html = generateReportHTML(/* existing report data */)
    await downloadPDF(html)
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'PDF export failed')
  }
}}>
  <FileDown className="h-4 w-4" /> PDF
</Button>
```

Read `lib/pdfExport.ts`'s actual function names/signatures first and pass the report data the page already computes.

- [ ] **Step 3: Sanitize pdfExport**

In `lib/pdfExport.ts`, wherever user strings are interpolated into HTML, escape them:

```ts
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
```

Apply to all description/name interpolations.

- [ ] **Step 4: Delete dead files**

Delete `src/components/ui/MoneyKeypad.tsx` and `src/components/ui/numpad.tsx` (zero importers — verify with `grep -rn "ui/MoneyKeypad\|ui/numpad" src/` first). Keep `src/lib/categories.ts` (it IS used — Settings imports `DEFAULT_BUDGET_CATEGORIES`).

- [ ] **Step 5: Test + build**

Run: `npm test -- --run` + `npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Transactions.tsx src/components/transactions/TransactionTagsEditor.tsx src/pages/Reports.tsx src/lib/pdfExport.ts
git rm src/components/ui/MoneyKeypad.tsx src/components/ui/numpad.tsx
git commit -m "feat: wire tags editor + PDF export, sanitize HTML, remove dead keypad files"
```

---

### Task 24: ESLint — make lint actually work

**Files:**
- Create: `eslint.config.js`
- Modify: `package.json` (script + devDeps)

**Interfaces:**
- Produces: `npm run lint` runs eslint 9 with typescript-eslint and react-hooks, passing on the current codebase.

- [ ] **Step 1: Install**

`npm install -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin eslint-plugin-react-hooks`

- [ ] **Step 2: Config**

Create `eslint.config.js`:

```js
import tseslint from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import reactHooks from 'eslint-plugin-react-hooks'

export default [
  { ignores: ['dist/**', 'node_modules/**', 'android/**', '*.config.js'] },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { parser: tsParser, parserOptions: { ecmaVersion: 2022, sourceType: 'module', ecmaFeatures: { jsx: true } } },
    plugins: { '@typescript-eslint': tseslint, 'react-hooks': reactHooks },
    rules: {
      ...tseslint.configs.recommended.rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
]
```

- [ ] **Step 3: Run lint and fix findings**

Run: `npm run lint`
Expected: exits 0. Fix any legitimate errors it flags (unused vars already covered by tsc; focus on rules-of-hooks errors — none should exist after earlier tasks).

- [ ] **Step 4: Commit**

```bash
git add eslint.config.js package.json package-lock.json
git commit -m "chore: working eslint setup (typescript-eslint + react-hooks)"
```

---

### Task 25: CI, dependencies, README

**Files:**
- Modify: `.github/workflows/build-android.yml`
- Modify: `package.json` (dependency housekeeping)
- Create: `README.md`

**Interfaces:**
- Produces: CI runs tests; stale branch trigger removed; deps bumped + pruned + tooling in devDependencies; README exists.

- [ ] **Step 1: Dependency bumps (one batch)**

Run: `npm install @capacitor/android@^8.5.0 @capacitor/app@^8.1.1 @capacitor/cli@^8.5.0 @capacitor/core@^8.5.0 @capacitor/ios@^8.5.0 @capacitor/local-notifications@^8.3.1 @capacitor/splash-screen@^8.0.2 @capacitor/status-bar@^8.0.3 vite@^8.2.2 @vitejs/plugin-react@^6.1.1 vitest@^4.1.11 react@^19.2.8 react-dom@^19.2.8 @types/react@^19.2.18 react-router-dom@^7.18.2 @supabase/supabase-js@^2.112.4 @tanstack/react-query@^5.102.8 lucide-react@^1.34.0 recharts@^3.10.1 sonner@^2.0.8 autoprefixer@^10.5.4 postcss@^8.5.26 @radix-ui/react-dialog@^1.1.23 @radix-ui/react-label@^2.1.15 @radix-ui/react-select@^2.3.7 @radix-ui/react-slot@^1.3.3 @radix-ui/react-tabs@^1.1.21`

Then: `npm uninstall @radix-ui/react-avatar @radix-ui/react-progress @radix-ui/react-scroll-area @radix-ui/react-separator @testing-library/dom`

Move tooling to devDependencies (edit package.json directly): `typescript`, `vite`, `@vitejs/plugin-react`, `@capacitor/cli` — cut from `dependencies`, paste into `devDependencies`.

Run `npm run build && npm test -- --run` — Expected: PASS. Do NOT bump majors (Tailwind 4, TS 7, jest-dom 7, jsdom 30) per spec.

- [ ] **Step 2: cap sync + commit native project**

Run: `npx cap sync android` — the regenerated `android/` now includes camera/haptics/notifications/app plugins. Commit the `android/` changes.

- [ ] **Step 3: CI update**

In `.github/workflows/build-android.yml`:
- Add a step before build: `- run: npm test -- --run` (name: Run tests).
- Remove the stale branch `claude/webapp-improvements-md-QmqNB` from `on.push.branches` (keep `main`).

- [ ] **Step 4: README**

Create `README.md` with: app overview, prerequisites (Node 22+), `npm install`, `npm run dev`, env vars table (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_GEMINI_API_KEY`), `npm run build`, `npm test -- --run`, `npx cap sync android` + `npm run cap:android` workflow, and a note that tests must stay green in CI.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json android/ .github/workflows/build-android.yml README.md
git commit -m "chore: dep bumps + pruning, cap sync camera, CI test step, README"
```

---

### Task 26: Final verification gate

**Files:** none (verification only)

- [ ] **Step 1: Full suite**

Run: `npm test -- --run`
Expected: ALL PASS, 0 failed.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: exit 0.

- [ ] **Step 4: Manual smoke checklist (run `npm run dev` and verify)**

- Desktop width: QuickAddSheet amount editable by keyboard; no keypad panel.
- Mobile width (devtools): tapping amount opens custom keypad; native keyboard never appears; split portion + wallet split + cash tendered all use the keypad.
- Cash flow: TWD 750 paid with 1000 → bills + coins transfers created with clean "Change bills — …" descriptions; coins wallet can't be the paying wallet.
- Split flow: portions summing short → error toast, nothing saved.
- Budget: "Balancing" in starter categories; an "Other"-category expense shows under Unassigned/Balancing; totals reconcile.
- Reports: PDF button downloads a file; tags editable in transaction detail.

- [ ] **Step 5: Push branch + open PR**

```bash
git push -u origin claude/fix-polish-balancing
gh pr create --title "Fix + polish round: balancing budget, split/cash validation, MoneyField keypad, bug fixes" --body "$(cat <<'EOF'
Full fix + polish round per `docs/superpowers/specs/2026-08-28-wallet-polish-budget-balancing-design.md`.

- Balancing default budget category with auto-catch of unknown/split-leftover spending
- Hard validation for split & multi-wallet payments; safe cash/coin change routing
- MoneyField: custom keypad on mobile, plain input on desktop, everywhere money is entered
- Timezone date fixes, mojibake re-encode, PIN hardening, sync-queue retries, simulator fixes, security fixes (Gemini header, local TOTP QR), tags + PDF export wired
- Green tests, working eslint, CI test step, dependency bumps

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL printed.

---

## Self-review notes (executor)

- Every task commits; the branch builds at every boundary.
- Tasks 7 and 22 both touch QuickAddSheet/AddTransaction classNames — Task 7 does the rework, Task 22 only the radius normalization; if Task 22 finds the radii already normalized, skip that sub-step.
- Task 19A (MoneyField rollout) intentionally runs AFTER the page logic tasks (6, 11, 12, 18, 19) so it only swaps input components and never mixes with logic edits.
- `safeGet` is centralized in `src/lib/utils.ts` (Task 2); Tasks 12/18/19/20 import it — do not redefine it locally.
- The `AddTransaction.test.tsx` file may not exist — the plan handles both cases.
- Where a referenced line number drifted (files changed by earlier tasks), locate the code by content, not line number.

