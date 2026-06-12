alter table transactions
  add column if not exists recurring_rule_id uuid,
  add column if not exists recurring_due_date date;

create table if not exists recurring_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  description text not null,
  amount numeric not null check (amount >= 0),
  original_amount numeric not null default 0 check (original_amount >= 0),
  original_currency text not null default 'IDR' check (original_currency in ('USD', 'IDR', 'TWD', 'EUR', 'JPY')),
  type text not null check (type in ('income', 'expense', 'transfer')),
  category text not null,
  wallet_id uuid references wallets(id) on delete set null,
  transfer_wallet_id uuid references wallets(id) on delete set null,
  start_date date not null default current_date,
  next_due_date date not null default current_date,
  frequency text not null default 'monthly' check (frequency in ('daily', 'weekly', 'monthly', 'yearly')),
  end_date date,
  installment_total integer check (installment_total is null or installment_total > 0),
  installment_paid integer not null default 0 check (installment_paid >= 0),
  active boolean not null default true,
  created_at timestamptz default now()
);

alter table transactions
  drop constraint if exists transactions_recurring_rule_id_fkey,
  add constraint transactions_recurring_rule_id_fkey
    foreign key (recurring_rule_id) references recurring_rules(id) on delete set null;

create index if not exists recurring_rules_user_id_idx on recurring_rules(user_id);
create index if not exists recurring_rules_next_due_date_idx on recurring_rules(user_id, active, next_due_date);
create unique index if not exists transactions_recurring_due_unique
  on transactions(user_id, recurring_rule_id, recurring_due_date);

alter table recurring_rules enable row level security;

drop policy if exists recurring_rules_owner_access on recurring_rules;
create policy recurring_rules_owner_access on recurring_rules
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
