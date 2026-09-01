create table wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  type text not null default 'cash' check (type in ('cash', 'bank', 'card', 'e_wallet', 'investment', 'other')),
  balance numeric not null default 0,
  currency text not null default 'IDR' check (currency in ('USD', 'IDR', 'TWD', 'EUR', 'JPY')),
  cash_role text check (cash_role in ('notes', 'coins', 'mixed', 'digital_cash')),
  default_change_wallet_id uuid references wallets(id) on delete set null,
  monthly_limit numeric not null default 0,
  created_at timestamptz default now()
);

create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  description text not null,
  amount numeric not null check (amount >= 0),
  original_amount numeric not null default 0 check (original_amount >= 0),
  original_currency text not null default 'IDR' check (original_currency in ('USD', 'IDR', 'TWD', 'EUR', 'JPY')),
  type text not null check (type in ('income', 'expense', 'recurring', 'transfer')),
  category text not null,
  wallet_id uuid references wallets(id) on delete set null,
  transfer_wallet_id uuid references wallets(id) on delete set null,
  recurring_rule_id uuid,
  recurring_due_date date,
  date date not null default current_date,
  needs_review boolean not null default false,
  is_system_generated boolean not null default false,
  linked_transaction_id uuid,
  cash_tendered numeric check (cash_tendered is null or cash_tendered >= 0),
  created_at timestamptz default now()
);

create table recurring_rules (
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
  add constraint transactions_recurring_rule_id_fkey
    foreign key (recurring_rule_id) references recurring_rules(id) on delete set null;

create table budget_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  yearly_allocated numeric not null default 0 check (yearly_allocated >= 0),
  budget_period text not null default 'yearly' check (budget_period in ('monthly', 'yearly')),
  color text not null default '#6C63FF',
  icon text,
  created_at timestamptz default now()
);

create table budget_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  category text not null,
  rule_type text not null check (rule_type in ('cap', 'minimum', 'flexible', 'emergency_months')),
  value numeric not null check (value >= 0),
  created_at timestamptz default now()
);

create unique index wallets_user_name_key on wallets(user_id, lower(name));
create unique index budget_categories_user_name_key on budget_categories(user_id, lower(name));
create unique index transactions_recurring_due_unique on transactions(user_id, recurring_rule_id, recurring_due_date);

create table investment_config (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  monthly_contribution numeric not null default 0 check (monthly_contribution >= 0),
  contribution_currency text not null default 'IDR' check (contribution_currency in ('USD', 'IDR', 'TWD', 'EUR', 'JPY')),
  contribution_frequency text,
  target_portfolio numeric not null default 0 check (target_portfolio >= 0),
  target_currency text not null default 'IDR' check (target_currency in ('USD', 'IDR', 'TWD', 'EUR', 'JPY')),
  return_rate numeric not null default 0 check (return_rate >= 0),
  duration_years integer not null default 0 check (duration_years >= 0),
  current_value numeric not null default 0 check (current_value >= 0),
  inflation_rate numeric not null default 0,
  lump_sum numeric not null default 0,
  allocations jsonb not null default '[]'::jsonb,
  created_at timestamptz default now()
);

create table estimation_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  month integer not null check (month between 1 and 12),
  year integer not null,
  estimated_income numeric not null default 0 check (estimated_income >= 0),
  fixed_expenses numeric not null default 0 check (fixed_expenses >= 0),
  variable_estimate numeric not null default 0 check (variable_estimate >= 0),
  currency text not null default 'USD' check (currency in ('USD', 'IDR', 'TWD', 'EUR', 'JPY')),
  notes text,
  created_at timestamptz default now()
);

create table app_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  user_name text not null default '',
  email text not null default '',
  theme text not null default 'dark',
  currency text not null default 'IDR' check (currency in ('USD', 'IDR', 'TWD', 'EUR', 'JPY')),
  base_currency text not null default 'IDR' check (base_currency in ('USD', 'IDR', 'TWD', 'EUR', 'JPY')),
  year_start text not null default '',
  default_view text not null default '',
  notifications text not null default '',
  annual_goal_label text not null default '',
  annual_goal_pct integer not null default 0 check (annual_goal_pct between 0 and 100),
  created_at timestamptz default now()
);

create unique index investment_config_user_key on investment_config(user_id);
create unique index app_settings_user_key on app_settings(user_id);
create unique index estimation_plans_user_month_year_key on estimation_plans(user_id, month, year);

create table goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  target_amount numeric not null,
  current_amount numeric not null default 0,
  deadline date,
  color text not null default '#6C63FF',
  category text not null default 'General',
  notes text,
  created_at timestamptz default now()
);

create table holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  ticker text not null default '',
  asset_type text not null check (asset_type in ('stock', 'crypto', 'etf', 'bond', 'other')),
  quantity numeric not null check (quantity >= 0),
  buy_price numeric not null check (buy_price >= 0),
  buy_date date not null default current_date,
  currency text not null default 'USD' check (currency in ('USD', 'IDR', 'TWD', 'EUR', 'JPY')),
  current_price numeric,
  created_at timestamptz not null default now()
);

create table dividend_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  holding_id uuid not null references holdings(id) on delete cascade,
  amount numeric not null check (amount >= 0),
  date date not null default current_date,
  created_at timestamptz not null default now()
);
