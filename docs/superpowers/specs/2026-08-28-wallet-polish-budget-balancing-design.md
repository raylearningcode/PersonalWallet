# Design: Full fix + polish round + "Balancing" budget category

Date: 2026-08-28
Branch: `claude/fix-polish-balancing` (from `main` @ 58c1267)
Status: Approved (user confirmed Approach A + re-apply stashed tweaks)

## Context

The app was synced to origin/main @ 58c1267. A five-agent audit found: 5 failing test suites
(1 real missing dependency, 4 stale tests), a systemic timezone bug, mojibake-corrupted source
strings, several dead/broken flows, and a budget that never reconciles with real spending.
The user wants everything fixed, features polished for both mobile and desktop, and a new
default budget category "Balancing" that absorbs unknown expense / uncalculated money.

## 1. Balancing budget category (Approach A — approved)

**Goal:** Budget totals always reconcile with real spending; unknown or partially-allocated
money lands in a visible "Balancing" category. No transaction data is ever rewritten.

### 1.1 Default category

- Add to `src/lib/categories.ts` `DEFAULT_BUDGET_CATEGORIES`:
  `{ name: 'Balancing', yearly_allocated: 0, budget_period: 'monthly', color: '#64748B' }`.
- Existing users get it via Settings → "Restore starter categories"
  (`Settings.tsx` `handleAddStarterCategories`); new users get it the same way as other defaults.

### 1.2 Budget math (auto-catch)

New pure helpers in `src/lib/budget.ts` (fully unit-tested):

- `getUnmatchedExpenses(transactions, categories, periodDate)` → expense transactions in the
  period whose category name matches **no** budget category (case-insensitive), including
  `Split`, `Other`, and renamed/deleted categories.
- `getSplitRemainders(transactions)` → for each expense with `split_portions`, the positive
  leftover `amount - sum(portions)` (0 when fully allocated).
- `getBalancingSpent(transactions, categories, periodDate)` → `sum(unmatched amounts) + sum(split remainders)`, excluding transfers/incomes.

Budget page changes (`src/pages/Budget.tsx`):

- If a category named "Balancing" exists: show its `spent` as `getBalancingSpent(...)`
  (instead of only exact-name matches) — real allocated spending on Balancing still counts too.
- If no Balancing category exists: show an "Unassigned" row/card in the allocation list with
  the same amount and a button "Add Balancing category" (one-tap create via existing
  `useAddBudgetCategory`).
- Stat cards (`totalSpent`, `remaining`) include the balancing amount so the budget balances.
- Split transactions: each portion whose category matches a budget category is attributed to
  that category's spent (new helper `getSplitAttribution`); the remainder goes to Balancing.

## 2. Split money + cash/coin change (mobile & desktop parity)

Extract one shared module `src/lib/cashSave.ts` with pure, tested logic used by BOTH
`QuickAddSheet.tsx` (mobile-first) and `AddTransaction.tsx` (desktop-first):

- `validateSplitAmounts(amount, portions)` → error string or null.
  Reject: fewer than 2 valid portions; empty amounts; sum != total (±0.01 input-currency
  tolerance; exact for IDR which has no decimals).
- `validateWalletSplits(amount, splits)` → same rules for multi-wallet payments.
- `buildCashChangePayloads(...)` → returns the main transaction payload + change-transfer
  payloads (TWD bills/coins via `splitChangeByPolicy`, non-TWD single change transfer),
  with the `!== walletId` self-transfer guard in all branches.
- `buildSplitPortions(inputs, toBase)` → converts input-currency portion strings to base
  amounts, same behavior both modes.

Behavior fixes (both flows):

- Save blocked when: cash mode on but "cash given" empty or < amount; portions present but
  empty/sum mismatch; wallet splits sum mismatch. Toasts explain exactly what's wrong.
- Switching wallet or type resets cash mode + tendered + split/multi-wallet state consistently
  (advanced AND quick mode).
- `isTWD` derives from the input currency only (split math already converts via `toBase`).
- Coins/bills change wallets can never equal the paying wallet; UI disables such options.
- Change-transfer descriptions are re-encoded mojibake-free ("Change bills — …", "Change coins — …").

