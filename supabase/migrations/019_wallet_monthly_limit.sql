-- 019_wallet_monthly_limit.sql
-- Optional per-wallet monthly spending cap (0 = no limit), surfaced on the
-- Budget page as a wallet-limits section.

alter table wallets
  add column if not exists monthly_limit numeric not null default 0;
