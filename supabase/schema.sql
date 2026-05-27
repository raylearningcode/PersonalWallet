create table wallets (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  type text not null default 'cash' check (type in ('cash', 'bank', 'card', 'e_wallet', 'investment', 'other')),
  balance numeric not null default 0,
  currency text not null default 'IDR' check (currency in ('USD', 'IDR', 'TWD', 'EUR', 'JPY')),
  created_at timestamptz default now()
);

create table transactions (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  amount numeric not null check (amount >= 0),
  original_amount numeric not null default 0 check (original_amount >= 0),
  original_currency text not null default 'IDR' check (original_currency in ('USD', 'IDR', 'TWD', 'EUR', 'JPY')),
  type text not null check (type in ('income', 'expense', 'recurring', 'transfer')),
  category text not null,
  wallet_id uuid references wallets(id) on delete set null,
  transfer_wallet_id uuid references wallets(id) on delete set null,
  date date not null default current_date,
  needs_review boolean not null default false,
  created_at timestamptz default now()
);

create table budget_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  yearly_allocated numeric not null default 0 check (yearly_allocated >= 0),
  budget_period text not null default 'yearly' check (budget_period in ('monthly', 'yearly')),
  color text not null default '#6C63FF',
  created_at timestamptz default now()
);

create table budget_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  rule_type text not null check (rule_type in ('cap', 'minimum', 'flexible', 'emergency_months')),
  value numeric not null check (value >= 0),
  created_at timestamptz default now()
);

create table investment_config (
  id uuid primary key default gen_random_uuid(),
  monthly_contribution numeric not null default 0 check (monthly_contribution >= 0),
  contribution_currency text not null default 'IDR' check (contribution_currency in ('USD', 'IDR', 'TWD', 'EUR', 'JPY')),
  target_portfolio numeric not null default 0 check (target_portfolio >= 0),
  target_currency text not null default 'IDR' check (target_currency in ('USD', 'IDR', 'TWD', 'EUR', 'JPY')),
  return_rate numeric not null default 0 check (return_rate >= 0),
  duration_years integer not null default 0 check (duration_years >= 0),
  current_value numeric not null default 0 check (current_value >= 0),
  allocations jsonb not null default '[]'::jsonb,
  created_at timestamptz default now()
);

create table estimation_plans (
  id uuid primary key default gen_random_uuid(),
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