## 3. Bug fixes (audit findings, ordered by severity)

### 3.1 Timezone (systemic)

- New `todayLocal()` / `toLocalDateStr(d)` helpers in `src/lib/utils.ts` building
  `YYYY-MM-DD` from local date parts.
- Replace every `toISOString().slice(0,10)` used to produce dates/date-bounds in:
  `Transactions.tsx` (getLastDay, defaults, presets), `AddTransaction.tsx`, `Calendar.tsx`,
  `streak.ts`, `notifications.ts` (monthStart + daysUntil parse), `queries.ts` (run-due today),
  `localStore.ts`, `QuickAddSheet.tsx`, `PortfolioTab.tsx`, `OnboardingFlow.tsx`,
  `calendarExport.ts` (DTEND via UTC math, CRLF line endings).
- Result: no yesterday-dated transactions, correct month filters/streaks/heatmap/notifications
  in UTC+7..+14 zones.

### 3.2 Data-integrity / broken flows

- Subscriptions detail sheet Save actually saves (set `editTarget`/detail flag in `openDetail`).
- CategoryDetail: move all hooks above early returns (rules-of-hooks crash fix).
- Settings wallet balances: use `getWalletBalances` from `lib/financeOs` (split-aware).
- PIN (`PinLock.tsx`): write `PIN_SESSION_KEY` in `onUnlock`; replace base64 "hash" with
  salted SHA-256 via WebCrypto; add physical-keyboard input; register digits on first press
  after an error.
- Sync queue: run `processSyncQueue()` on AppLayout mount + when session becomes available;
  narrow `isNetworkError` detection; keep non-network errors with a retry counter instead of
  permanently dropping them.
- Simulator (`SimulatorTab.tsx`): persist per-period contribution + frequency (fixes
  4.33× inflation); hydrate draft only when `investConfig.id` changes (fixes draft wipe on
  rate refetch).
- React-query caches: dedupe optimistic temp item on successful prepend (`queries.ts:190`).
- Notifications: derive scheduled IDs from `rule.id` (hash) so deleted rules' notifications
  get cancelled; prune `dismissedIds` not present in current notifications; compare monthly
  alerts against monthly-equivalent allocation (`yearly/12` for yearly periods).
- Budget page math: daily allowance only for monthly categories; yearly "monthly-equivalent
  spent" capped to transactions on/before the viewed month.
- Transactions: cancel long-press timer on vertical scroll and `onPointerCancel`; add
  `wallets` to `sortedTransactions` memo deps; "Mark reviewed" only runs when the save
  succeeded; empty state offers "Show all dates" when the month filter hides everything.
- Currency: unknown currencies return `null` instead of silent 1:1 USD; validate codes before
  `Intl.NumberFormat`.
- `priceFetch`: AbortController timeouts + fall back to stored price.
- Goals: keep user's form input on submit failure; safe localStorage reads.
- `navigate()` in render → `<Navigate replace>` in `GoalDetail.tsx`, `AuthPage.tsx`;
  fix `Auth.tsx` route shadowing (remove dead route).
- AI: Gemini key via `X-Goog-Api-Key` header (no query param); fix `dailyBurn` division floor;
  robust JSON extraction (`scanReceipt` greedy/balanced parse); add Settings → AI section to
  enter/save the Gemini key (dead toast link fixed).
- TOTP: generate QR locally (`qrcode` package) — secret never sent to `api.qrserver.com`.
- Supabase: fail fast when env vars missing (no hardcoded fallback URL/key).
- Camera: add `@capacitor/camera` to dependencies, run `npx cap sync android` and commit the
  regenerated `android/` project so capture actually works on Android.
- Keyboard shortcuts: gate bare-key handlers when a sheet is open; list them in the
  shortcuts dialog; memoize handler object (no re-subscribe per render).
- Offline cache queue: tolerate malformed entries (per-entry parse filter).

### 3.3 Mutation robustness

- Wrap all unguarded `mutateAsync` calls in try/catch with `toast.error` feedback in:
  Transactions (duplicate, bulk category, mark reviewed, run-due rules), Estimation,
  Settings (profile/currency/auth/signout), Auth, OnboardingFlow.
