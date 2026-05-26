# FinPath Personal Wallet — Progress Log

**App:** FinPath Personal Finance OS  
**Stack:** Vite + React 18 + TypeScript + Tailwind CSS + shadcn/ui + Recharts + Supabase  
**Status:** v1.0 complete — all 7 screens functional  
**Last updated:** 2026-05-26

---

## What Was Built

A single-user personal finance dashboard with 7 screens, a dark premium UI, and a Supabase PostgreSQL backend. No authentication — goes straight to the dashboard.

### Screens

| Route | Screen | Purpose |
|---|---|---|
| `/` | Dashboard | Balance, spending overview, investment path card |
| `/transactions` | Transactions | Full ledger with filters, review queue, row actions |
| `/budget` | Budget | Yearly category limits, progress bars, smart rules |
| `/investing` | Investing | Compound growth chart, live ROI simulator |
| `/estimation` | Estimation Planner | Plan future months before they happen |
| `/reports` | Reports | Annual trends, monthly spending chart, insights |
| `/settings` | Settings | Profile, preferences, category manager, goal tracker |

### Commit History

```
8d20f5b  feat: FinPath personal wallet — complete 7-screen app
70b3f77  feat: Settings page with profile edit, preferences, and category manager
baba97d  feat: Reports page with annual spending chart and insights library
e7cf764  feat: Estimation Planner page with monthly/yearly toggle and save
c8d0096  feat: Investing page with compound growth chart and ROI simulator
09eb7fe  feat: Budget page with category bars and rules panel
29b16e8  feat: Transactions page with filters, table, and row actions
0cd62e2  feat: Dashboard page with stat cards and spending chart
14194a5  feat: add AppLayout, Sidebar, StatCard, PageHeader, routing
ce54724  feat: add TanStack Query hooks for all Supabase tables
71d19c2  feat: add types, Supabase client, utility functions and tests
f0398c7  fix: allow .env.local to be tracked (placeholder values only)
20e0f61  feat: add Supabase schema and seed data
041c5c2  fix: add missing CSS vars, vitest types, TS6 ignoreDeprecations, @types/react
17c2c08  feat: scaffold Vite + React + Tailwind + shadcn/ui
```

### Architecture

```
src/
  components/
    layout/       Sidebar, AppLayout
    ui/           shadcn/ui primitives (button, card, badge, progress, table, input,
                  select, tabs, separator, avatar, scroll-area, label)
    shared/       StatCard, PageHeader
  pages/          Dashboard, Transactions, Budget, Investing, Estimation, Reports, Settings
  lib/
    supabase.ts   createClient singleton
    queries.ts    13 TanStack Query hooks
    investing.ts  calculateProjectedValue, generateGrowthData
    budget.ts     getOverspendRisk, getCategoryUsedPct
    stats.ts      calculateSavingsRate, formatCurrency
  types/
    index.ts      Transaction, BudgetCategory, BudgetRule, InvestmentConfig,
                  EstimationPlan, AppSettings
  App.tsx         Router + QueryClientProvider + Toaster
```

### Database (Supabase)

6 tables: `transactions`, `budget_categories`, `budget_rules`, `investment_config`, `estimation_plans`, `app_settings`

Schema and seed data are in `supabase/schema.sql` and `supabase/seed.sql`.

---

## Test Results

17/17 tests passing across 3 test files:

- `src/test/investing.test.ts` — compound interest formula, growth data shape
- `src/test/budget.test.ts` — overspend risk levels, category usage percentages
- `src/test/stats.test.ts` — savings rate calculation, currency formatting

---

## Setup Instructions

