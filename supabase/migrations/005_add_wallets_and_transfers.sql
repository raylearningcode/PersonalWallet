create table if not exists wallets (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  type text not null default 'cash' check (type in ('cash', 'bank', 'card', 'e_wallet', 'investment', 'other')),
  balance numeric not null default 0,
  currency text not null default 'IDR',
  created_at timestamptz default now()
);

insert into wallets (name, type, balance, currency)
values
  ('Cash', 'cash', 0, 'IDR'),
  ('Debit card', 'card', 0, 'IDR')
on conflict (name) do nothing;

alter table transactions
  add column if not exists wallet_id uuid references wallets(id) on delete set null,
  add column if not exists transfer_wallet_id uuid references wallets(id) on delete set null;

alter table transactions drop constraint if exists transactions_type_check;
alter table transactions
  add constraint transactions_type_check
  check (type in ('income', 'expense', 'recurring', 'transfer'));

update transactions
set wallet_id = (select id from wallets where name = 'Cash' limit 1)
where wallet_id is null;