- OnboardingFlow: try/catch + toasts around wallet/transaction creation.

## 4. UI/UX polish + re-applied user tweaks (approved)

- **Re-apply stashed tweaks from `stash@{0}`**: Sidebar 240px width + larger nav rows;
  Transactions "Net flow" third stat card with entry counts; Dashboard shows 10 categories,
  7 upcoming bills, 8 recent transactions; Budget 3-column stat grid (drop Daily allowance
  card from the top row; keep per-category daily view).
- Re-encode mojibake (`â€”`, `Ã—`, `Â·`, `â†’`, `?EUR"` etc.) to real UTF-8 in
  `QuickAddSheet.tsx`, `AddTransaction.tsx`, `Transactions.tsx` (~80 lines).
- Design-language consistency: unify card/sheet radii on `rounded-[1.4rem]` (Sidebar keeps
  its `rounded-[1.7rem]` aside); replace `yellow-500`/`red-500` with `#FFCF73`/`#FF8388`;
  add `SheetTitle` to MoreSheet + quick-actions sheet; ConfirmDialog focus trap, initial
  focus, Escape-to-close.
- Tags feature wired in: `TransactionTagsEditor` rendered in the transaction detail sheet;
  prune unused tag functions.
- Wire PDF export into Reports as an actual download button (the feature is already built;
  sanitize user-generated description text before passing it to `innerHTML`, and keep
  `window.print()` as an additional option).
- Fix dead "Desktop tools" row in mobile Settings (link to `/desktop-tools`); fix
  DesktopTools AI link to the new Settings AI section.
- Onboarding/empty states already good; keep skeletons/retry patterns.

## 5. Tests, lint, CI, dependencies

- Fix all 5 failing suites:
  - `@capacitor/camera` dependency added (suite loads) + `vi.mock('@/lib/camera')` in
    QuickAddSheet tests as belt-and-braces.
  - Goals.test.tsx: add `useTransactions: () => ({ data: [] })` to the queries mock.
  - Transactions.test.tsx / financeOs.test.ts: month-relative fixtures (no frozen dates).
  - Reports.test.tsx: derive expected labels from `new Date()`.
- New tests: `budget.test.ts` (balancing attribution, split attribution, unmatched catch),
  `cashSave.test.ts` (validation + payload building), `utils.test.ts` (todayLocal),
  QuickAddSheet/AddTransaction split+cash validation flows.
- Lint: add `eslint` + `typescript-eslint` + `eslint-plugin-react-hooks` with
  `eslint.config.js`; make `npm run lint` pass.
- CI (`.github/workflows/build-android.yml`): add `npm run test -- --run` step; remove stale
  branch trigger.
- Dependencies: safe minor/patch bumps (Capacitor all→8.5.x as one batch, vite 8.2.2,
  @vitejs/plugin-react 6.1.1, vitest 4.1.11, react/react-dom 19.2.8, @types/react 19.2.18,
  react-router-dom 7.18.2, @supabase/supabase-js 2.112.4, @tanstack/react-query 5.102.8,
  lucide-react 1.34.0, radix minors, recharts 3.10.1, sonner 2.0.8, autoprefixer/postcss).
  Add `@capacitor/camera` + `qrcode` (+ types). Remove unused
  `@radix-ui/react-{avatar,progress,scroll-area,separator}` + `@testing-library/dom`; move
  tooling to devDependencies. Defer majors (Tailwind 4, TS 7, jest-dom 7, jsdom 30).
- Add a README (setup, env vars, cap sync workflow).

## 6. Delivery & verification

- Branch `claude/fix-polish-balancing`, pushed as a PR to `raylearningcode/PersonalWallet`.
- Verification gate before merge: `npm run build` green, full `npm test -- --run` green,
  `npm run lint` green, manual smoke of QuickAddSheet + AddTransaction on desktop widths and
  mobile widths (split, cash, coins routing), Budget balancing row visible.

## Out of scope (explicitly)

- Tailwind 4 / TS 7 / jest-dom 7 / jsdom 30 major migrations.
- Every-dollar (zero-based) budgeting wizard.
- Rewriting transaction data to reassign categories (Approach B rejected).
