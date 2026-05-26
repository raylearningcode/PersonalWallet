create table transactions (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  amount numeric not null,
  type text not null check (type in ('income', 'expense', 'recurring')),
  category text not null,
  date date not null default current_date,
  needs_review boolean not null default false,
  created_at timestamptz default now()
);

create table budget_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  yearly_allocated numeric not null default 0,
  color text not null default '#6C63FF',
  created_at timestamptz default now()
);

create table budget_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  rule_type text not null check (rule_type in ('cap', 'minimum', 'flexible', 'emergency_months')),
  value numeric not null,
  created_at timestamptz default now()
);

create table investment_config (
  id uuid primary key default gen_random_uuid(),
  monthly_contribution numeric not null default 430,
  return_rate numeric not null default 7.0,
  duration_years integer not null default 7,
  current_value numeric not null default 3320,
  created_at timestamptz default now()
);

create table estimation_plans (
  id uuid primary key default gen_random_uuid(),
  month integer not null check (month between 1 and 12),
  year integer not null,
  estimated_income numeric not null default 0,
  fixed_expenses numeric not null default 0,
  variable_estimate numeric not null default 0,
  currency text not null default 'USD',
  notes text,
  created_at timestamptz default now()
);

create table app_settings (
  id uuid primary key default gen_random_uuid(),
  user_name text not null default 'Rayhan',
  email text not null default 'raycalendarr@gmail.com',
  theme text not null default 'dark',
  currency text not null default 'USD',
  year_start text not null default 'January',
  default_view text not null default 'Dashboard',
  notifications text not null default 'Weekly digest',
  annual_goal_label text not null default '$20k net worth',
  annual_goal_pct integer not null default 68,
  created_at timestamptz default now()
);
