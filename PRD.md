# FinPath — Product Requirements Document

**Version:** 0.1.0 | **Date:** 2026-06-13 | **Status:** Pre-release

---

## 1. Product Identity

**FinPath** is a privacy-first, manual-entry personal finance tracker. It runs as a PWA with Capacitor wrappers for Android/iOS. No bank connections. All data stays on-device (guest mode) or in user-owned Supabase.

**Tagline:** Personal Finance OS — track, budget, invest, plan.

**Target audience:** Privacy-conscious individuals who want full control over their financial data. Indonesian/Taiwanese market focus (IDR/TWD multi-currency, TWD cash change assistant), but usable globally.

---

## 2. Current Feature Inventory

### Core
| Feature | Status | Notes |
|---------|--------|-------|
| Multi-currency transactions (USD/IDR/TWD/EUR/JPY) | ✅ Done | Rate preservation prevents drift |
| Income / Expense / Transfer types | ✅ Done | |
| Wallet management (Cash/Bank/Card/E-wallet/Investment) | ✅ Done | Cash roles: notes/coins/mixed |
| Category-based budgeting (monthly/yearly) | ✅ Done | |
| Guest mode (localStorage, no account needed) | ✅ Done | Full offline functionality |
| Cloud sync via Supabase Auth | ✅ Done | Guest → account migration |
| PWA with service worker | ✅ Done | Installable on mobile/desktop |
| Capacitor Android wrapper | ✅ Done | Native haptics, notifications, splash |

### Smart Features
| Feature | Status | Notes |
|---------|--------|-------|
| TWD Cash Change Assistant | ✅ Done | Unique — no competitor has this |
| Recurring rules / subscription tracking | ✅ Done | Auto-generate due payments |
| Goal tracking with templates | ✅ Done | | 
| Investment simulator (compound projection) | ✅ Done | With inflation toggle |
| Real portfolio tracker (live prices) | ✅ Done | CoinGecko + Yahoo Finance |
| Financial planning / estimation | ✅ Done | |
| Reports (charts, period comparison, CSV export) | ✅ Done | |
| Calendar view (monthly heatmap + yearly grid) | ✅ Done | |
| Transaction splitting (multi-category) | ✅ Done | |
| Multi-wallet payment (notes + coins) | ✅ Done | |
| AI insights (receipt scan + spending analysis) | ✅ Done | Custom API, pre-configured |
| PIN lock | ✅ Done | |
| Data backup/restore (JSON) | ✅ Done | |
| CSV import | ✅ Done | |
| PWA shortcuts (Quick-add) | ✅ Done | |
| Android home screen widget | ✅ Done | Skeleton — opens app |

---

## 3. Competitive Landscape (June 2026)

### Direct competitors (manual/offline tracking)

| App | Price | Key Edge | Weakness |
|-----|-------|----------|----------|
| **Spendee** | $2.99/mo | Beautiful UI, shared wallets, crypto | Free tier useless (1 wallet), no splits |
| **Wallet by BudgetBakers** | $6.39/mo | PC sync, 15K bank connections, deep reports | Complex UI, no investment tools |
| **Money Manager** | Free/$5 | Simple, good for basic tracking | No AI, no investing, limited reporting |
| **Finma** | Free/$2.99 | Email statement import, on-device | iOS only, no investing |
| **Skwad** | $49-65/yr | Bank email alerts, no Plaid | Android only, new (2025) |
| **Aurum** | Free/$9 | Simple manual tracking | Very basic, solo founder |

### Indirect competitors (bank-connected)

| App | Price | Key Edge |
|-----|-------|----------|
| **YNAB** | $14.99/mo | Zero-based budgeting, debt payoff |
| **Monarch Money** | $14.99/mo | Best Mint replacement, customizable |
| **Rocket Money** | Free-$14/mo | Subscription cancellation concierge |
| **Empower** | Free | Net worth tracking, retirement planner |
| **Quicken Simplifi** | $3.99/mo | Best all-around, cash flow forecasting |

### FinPath's moat
1. **Completely free** — all competitors charge $3-15/month
2. **Full offline + guest mode** — no competitor has this
3. **TWD cash change assistant** — wholly unique
4. **Investment simulator + real portfolio** — most manual trackers lack investing
5. **Multi-currency with rate preservation** — more sophisticated than competitors
6. **Transaction splitting built-in** — most-cited missing feature across all apps
7. **Privacy-first** — no bank connection required, data stays local

### Where competitors are ahead
| Gap | Leader | 
|-----|--------|
| Voice/chat expense entry | Monely, Rolly, Saro |
| AI-generated budgets | Rolly, FPM |
| Shared/couple finances | Spendee, Monely |
| Bank statement import (email) | Finma, Skwad |
| Item-level receipt breakdown | Finei, Receiptly |
| Gamification & streaks (advanced) | Monely, Rolly |
| Tax/deduction tagging | FPM, Finei |
| Custom category icons | Spendee ("Oh My Cost" has 500+) |

---

