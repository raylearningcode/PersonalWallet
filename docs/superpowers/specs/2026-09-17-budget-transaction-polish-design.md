# Design: Budget rollover and transaction flow polish

Date: 2026-09-17
Status: Draft for user review

## Context

The current Budget page already calculates monthly rollover automatically, but users cannot decide which categories roll over or how much carries forward. Category allocation also mixes funded and unfunded categories, making the page feel busier than the budgeting task requires.

The add-transaction flow is mobile-shaped even on desktop, hides important payment features behind an Advanced details button, and preselects category/wallet from previous usage. The user wants a smoother, more deliberate flow: start blank, choose category/wallet intentionally, and make split categories, multi-wallet payment, and transfer fees easy to use without an odd secondary mode.

## Goals

- Make rollover an optional per-category budget setting.
- Keep Budget allocation focused on categories that actually have a budget.
- Make adding a budget cover both existing unfunded categories and brand-new categories.
- Simplify category creation to icon, name, and save.
- Replace chip-heavy category/wallet selection with searchable selector sheets.
- Remove the Advanced details mode from expense, income, and transfer creation.
- Give desktop transaction entry its own layout instead of a mobile-looking sheet.
- Keep mobile bottom sheets safe around both gesture navigation and old Android navigation buttons.

## Budget Model

Budget categories gain persistent settings:

- `reset_frequency`: initially `monthly` and `yearly`, matching the existing budget periods.
- `reset_start_day`: integer `1` through `31`, shown as `1st day of the month` through `31st day of the month`.
- `rollover_enabled`: boolean.
- `rollover_mode`: `all_unused` or `custom_cap`.
- `rollover_cap`: nullable amount used only when `rollover_mode` is `custom_cap`.

Existing `budget_period` remains supported during migration. The UI can treat it as reset frequency until code paths are fully renamed.

Rollover is computed only for categories where `rollover_enabled` is true. If enabled:

- `all_unused` carries the previous reset period's positive remainder.
- `custom_cap` carries the positive remainder capped at `rollover_cap`.
- Overspending never carries a negative value forward.
- Each category is independent; enabling rollover on Food does not affect Transport.

## Budget Page

The allocation section shows only categories with a budget amount greater than zero. Categories without a budget move out of the primary allocation list.

The primary action becomes `+ Add budget`. It opens a selector where the user can:

- Choose an existing category with no budget and assign an amount/settings.
- Create a new category and budget in one flow.

Editing a budget opens a budget editor with:

- Amount.
- Reset frequency.
- Reset start day (`1st day of the month` through `31st day of the month`).
- Rollover on/off.
- Rollover mode and cap when enabled.

The editor removes color selection. The app uses one minimalist budget accent color plus category icons for recognition.

## Category Creation

The minimal category creation flow is:

- Pick an icon.
- Enter category name.
- Save.

For now, implement a broad built-in emoji picker good enough for daily use, backed by a local curated emoji list grouped by common categories. Manual emoji text input remains as a fallback.

## Add Transaction Flow

New transactions should not inherit the last selected category or wallet. Category and wallet start empty for expense, income, and transfer. The user must choose them.

Remove the `Advanced details` button. The available options should be visible in the same flow, but arranged so the form still feels calm:

- Expense shows amount, date, merchant/note, category selector, wallet selector, split across categories, pay from multiple wallets, and cash/change controls when applicable.
- Income shows amount, date, note, income category selector, and wallet selector.
- Transfer shows amount, date, note, from wallet, to wallet, and transfer fee controls when applicable.

Category and wallet selectors look like dropdown fields. On mobile, tapping one opens a bottom sheet with search and a scrollable table-style list. The sheet rises from the bottom and should reach up to the amount area, leaving only the amount visible above it. The sheet must include safe bottom padding so actions and list rows do not overlap Android gesture bars or legacy three-button navigation.

On desktop, selectors can open popovers or side-by-side list panels rather than full mobile bottom sheets.

## Desktop Transaction UI

Desktop transaction entry should stop feeling like the mobile form stretched into a sheet. The desktop flow should use a wider, work-focused layout:

- Left or top area for amount/type/date/note.
- Main fields for category and wallet selectors.
- Inline sections for split categories, multi-wallet payment, cash/change, recurring-rule edits, and transfer fee.
- Save action remains clearly visible without sticky mobile chrome.

Desktop can still be opened from the Transactions page, but it should present as a right panel or centered modal sized for desktop scanning.

## Transfer Fee Behavior

When transfer type is selected and either the source or destination wallet is a bank wallet, show a transfer fee option directly in the transfer form. The user can choose no fee or enter a fee amount. The saved fee remains a linked expense using the existing transfer-fee behavior.

For non-bank transfers, the fee option can stay hidden unless editing an existing transfer that already has a fee.

## Home Spending Trend

The Dashboard spending trend should be cleaned up so labels and value annotations never overlap. Use reserved vertical space for values, simpler labels, and responsive behavior for mobile and desktop. The chart should remain compact and readable.

## Data And Compatibility

Add a Supabase migration for the new budget settings and update local storage defaults so guest/offline usage behaves the same way. Existing categories default to:

- reset frequency from existing `budget_period`, defaulting to `monthly`.
- reset start day `1`.
- rollover disabled.
- rollover mode `all_unused`.
- rollover cap `null`.

Budget math must handle older cached categories that lack the new fields.

## Testing

Add or update tests for:

- Rollover disabled by default.
- Per-category rollover enabled with all unused.
- Per-category rollover enabled with a custom cap.
- Budget allocation hides unfunded categories.
- Add budget can choose an unfunded category.
- Transaction form starts with empty category and wallet.
- Category/wallet selector opens a mobile-safe sheet.
- Advanced details button no longer appears for expense, income, or transfer.
- Bank transfers expose transfer fee controls.
- Dashboard spending trend renders without overlapping labels in tested viewports.

## Out Of Scope

- A perfect full-system emoji keyboard clone.
- Replacing the entire category system.
- Rewriting existing transaction category strings.
- A full visual redesign of unrelated pages.
