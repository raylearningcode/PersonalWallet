# FinPath Personal Wallet — Design Spec
**Date:** 2026-05-26  
**Stack:** Vite + React 18 + TypeScript + Tailwind CSS + shadcn/ui + Recharts + Supabase  
**Scope:** 7 screens, no auth, single-user, dark premium theme

---

## 1. Architecture

### Tech Stack
| Layer | Choice |
|---|---|
| Build tool | Vite |
| UI framework | React 18 + TypeScript |
| Styling | Tailwind CSS |
| Component library | shadcn/ui |
| Charts | Recharts |
| Routing | React Router v6 |
| Data fetching | TanStack Query v5 |
| Database | Supabase (PostgreSQL) |

### Folder Structure
```
src/
  components/
    layout/        # Sidebar, AppLayout
    ui/            # shadcn/ui primitives (auto-generated)
    shared/        # StatCard, SectionHeader, CategoryBar, etc.
  pages/
    Dashboard.tsx
    Transactions.tsx
    Budget.tsx
    Investing.tsx
    Estimation.tsx
    Reports.tsx
    Settings.tsx
  lib/
    supabase.ts    # createClient singleton
    queries.ts     # all TanStack Query hooks
  types/
    index.ts       # shared TypeScript interfaces
  App.tsx          # Router setup
  main.tsx
```

### Routing (sidebar order)
```
/               → Dashboard
/transactions   → Transactions
/budget         → Budget
/investing      → Investing
/estimation     → Estimation Planner
/reports        → Reports
/settings       → Settings
```

All routes share `AppLayout`: fixed left sidebar (240px) + scrollable main content area.

---

## 2. Layout

### Sidebar
- Top: FinPath logo + "Personal finance OS" tagline
- Search bar (cosmetic filter input)
- Nav links with active state highlight: Dashboard, Transactions, Budget, Investing, Estimation, Reports, Settings
- Bottom: User avatar + name (Rayhan)

### Main Content
- Page header: screen title + subtitle describing the screen's purpose
- Content area with card-based sections
- Dark premium theme: deep navy/charcoal backgrounds, subtle card borders, white text

---

## 3. Data Model (Supabase)

### `transactions`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| description | text | |
| amount | numeric | always positive |
| type | text | `income` \| `expense` \| `recurring` |
| category | text | matches budget_categories.name |
| date | date | |
| needs_review | boolean | default false |

### `budget_categories`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | text | e.g. Housing, Food |
| yearly_allocated | numeric | user-defined yearly limit |
| color | text | hex color for UI |

### `budget_rules`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | text | e.g. "50% cap", "20% minimum" |
| category | text | linked category name |
| rule_type | text | `cap` \| `minimum` \| `flexible` \| `emergency_months` |
| value | numeric | percentage or number of months |

### `investment_config`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | singleton row |
| monthly_contribution | numeric | |
| return_rate | numeric | annual %, e.g. 7.0 |
| duration_years | integer | |
| current_value | numeric | actual portfolio value today |

### `estimation_plans`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| month | integer | 1–12 |
| year | integer | |
| estimated_income | numeric | |
| fixed_expenses | numeric | |
| variable_estimate | numeric | |
| currency | text | e.g. IDR, USD |
| notes | text | optional |

### `app_settings`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | singleton row |
| user_name | text | |
| email | text | |
| theme | text | `dark` |
| currency | text | default USD |
| year_start | text | e.g. January |
| default_view | text | Dashboard |
| notifications | text | e.g. Weekly digest |
| annual_goal_label | text | e.g. "$20k net worth" |
| annual_goal_pct | integer | 0–100 |

---

## 4. Pages

### Dashboard (`/`)
**Purpose:** High-level financial health snapshot.

**Components:**
- 4 stat cards: Total Balance, Spent YTD, Saved, Invested — each with a % change badge
- "Investment path" card: recommended monthly contribution to invest, based on savings rate
- "Spending overview" card: Recharts BarChart of spending by category for current period

**Data queries:**
- Sum of `transactions.amount` grouped by type for current year
- `investment_config` for the recommendation text
- `budget_categories` for spending overview chart

---