## 4. Market Trends & User Demands (Research Synthesis)

### What users consistently complain about across ALL apps:
1. **Transaction splitting** — #1 most-requested feature. FinPath already has it.
2. **Bank sync unreliability** — "syncing issues cause discrepancies." FinPath avoids this entirely.
3. **Too expensive** — subscription fatigue is real. FinPath is free.
4. **No desktop/web access** — many apps are mobile-only. FinPath is PWA.
5. **Complex UI** — "too many features make it hard to use." Need to balance.
6. **Poor free tiers** — Spendee's 1-wallet limit is universally hated. FinPath has full free tier.

### Emerging trends FinPath should watch:
1. **Voice/chat input** — "Coffee $5 at Starbucks" → transaction. Rolly, Monely, Saro.
2. **AI-powered budgeting** — auto-generate budgets from spending patterns. Rolly, FPM.
3. **Item-level receipt scanning** — not just total, but each line item. Finei, Receiptly.
4. **Gamification** — streaks, badges, challenges. Monely.
5. **On-device AI** — privacy trend. Savi, MoneyPocket.
6. **Widgets and lock screen** — quick balance check. Saro.
7. **WhatsApp/Telegram integration** — log expenses via messaging. Monely.
8. **Predictive alerts** — warn BEFORE overspending, not after. Finei.

---

## 5. Future Roadmap (v0.2 → v1.0)

### v0.2 — Form Simplicity & Polish (next)
- [ ] Advanced/Simple toggle for desktop transaction form (#4 from review)
- [ ] Remove readOnly inputs on desktop (let users type directly)
- [ ] Merge Reports category cards
- [ ] Remove duplicate Reports period nav
- [ ] Budget: better view mode labels, simplified color picker
- [ ] Goals: reduce color picker size, fix duplicate navigation
- [ ] Subscriptions: remove duplicate edit UI, responsive grid
- [ ] Settings: merge profile save buttons

### v0.3 — Smart Input
- [ ] **Natural language expense entry** — type "lunch 12.50 food" → auto-parsed transaction
- [ ] **Voice input** — hold mic button, say "coffee 5 bucks," app parses it
- [ ] **Quick-amount presets** — customizable common amounts per category
- [ ] **Swipe actions on transaction cards** — swipe left to delete, right to edit

### v0.4 — Intelligence
- [ ] **AI-generated budgets** — analyze 3 months of spending, suggest category allocations
- [ ] **Predictive overspend alerts** — "Based on your pace, you'll exceed Food budget by Friday"
- [ ] **Recurring pattern detection** — auto-detect subscriptions from transaction history
- [ ] **Spending insights v2** — "Your coffee spending is 40% higher than last month"

### v0.5 — Engagement
- [ ] **Enhanced notification system** — push notifications for bills, budget warnings
- [ ] **Monthly financial summary** — auto-generated report card
- [ ] **Savings challenges** — 52-week challenge, no-spend month tracker
- [ ] **Streak celebrations** — "30-day logging streak!" animations

### v1.0 — Ecosystem
- [ ] **Full Android widget with live data** — balance, today's spend, quick-add
- [ ] **iOS widget** — via Capacitor
- [ ] **Apple Watch companion** — quick log, balance check
- [ ] **WhatsApp bot integration** — forward receipt photo → auto-logged
- [ ] **Email receipt forwarding** — forward email receipts → parsed transactions
- [ ] **Multi-device real-time sync** — currently needs manual refresh

---

## 6. Technical Debt & Architecture

### Maintain
- Dual-path offline/online architecture (well-abstracted)
- TanStack React Query for server state
- Mobile/desktop component split (intentional, don't merge)
- Dark theme only (user preference confirmed)
- Supabase RLS for multi-tenancy

### Improve
- Add top-level error boundary
- Remove Budget Rules dead code (table exists, queries exist, UI removed)
- Add E2E tests (Playwright) for critical flows
- Consider IndexedDB for larger guest data (currently localStorage, ~5MB limit)
- Extract shared form logic between QuickAddSheet and Transactions form

### Watch
- React 19.2.6 + `@testing-library/react` version compatibility (use vi.mock workaround)
- Capacitor 8 plugin ecosystem — some plugins still catching up
- Supabase free tier limits (500MB database, 5GB bandwidth)

---

## 7. Monetization Strategy (Future)

Currently free. Options to consider:
- **Free forever** — funded by user's own Supabase project
- **FinPath Cloud** — hosted Supabase, $3/mo (cheaper than all competitors)
- **Premium features** — AI insights, advanced reports, family sharing ($5/mo)
- **White-label** — license to banks/fintechs in Indonesia/Taiwan

---

## 8. Key Metrics to Track

- Daily active users (DAU)
- Transactions per user per day
- Guest vs. authenticated ratio
- Feature usage: cash assistant, splits, AI, portfolio, calendar
- Drop-off points in transaction form
- Time to first transaction (onboarding effectiveness)

---

*Last updated: 2026-06-13. Created from deep code review + competitive research + user review analysis.*