1. Create a project at [supabase.com](https://supabase.com)
2. Run `supabase/schema.sql` in the SQL Editor to create all tables
3. Run `supabase/seed.sql` to populate with sample data
4. Open `.env.local` and replace the placeholder values:
   ```
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key-here
   ```
5. `npm install` then `npm run dev`

---

## Known Issues & Limitations

### Functional gaps (not yet implemented)

- **Sidebar search bar** is cosmetic — typing into it does nothing. A real implementation would filter transactions or navigate to relevant pages.
- **"Edit profile" on Settings** saves to local component state only — it does not persist the user name/email to `app_settings` in Supabase.
- **Preferences panel on Settings** (theme, currency, year start, default view, notifications) saves to local state only. Supabase upsert for `app_settings` is wired but the select inputs are not bound to it.
- **Reports "Open" buttons** expand a static detail panel with placeholder text. No real data is shown inside the insight panels.
- **Investment config inputs** in the simulator on the Investing page run the simulation in state but do not persist the updated values back to `investment_config` in Supabase.
- **Needs Review tab** in Transactions marks rows as reviewed via Supabase but does not show a real-time count badge on the tab label.

### UI / UX gaps

- **Mobile responsiveness** — layout is desktop-first (fixed 240px sidebar). Looks broken below ~1024px wide.
- **Empty states** — pages show blank tables/charts when there is no data rather than a friendly empty-state message.
- **Loading skeletons** — `isLoading` states from TanStack Query are handled with a simple spinner text, not proper skeleton cards.
- **Date picker** — the Estimation form uses a plain number input for month/year instead of a real date picker.

### Data / query gaps

- **Dashboard "Investment path" card** shows a hardcoded recommendation text rather than a computed value derived from actual savings rate.
- **Year filter** — all queries fetch all years of transactions. There is no year selector; everything implicitly uses all-time data.
- **Pagination** — the Transactions table loads all rows at once. Will degrade with large datasets.
- **Optimistic updates** — mutations (delete, mark reviewed) refetch from Supabase after success instead of using optimistic cache updates, causing a brief flicker.

---

## Future Improvements

### High priority

- [ ] **Persist Settings to Supabase** — wire the profile and preferences form to actually upsert `app_settings`
- [ ] **Real sidebar search** — filter transactions by description/category as you type
- [ ] **Year selector** — add a global year filter so all pages scope to a chosen year
- [ ] **Empty state components** — friendly "No data yet" views for all tables and charts
- [ ] **Proper skeleton loaders** — replace loading text with animated skeleton cards

### Medium priority

- [ ] **Pagination or virtual scroll** for the Transactions table
- [ ] **Persist investment simulator inputs** back to `investment_config` on save
- [ ] **Reports insight panels** — populate with real computed data (monthly summary, subscription audit, etc.)
- [ ] **Optimistic mutations** — instant UI updates without refetch flicker
- [ ] **Edit transaction** — currently only delete and mark-reviewed; add an inline edit for category and amount
- [ ] **Add transaction form** — a modal or slide-over to manually log new transactions
- [ ] **Budget rules enforcement** — show a warning toast when a category exceeds its cap rule

### Low priority / future features

- [ ] **Mobile responsive layout** — collapsible sidebar, bottom nav on small screens
- [ ] **Dark/light theme toggle** — UI is dark-only right now
- [ ] **CSV export** — export transactions or reports as a CSV file
- [ ] **Multi-currency support** — the currency field exists in estimation plans but is not applied to chart formatting globally
- [ ] **Recurring transaction detection** — auto-tag transactions that repeat monthly
- [ ] **User authentication** — Supabase Auth + Row Level Security so multiple users can have separate data
- [ ] **Notifications** — weekly digest email via Supabase Edge Functions

---

## Tech Decisions & Notes

| Decision | Reason |
|---|---|
| Supabase over local SQLite | Real-time ready, free tier, zero backend to maintain |
| shadcn/ui over MUI/Chakra | Copy-paste components, no version lock-in, consistent with Tailwind |
| TanStack Query over SWR | Better mutation API, stale-time control, devtools |
| Recharts over Chart.js | React-native API, easier to style with Tailwind tokens |
| sonner over shadcn toast | Simpler one-liner API for mutations |
| Custom `ColorBar` in Budget | shadcn Progress doesn't support arbitrary hex colors via inline style |
| `ignoreDeprecations: "6.0"` in tsconfig | TypeScript 6 deprecated `baseUrl` standalone; needed for `@/*` alias |