### Transactions (`/transactions`)
**Purpose:** Full cashflow ledger with filters and review queue.

**Components:**
- Filter tabs: All | Income | Expense | Recurring | Needs review
- 3 summary chips: Money in, Money out, Uncategorized count
- shadcn/ui DataTable: columns — Date, Description, Category, Amount, Type, Actions
- Row actions: mark reviewed, edit category, delete

**Data queries:**
- All `transactions` ordered by date desc, filtered by active tab
- Aggregated totals per type

---

### Budget (`/budget`)
**Purpose:** Yearly plan with per-category limits and smart rules.

**Components:**
- 3 summary cards: Yearly Budget, Remaining, Overspend Risk badge (Low/Medium/High)
- Category allocation list: each item shows name, progress bar (sum of `transactions.amount` for that category / `budget_categories.yearly_allocated`), % used label
- Budget rules panel: list of `budget_rules` with rule type badges

**Data queries:**
- `budget_categories` with computed yearly_spent from `transactions`
- `budget_rules`

---

### Investing (`/investing`)
**Purpose:** Portfolio projection and ROI simulator.

**Components:**
- Projected portfolio value card (computed from investment_config)
- Recharts LineChart: compound growth curve over duration_years
- "Growth simulation" panel: 3 inputs (monthly contribution, return rate %, years) — updating reruns the simulation in real-time (no DB write on simulation)
- "Investment ROI simulator": shows final value, total contributed, gain

**Computation (client-side):**
```
FV = P × [((1 + r)^n - 1) / r]
where P = monthly contribution, r = monthly rate, n = months
```

**Data queries:**
- `investment_config` (1 read on mount)
- Simulation runs entirely in component state

---

### Estimation Planner (`/estimation`)
**Purpose:** Plan future months before they happen.

**Components:**
- Toggle: Monthly | Yearly view
- Currency selector (persists to `estimation_plans.currency`)
- 4 stat cards: Estimated Income, Fixed Expenses, Variable Estimate, Possible Saving (computed: income − fixed − variable), Saving Rate %
- Form panel: inputs for each field, save to `estimation_plans`
- Table of past estimation plans

**Data queries:**
- `estimation_plans` ordered by year desc, month desc
- Insert/update on form submit

---

### Reports (`/reports`)
**Purpose:** Annual summaries, trends, and exportable insights.

**Components:**
- 3 stat cards: Savings Rate %, Avg Monthly Spend, Top Spending Category
- Recharts BarChart: monthly spending across the year (12 bars)
- Insights library: 4 cards (Monthly Summary, Tax Prep, Subscription Audit, Investment Review) — each shows a badge and an "Open" button that expands a detail panel

**Data queries:**
- `transactions` grouped by month for the bar chart
- Derived stats from aggregated transaction data

---

### Settings (`/settings`)
**Purpose:** Profile, preferences, categories, and goal tracking.

**Components:**
- Profile card: avatar initials, name, email, "Edit profile" button → inline edit form
- Preferences panel: Theme, Currency, Year start, Default view, Notifications — each as a shadcn/ui Select
- Category manager: add/remove/rename `budget_categories`
- 2026 Goal card: label + shadcn Progress bar at `annual_goal_pct`

**Data queries:**
- `app_settings` singleton (read on mount, upsert on save)
- `budget_categories` CRUD

---

## 5. Theme

Dark premium palette (Tailwind custom config):
- Background: `#0B0F1A`
- Card surface: `#131929`
- Card border: `#1E2A3A`
- Primary accent: `#6C63FF` (purple)
- Success: `#22C55E`
- Warning: `#F59E0B`
- Danger: `#EF4444`
- Text primary: `#F1F5F9`
- Text muted: `#64748B`

---

## 6. Error Handling

- TanStack Query handles loading/error states per query
- Each page shows a skeleton loader while data loads
- Failed mutations show a shadcn/ui toast (error message)
- Supabase connection errors surface as full-page error banners

---

## 7. Out of Scope

- User authentication (no login/signup)
- Multi-user support
- Mobile responsiveness (desktop-first)
- File export (CSV/PDF) — Reports "Open" buttons are UI-only panels
- Push notifications
