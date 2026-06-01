-- Cash Change Assistant: add cash role tracking to wallets
alter table wallets
  add column if not exists cash_role text check (cash_role in ('notes', 'coins', 'mixed', 'digital_cash')),
  add column if not exists default_change_wallet_id uuid references wallets(id) on delete set null;

-- Cash Change Assistant: add linked transfer tracking to transactions
alter table transactions
  add column if not exists is_system_generated boolean not null default false,
  add column if not exists linked_transaction_id uuid,
  add column if not exists cash_tendered numeric check (cash_tendered is null or cash_tendered >= 0);
