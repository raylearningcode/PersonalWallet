# FinPath — Product Requirements Document

**Version**: 2.0  
**Date**: June 2026  
**Status**: Active development

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Goals & Non-Goals](#2-goals--non-goals)
3. [User Personas](#3-user-personas)
4. [Architecture & Technical Stack](#4-architecture--technical-stack)
5. [Data Models](#5-data-models)
6. [Currency System](#6-currency-system)
7. [Core Features](#7-core-features)
   - 7.1 Dashboard
   - 7.2 Transactions
   - 7.3 Budget
   - 7.4 Goals
   - 7.5 Subscriptions
   - 7.6 Estimation & Planning
   - 7.7 Investing
   - 7.8 Reports
   - 7.9 Settings
   - 7.10 Quick Add Sheet
8. [Cash Change Assistant](#8-cash-change-assistant)
9. [AI & Smart Features](#9-ai--smart-features)
10. [Offline & Data Persistence](#10-offline--data-persistence)
11. [Authentication & Security](#11-authentication--security)
12. [Notifications](#12-notifications)
13. [Navigation & UX Patterns](#13-navigation--ux-patterns)
14. [Third-Party Integrations](#14-third-party-integrations)
15. [Display & Formatting Rules](#15-display--formatting-rules)

---

## 1. Product Overview

**FinPath** is a personal finance Progressive Web App (PWA) designed for individuals who manage money across multiple wallets, currencies, and spending contexts. It runs fully offline-capable in a browser and as an installable app on mobile and desktop.

### Core value proposition

- **True multi-wallet tracking** — cash, bank, cards, e-wallets, investments all in one place
- **Cash-first workflows** — an intelligent cash change assistant routes bills and coins automatically
- **No bank connectivity** — all data is entered manually, keeping full user control and privacy
- **One currency, no drift** — amounts are stored in the user's single main currency; no live-rate conversion ever changes historical numbers
- **AI augmented but never required** — Gemini AI adds receipt scanning and spending insights, but all core features work without it

---

## 2. Goals & Non-Goals

### Goals

- Track every peso, rupiah, and dollar across any wallet type
- Make daily cash transactions fast (< 10 seconds to log a purchase)
- Show users whether they are on track to meet their monthly budget without requiring manual calculation
- Surface financial insights proactively without requiring a bank connection
- Work fully offline, syncing automatically when connectivity is restored

### Non-Goals

- No direct bank account or credit card connectivity (no open banking / Plaid / fintech APIs)
- No investment execution (simulator only, no brokerage integration)
- No multi-user / household sharing in v2
- No tax reporting or government compliance features
- No push notifications (web notifications only, not native)

---

## 3. User Personas

| Persona | Description | Key Needs |
|---|---|---|
| **Cash-heavy user** | Pays primarily in cash; receives change regularly | Fast cash logging, automatic change routing, coin/bill wallet split |
| **Multi-wallet user** | Uses bank, 2–3 cards, and e-wallet daily | Clean wallet selector, balance visibility, transfer tracking with fees |
| **Budget-focused user** | Lives paycheck-to-paycheck; tracks every category | Category budgets, "safe to spend" daily amount, over-budget alerts |
| **Saver / Goal-oriented user** | Building toward specific financial milestones | Goal progress tracking, contribution scheduling, deadline awareness |
| **Expat / Multi-currency user** | Earns in one currency, spends in another | Single main-currency storage, original-amount preservation, no rate drift |
| **Self-employed / Freelance user** | Irregular income, tracks subscriptions and recurring expenses | Subscription dashboard, recurring rule management, estimation/planning |

---

## 4. Architecture & Technical Stack

| Layer | Technology |
|---|---|
| Framework | React 19 + TypeScript + Vite |
| Styling | Tailwind CSS v4 + shadcn/ui (Radix UI primitives) |
| State / data | TanStack React Query v5 |
| Routing | React Router v6 |
| Backend | Supabase (PostgreSQL + Auth) |
| Charts | Recharts |
| AI | Google Gemini API (user-provided key) |
| Exchange rates | fawazahmed0 CDN currency API (fallback rates embedded) |
| Offline | localStorage-backed offline cache + sync queue |
| Testing | Vitest + React Testing Library (139 tests) |
| Deployment | PWA (installable); Capacitor v8 (iOS/Android builds possible) |

---

## 5. Data Models

### 5.1 transactions

| Field | Type | Description |
|---|---|---|
| id | uuid | Primary key |
| user_id | uuid | Owner |
| description | text | Merchant / label |
| amount | number | Amount in base currency |
| original_amount | number? | Amount in original input currency |
| original_currency | text? | Currency code at input time |
| type | `income \| expense \| transfer` | Transaction type |
| category | text | Budget category name |
| wallet_id | uuid? | Source wallet |
| transfer_wallet_id | uuid? | Destination wallet (transfers) |
| recurring_rule_id | uuid? | Parent rule, if generated |
| recurring_due_date | date? | Due date from rule |
| date | date | Transaction date |
| needs_review | bool | Flagged for user review |
| is_system_generated | bool | Hidden helper tx (change, fee) |
| linked_transaction_id | uuid? | Parent tx for change/fee txs |
| cash_tendered | number? | Amount given in cash |
| created_at | timestamp | |

### 5.2 recurring_rules

| Field | Type | Description |
|---|---|---|
| id | uuid | |
| user_id | uuid | |
| description | text | |
| amount | number | In base currency |
| original_amount | number? | In original currency |
| original_currency | text? | |
| type | `income \| expense \| transfer` | |
| category | text | |
| wallet_id | uuid? | |
| transfer_wallet_id | uuid? | |
| start_date | date | |
| next_due_date | date | Next occurrence |
| frequency | `daily \| weekly \| monthly \| yearly` | |
| end_date | date? | Optional termination |
| installment_total | number? | Total planned installments |
| installment_paid | number? | Completed installments |
| active | bool | Paused / running |

### 5.3 wallets

| Field | Type | Description |
|---|---|---|
| id | uuid | |
| user_id | uuid | |
| name | text | Display name |
| type | `cash \| bank \| card \| e_wallet \| investment \| other` | |
| balance | number | Opening balance (seed) |
| currency | text | Wallet denomination |
| cash_role | `notes \| coins \| mixed \| null` | Cash routing role |

### 5.4 budget_categories

| Field | Type | Description |
|---|---|---|
| id | uuid | |
| user_id | uuid | |
| name | text | Category name |
| yearly_allocated | number | Total annual budget |
| budget_period | `monthly \| yearly` | How to display/normalize |
| color | text | Hex color for charts |

### 5.5 budget_rules

| Field | Type | Description |
|---|---|---|
| id | uuid | |
| user_id | uuid | |
| name | text | Rule label |
| category | text | Target category |
| rule_type | `cap \| minimum \| flexible \| emergency_months` | |
| value | number | Constraint value |

### 5.6 goals

| Field | Type | Description |
|---|---|---|
| id | uuid | |
| user_id | uuid | |
| name | text | Goal label |
| target_amount | number | In base currency |
| current_amount | number | Saved so far |
| deadline | date? | Optional target date |
| color | text | Hex color |
| category | text | Preset category label |
| notes | text? | Freeform notes |

### 5.7 app_settings

| Field | Type | Description |
|---|---|---|
| id | uuid | |
| user_id | uuid | |
| user_name | text | Display name |
| email | text | |
| theme | text | UI theme |
| base_currency | text | Primary / storage currency |
| currency | text | Unified with base (same value) |
| year_start | text | Fiscal year start month |
| default_view | text | |
| annual_goal_label | text | Custom savings goal label |
| annual_goal_pct | number | Target savings % |

### 5.8 investment_config

| Field | Type | Description |
|---|---|---|
| monthly_contribution | number | |
| contribution_currency | text | |
| target_portfolio | number | Goal amount |
| target_currency | text | |
| return_rate | number | % per year |
| duration_years | number | |
| current_value | number | Already invested |
| allocations | JSON | Array of { label, pct, color } |

### 5.9 estimation_plans

| Field | Type | Description |
|---|---|---|
| month | number | 1–12 |
| year | number | |
| estimated_income | number | Legacy scalar |
| fixed_expenses | number | Legacy scalar |
| currency | text | |
| notes | JSON | `{ incomeItems[], expenseItems[], wishlistItems[] }` |

---

## 6. Currency System

### Philosophy

All amounts are stored in the user's **single main currency** (`base_currency`). There is no live-rate conversion applied to historical amounts — numbers never drift over time. Exchange rates are only used at **input time** to convert a foreign-currency transaction to base.

### Migration logic

Both `base_currency` and `currency` fields exist in the DB for legacy compatibility. The effective currency is resolved by preferring whichever field is non-IDR (IDR was the old system default). `base_currency` takes priority; `currency` is the migration fallback:

```
rawBase = settings.base_currency ?? 'IDR'
rawView = settings.currency ?? 'IDR'
effectiveCurrency = rawBase !== 'IDR' ? rawBase : rawView
```

### Supported currencies

`USD · IDR · TWD · EUR · JPY`

### useMoney() hook

Central hook used across every page:

| Helper | Description |
|---|---|
| `baseCurrency` | Effective main currency code |
| `displayCurrency` | Same as baseCurrency (unified) |
| `toBase(amount, currency)` | Convert foreign → base |
| `fromBase(amount, currency)` | Convert base → foreign |
| `format(amount, currency)` | Format any amount in given currency |
| `formatBase(amount)` | Format in baseCurrency |
| `formatDisplay(baseAmount)` | Format stored base amount for display |
| `formatTx(tx)` | Smart format — uses original_amount when original_currency matches base |
| `formatRef(baseAmount)` | Returns null (base === display, no secondary) |
| `approxBase(amount, currency)` | Estimated base equivalent |

### Exchange rates

- Fetched from `cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest`
- 30-minute stale time, 1-hour GC time
- Fallback rates embedded: `USD=1, IDR=16320, TWD=29.67, EUR=0.92, JPY=157`

### Display rules (permanent constraints)

- **Always show full numbers** — never compact to `1.2M` style. This is a wallet app, not a game.
- **Remove trailing `.00`** for whole-number amounts in TWD and other non-decimal currencies.
- IDR symbol rendered as `Rp` (not `IDR`).

---

## 7. Core Features

### 7.1 Dashboard

**Purpose**: At-a-glance financial health summary for the current month.

#### Widgets (top to bottom)

| Widget | Description |
|---|---|
| Greeting banner | Time-aware greeting ("Good morning", "Midday check-in", etc.) |
| Onboarding checklist | New user guide: create categories → add wallet → log transaction (dismisses when complete) |
| Low balance warning | Alert if any wallet balance drops below threshold |
| Quick stats row | Net worth, Amount invested, Monthly savings rate, Savings streak (days) |
| Monthly snapshot | Income vs. Spent, Safe-to-spend/day, Daily burn rate, Days remaining |
| Recent transactions | 5 most recent entries |
| Top spending categories | Visual breakdown with category colors |
| Budget progress | Up to 4 categories with progress bars |
| Category insights | Smart observations: over-pace, anomalies |
| Savings rate gauge | Color-coded gauge (green/yellow/red) |
| Pinned goal | Shows progress for the user's pinned goal |
| Upcoming bills | Next 5 recurring payments due |
| Cash balance history | 12-month area chart |
| AI Financial Insights | Up to 5 Gemini-generated insights (collapsible card, manually refreshable, dismissible) |

#### Safe-to-spend calculation

```
remaining = monthly_budget_total - total_spent_this_month
daily_safe = remaining / days_remaining_in_month
```

#### AI insights data sent to Gemini

Monthly cashflow, daily burn rate, top 8 categories, top 5 goals, over-budget categories, net worth snapshot, savings rate.

---

### 7.2 Transactions

**Purpose**: Full log of all financial events with powerful filtering and bulk tools.

#### List view

- **Tabs**: All · Income · Expense · Transfer · Needs Review
- **Grouped by date** (newest first)
- **Search**: description, category, date, amount, wallet name
- **Date range filter**: from/to (defaults to current month)
- **Wallet filter**: source or destination
- **Category filter**: click category → shows total + % of budget
- **Category sidebar**: all categories with totals for current filter

#### Transaction types

| Type | Description |
|---|---|
| `expense` | Money leaving any wallet |
| `income` | Money entering any wallet |
| `transfer` | Money moving between wallets |

#### Add/Edit form fields

| Field | Required | Notes |
|---|---|---|
| Type | Yes | income / expense / transfer |
| Description | Yes | Free text; merchant autocomplete from history |
| Amount | Yes | In selected input currency |
| Input currency | Yes | Defaults to main currency |
| Category | Expense only | Dropdown from user's budget categories |
| Wallet | Yes | Source wallet |
| Transfer destination | Transfer only | Must differ from source |
| Date | Yes | Defaults to today |
| Recurring | No | See §7.2 Recurring rules |
| Cash change | Expense + cash wallet | See §8 Cash Change Assistant |
| Transfer fee | Transfer only | See §7.2 Transfer fees |

#### Recurring rules

- **Fields**: frequency (daily/weekly/monthly/yearly), next due date, optional end date, installment total
- **Auto-generation**: `useRunDueRecurringRules` hook processes overdue rules on page load
- **Installment mode**: tracks installment_paid vs installment_total; deactivates on completion
- **Duplicate detection**: warns if transaction within 2 days has same description + amount
- **Recurring candidates**: system identifies transactions that appear monthly/weekly and prompts to convert

#### Transfer fees

- Optional fee amount on any transfer (bank/card charges, ATM fee)
- Stored as a system-generated expense transaction (`is_system_generated: true`, `category: 'Transfer Fee'`)
- Linked to parent transfer via `linked_transaction_id`
- Pre-populated in edit form when fee existed
- Shown as a line item in the transfer's detail sheet

#### Bulk operations (select mode)

- Long-press or checkbox to enter select mode
- Select all / deselect all
- Bulk delete (with confirmation)
- Bulk category reassignment

#### Mobile gestures

- **Swipe right**: reveals Edit and Delete actions
- **Long press**: enters select mode

#### Detail sheet

- Full transaction metadata
- Shows cash given + change (if cash transaction)
- Shows transfer fee (if applicable)
- Edit / Delete actions

#### Receipt scanning (AI)

- Camera or file upload
- Gemini OCR extracts: description, amount, category, date
- Auto-fills form fields
- Requires Gemini API key

---

### 7.3 Budget

**Purpose**: Track spending against category budgets for the current period.

#### Category management

- Create categories with: name, yearly budget, period (monthly/yearly), color
- Edit in-place (budget amount, period, color)
- Delete with confirmation
- Restore default starter categories (Food, Transport, Health, etc.)

#### Budget views

- **Monthly** and **Yearly** period modes
- Month/year navigation (previous/next)
- Progress bars color-coded: `< 70%` green · `70–90%` yellow · `≥ 90%` red

#### Metrics per category

- Amount spent / budget allocated
- Usage percentage
- Remaining amount
- Days remaining in period

#### Period normalization

Yearly budget ÷ 12 = monthly equivalent for monthly-view comparisons. Pro-rated for partial months.

#### Forecasting

- If days elapsed > 0, projects month-end spend at current pace
- Over-budget risk rating: Low / Medium / High
- Per-category "pace" indicator

#### Smart suggestions

- Identifies categories missing from user's budget that appear in last 3 months of transactions
- Shows monthly average spend for suggested categories
- One-click add

---

### 7.4 Goals

**Purpose**: Track progress toward specific financial targets.

#### Goal fields

| Field | Notes |
|---|---|
| Name | Free text |
| Target amount | In base currency |
| Current amount | Running balance |
| Deadline | Optional date |
| Category | Savings, Emergency Fund, Vacation, Home, Vehicle, Education, Travel, Gadget, Health, Retirement, Investment, Other |
| Color | 8 preset colors |
| Notes | Optional freeform text |

#### Goal templates

Pre-filled quick-start goals with emoji icons: Emergency Fund, Travel Fund, New Laptop, Tuition, Rent Deposit, New Phone.

#### Contribute flow

1. Open goal detail sheet
2. Enter contribution amount (MoneyKeypad)
3. Select source wallet
4. Optional: enable recurring contribution (creates recurring rule + first transaction automatically)
5. Creates expense transaction with category "Goals"

#### Dashboard metrics

| Metric | Calculation |
|---|---|
| Total saved | Sum of current_amount across all goals |
| Total target | Sum of target_amount |
| Completed goals | current_amount ≥ target_amount |
| Urgent goals | deadline ≤ 30 days AND < 80% complete — OR — deadline ≤ 60 days AND < 50% complete |
| Behind goals | Deadline passed, incomplete |

#### Pinned goal

- User pins exactly one goal to the Dashboard sidebar
- Persisted in localStorage
- Dashboard widget shows real-time progress
- Event dispatched via `CustomEvent` on pin change

---

### 7.5 Subscriptions

**Purpose**: Track recurring expenses and income; visibility into future payment obligations.

#### Subscription fields

| Field | Notes |
|---|---|
| Description | Service name |
| Amount | In selected currency |
| Category | Dropdown with presets |
| Frequency | daily / weekly / monthly / yearly |
| Start date | First occurrence |
| End date | Optional termination |
| Wallet | Payment source |
| Log first payment | Immediately create first transaction |
| Installment mode | Track total / paid installments |

#### Dashboard summary cards

- **Monthly expenses** total (active only, frequency-normalized)
- **Monthly income** total (active only)
- **Next renewal**: name + date of soonest payment
- **3-month outlook**: projected due dates and count for next 3 months

#### Monthly normalization

| Frequency | Monthly factor |
|---|---|
| daily | × 30 |
| weekly | × 4.29 |
| monthly | × 1 |
| yearly | ÷ 12 |

#### List controls

- **Filter**: All · Active · Paused · Due soon (≤ 3 days)
- **Sort**: Due date · Amount desc · Amount asc · Name
- **Search**: description, category

#### Subscription actions

- Pause / Resume (toggle active)
- Log payment now (manually trigger, updates next_due_date)
- Edit
- Delete (with confirmation)

---

### 7.6 Estimation & Planning

**Purpose**: Forward-looking income/expense planning per calendar month.

#### Plan structure (per month/year)

Each plan stores JSON with three item lists:

**Income items**: name, amount, period (monthly/yearly)  
**Expense items**: name, amount, period (monthly/yearly)  
**Wishlist items**: name, amount, type (Want/Need), note

#### Calculated outputs

| Metric | Formula |
|---|---|
| Annual income | Sum of income items normalized to yearly |
| Annual expenses | Sum of expense items normalized to yearly |
| Annual savings | Annual income − Annual expenses |
| Savings rate | Annual savings ÷ Annual income × 100 |
| Wishlist total | Sum of wishlist amounts |

#### Actual vs. Planned comparison

Shows transactions logged in the current month vs. planned estimates for the same period. Calculated from the unfiltered transaction list filtered by `planningDate` (selected month/year).

#### Additional UI

- Month/year navigation
- Add/edit/delete income, expense, and wishlist items inline
- Clear all (with confirm dialog)
- Planning tip banner (dismissible)
- "Convert to goal" action on wishlist items

#### Data persistence

Upserted to `estimation_plans` table keyed on `(user_id, month, year)`.

---

### 7.7 Investing

**Purpose**: Investment portfolio simulator with compound growth projections.

#### Inputs

| Field | Range | Notes |
|---|---|---|
| Monthly contribution | Any | With currency selector |
| Annual return rate | 0–50% | |
| Duration | 1–60 years | |
| Initial capital (current value) | Any | Already invested |
| Target portfolio | Any | Goal amount with currency |
| Contribution frequency | weekly / monthly / quarterly / yearly | |

#### Allocation editor

- Asset class labels + percentage allocation
- Total must equal 100%
- Color per class
- Pre-built risk profiles: Conservative (60% bonds, 30% ETF, 10% cash) · Moderate (60% ETF, 25% bonds, 15% cash) · Aggressive (65% ETF, 25% crypto, 10% cash)

#### Growth projections

- Compound interest (monthly compounding)
- 12-year bar chart with clickable bars (updates duration)
- Multiple scenarios: 5%, 8%, 12% annual returns
- Max-value scaling independent of duration slider

#### Metrics shown

- Projected final portfolio value
- Target gap (remaining to reach goal)
- Target progress %
- Current value vs. target

#### Investment glossary

Dismissible panel explaining: ETF, Bonds, Risk, Compound growth.

---

### 7.8 Reports

**Purpose**: Historical spending analytics with visual breakdowns.

#### Date ranges

Week · Month · 3 months · Year · All time (+ previous/next navigation)

#### Report modes

- Expense mode (default)
- Income mode

#### Charts

- **Bar chart**: Spending by category
- **Line chart**: 12-month savings rate trend
- **Area chart**: Wealth/balance history

#### Metrics

- Total income, total expenses, savings rate for period
- Top category (name + amount)
- Comparison vs. previous period (% change, up/down indicator)

#### Drill-down

Click a category bar → shows all transactions in that category for the period.

#### Wallet filter

Filter all metrics and charts to a single wallet.

#### Toggle internal moves

Show/hide system-generated transactions (cash change transfers, transfer fees).

---

### 7.9 Settings

Settings are organized into six tabs, navigable as a sidebar on desktop and as a native-style list on mobile.

#### Profile tab

- Edit display name
- View account email and sync status
- **Currency**: Single "Main currency" selector (USD / IDR / TWD / EUR / JPY). Both `base_currency` and `currency` fields are saved as the same value. After saving, all transaction inputs, balance displays, and formatting use this single currency.
- Login / Logout (Supabase auth)
- Signup
- PWA install button (if `beforeinstallprompt` available)
- iOS install guidance (Safari share → Add to Home Screen)

#### Wallets tab

- Add wallet: name, type, initial balance, cash role (if cash)
- Wallet types: cash · bank · card · e-wallet · investment · other
- Cash roles: Notes / Wallet · Coins / Pouch · Mixed
- **Change routing preference** (if any cash wallets exist):
  - Coin pouch: NT$50 → coins, smaller → coins
  - Main wallet: NT$50 stays with notes
  - All change to pouch: everything → coins wallet
- List grouped by type with calculated live balance
- Rename wallet, edit cash role, delete (with confirmation)

**Cash setup guide**: shown if no cash wallet has a role assigned yet. Explains how to configure notes + coins wallets for automatic change routing.

#### Categories tab

- Add category (name only — budget amount set in Budget page)
- Rename, delete
- Restore default starter categories

#### AI Features tab

- Gemini API key input (password field, toggleable)
- Privacy disclosure: what is/isn't sent to Gemini
- Status indicator (enabled/disabled)
- Desktop-only for key entry; mobile shows status only

#### Security tab

- 4-digit PIN lock (hashed in localStorage)
- Enable / Disable PIN
- Privacy & Data policy summary

#### Backup & Export tab

- **Data Safety dashboard**: storage type, last backup date, PIN status, cloud sync status
- **Export backup**: Full JSON download (`finpath-backup-YYYY-MM-DD.json`) containing all tables
- **Import backup**: File upload with preview (counts of wallets, categories, transactions, rules), confirm before applying
- **Paste JSON** (desktop only): Import by pasting JSON directly

---

### 7.10 Quick Add Sheet

A globally accessible bottom sheet for fast transaction entry, triggered from the bottom nav bar or floating action button. Mirrors the full Transactions form with a streamlined layout.

#### Features

- All transaction types (income / expense / transfer)
- MoneyKeypad for amount input (suppresses system keyboard on mobile)
- Merchant autocomplete from transaction history
- Category and wallet dropdowns
- Date picker
- Currency selector (defaults to main currency)
- Cash change assistant (same logic as full form)
- Receipt scanning via Gemini
- Recurring toggle + frequency
- Installment total field
- Remembers last-used wallet and category (localStorage)
- Restores defaults on sheet close

---

## 8. Cash Change Assistant

**Purpose**: Automatically route change from cash payments into the correct wallet(s), eliminating manual entry.

### Prerequisites

At least one cash wallet with `cash_role = 'notes'` and one with `cash_role = 'coins'` configured in Settings → Wallets.

### Workflow

1. User records a cash expense
2. Enables "Paid with cash" toggle
3. Enters the denomination given (e.g., NT$500)
4. System calculates change = cash_tendered − expense_amount
5. System splits change into bills and coins per routing rules
6. On save: system-generated transfer transactions are created for each portion of change, linked to the expense via `linked_transaction_id`

### TWD routing logic

| Change amount | Policy: Coins | Policy: Notes | Policy: All-coins |
|---|---|---|---|
| ≥ NT$100 (bills) | → Notes wallet | → Notes wallet | → Coins wallet |
| NT$50 | → Coins wallet | → Notes wallet | → Coins wallet |
| < NT$50 (coins) | → Coins wallet | → Coins wallet | → Coins wallet |

### Non-TWD routing

All change → single destination wallet (coins wallet if exists, else notes).

### Edit form restore

When editing a transaction that had cash change, the form restores:
- `cashEnabled = true`
- `cashTendered` (converted back to original currency)
- Bills and coins destination wallet IDs (found via linked system-generated transactions)

A summary banner at the top of the edit form shows the previously recorded "Cash given / Change" amounts.

### System-generated transactions

- `is_system_generated: true` — hidden from the main transaction list
- `category: 'Change bills'` or `'Change coins'`
- `type: 'transfer'` (from expense wallet to change wallet)
- Visible in Reports when "Show internal moves" is enabled
- Still affect wallet balances

---

## 9. AI & Smart Features

### 9.1 Receipt scanning (Gemini)

| Property | Value |
|---|---|
| Model | `gemini-2.5-flash-lite` |
| Input | Receipt image (base64 + MIME type) |
| Output | `{ description, amount, category, date }` |
| Trigger | Camera/file button in transaction forms |
| Requirement | User-provided Gemini API key |

Extracts merchant name, final total (excluding tips unless written), spending category, and purchase date. Auto-fills the transaction form. User reviews before saving.

### 9.2 AI financial insights (Gemini)

| Property | Value |
|---|---|
| Max insights | 5 |
| Insight types | `warning · opportunity · tip · alert` |
| Shown on | Dashboard (collapsible card) |
| Refresh | Manual button |
| Dismissible | Yes (localStorage flag) |

**Data sent** (never includes descriptions, merchant names, or account details):
- Monthly + annual income, expenses, net
- Daily burn rate + projection
- Top 8 categories with amounts + budgets
- Top 5 goals (name + progress %)
- Over-budget categories
- Net worth snapshot
- Savings rate

**System prompt rules**:
- Never produce generic advice ("save more" is forbidden)
- Every insight must cite the user's actual numbers
- Educational framing: "you may want to consider..."
- Ranked by financial impact
- No padding if data is insufficient

### 9.3 Merchant autocomplete

`getMerchantSuggestion(description, transactions)` — matches description prefix against transaction history and suggests known merchants in real time.

### 9.4 Recurring candidate detection

`getRecurringCandidates(transactions)` — identifies up to 4 transactions that appear to repeat on a monthly or weekly basis and are not already in a recurring rule. Shown as prompts in the Transactions page.

### 9.5 Category insights

`getCategoryInsights(transactions, categories, date)` — detects spending anomalies and over-pace warnings. Shown on the Dashboard below budget progress bars.

---

## 10. Offline & Data Persistence

### Offline cache

All major queries have a localStorage mirror. Reads are served from cache instantly; writes go to both cache and the sync queue.

### Sync queue

When offline, mutations are enqueued:
```
{ table, op: 'insert'|'update'|'delete', data, matchId, userId }
```
Queue auto-flushes on reconnect.

### Guest mode

- No authentication required
- All data stored in localStorage
- Fully functional; no cloud sync
- On first login: all guest data migrated to Supabase automatically
- Pre-migration backup created for recovery

### Optimistic UI

All mutations reflect immediately in the UI. If the network request fails, the change is queued and the UI stays consistent.

---

## 11. Authentication & Security

### Authentication

- Supabase email + password (no OAuth in v2)
- Session tokens managed by Supabase client
- Guest mode (unauthenticated) — full feature access, local storage only
- Login/signup available in Settings → Profile (mobile) and sidebar (desktop)

### PIN lock

- Optional 4-digit PIN
- Stored as a hash in localStorage (`PIN_STORAGE_KEY`)
- Session flag in sessionStorage (`PIN_SESSION_KEY`) — survives page refresh, cleared on tab close
- `PinLock` component wraps the app; shows lock screen when PIN is set and session has no flag
- Enable / disable from Settings → Security

### Data isolation

- All Supabase queries are scoped to `user_id` (Row Level Security enforced server-side)
- Gemini API key stored only in localStorage, never sent to FinPath servers
- No sensitive account details stored unencrypted

---

## 12. Notifications

### Notification types

| Type | Trigger |
|---|---|
| Recurring payment due | Recurring rule next_due_date ≤ 3 days away |
| Budget overage | Category spend exceeds allocated budget |
| Low wallet balance | Balance drops below user-configured threshold |
| Goal milestone | current_amount reaches target_amount |
| Savings rate change | Monthly savings rate changes significantly |

### NotificationsSheet

- Bottom drawer (mobile) / sidebar panel (desktop)
- Lists recent notifications with timestamps
- Individual dismiss
- Badge count on navbar icon

---

## 13. Navigation & UX Patterns

### Navigation structure

**Mobile**: Bottom navigation bar with icons for Dashboard, Transactions, Budget, Goals, and a Quick Add FAB in the center.

**Desktop**: Left sidebar with full labels for all pages including Subscriptions, Estimation, Investing, Reports, and Settings.

### Sheets & modals

- **Sheet**: Right-to-left or bottom slide for forms (transactions, budgets, goals, subscriptions)
- **ConfirmDialog**: Destructive actions always require explicit confirmation
- **Detail sheet**: Read-only view of a selected transaction or goal with action buttons at the bottom

### Mobile input

- **MoneyKeypad**: Custom in-app numeric keypad that prevents the system keyboard from appearing. Used for all amount fields in mobile forms.
- `readOnly` inputs paired with MoneyKeypad prevent unwanted scroll-to-focus behavior
- Back button on Android (via `finpath-close-keypad` event) closes the active keypad

### Responsive layout

| Breakpoint | Layout |
|---|---|
| Mobile (< lg) | Bottom nav, full-width bottom sheets, single column |
| Desktop (≥ lg) | Left sidebar, multi-column cards, inline sheets |

### Haptics

`haptics.ts` dispatches haptic feedback on mobile for key interactions (long press, selection, destructive actions).

### Swipe gestures (mobile)

Transaction list items support horizontal swipe to reveal Edit and Delete actions. Swipe state tracked per-item to prevent conflicts with scroll.

### PWA install

- `beforeinstallprompt` captured → Install button shown in Settings
- iOS: Share → Add to Home Screen guidance shown in Settings
- `appinstalled` event clears the prompt

---

## 14. Third-Party Integrations

| Service | Purpose | Key |
|---|---|---|
| **Supabase** | Database + Auth | Environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) |
| **Gemini API** | Receipt OCR, AI insights | User-provided in Settings; fallback from `VITE_GEMINI_API_KEY` |
| **fawazahmed0 Currency API** | Live exchange rates | No key required (CDN) |
| **Recharts** | Charts (bar, line, area) | npm package |
| **Capacitor v8** | Native iOS/Android wrapper (optional) | Build tool |

---

## 15. Display & Formatting Rules

These rules are permanent and must not be violated by any future change.

### Number display

1. **No compact notation** — amounts are never shown as `1.2M`, `500K`, or similar. Always show the full number. This is a personal finance app, not a game dashboard.
2. **No trailing `.00`** — whole-number amounts in TWD (and any currency where the result is an integer) drop the decimal. `NT$1,000` not `NT$1,000.00`.
3. **IDR symbol** — always rendered as `Rp`, never as `IDR`.
4. **TWD symbol** — rendered as `NT$` via `Intl.NumberFormat`.
5. **Negative amounts** — prefixed with `−` (minus sign) for expenses, `+` for income.
6. **Transfer amounts** — no sign prefix; shown in muted color.

### Currency input

- Transaction forms default to the user's main currency on open
- Input currency resets to main currency when a new form opens or the sheet closes
- Input currency sync effect overwrites state whenever `money.displayCurrency` changes (no guard)
- Edit forms restore the `original_currency` of the edited transaction

### Formatting utilities

```
formatCurrency(amount, currency)  → full locale-formatted string
formatDisplay(baseAmount)         → formatted in baseCurrency
formatTx(tx)                      → uses original_amount if original_currency === baseCurrency
```

---

*End of PRD — FinPath v2.0*
