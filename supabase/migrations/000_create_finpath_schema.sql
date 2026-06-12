CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  description text NOT NULL,
  amount numeric NOT NULL,
  type text NOT NULL CHECK (type IN ('income', 'expense', 'recurring')),
  category text NOT NULL,
  date date NOT NULL DEFAULT current_date,
  needs_review boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS budget_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  yearly_allocated numeric NOT NULL DEFAULT 0,
  budget_period text NOT NULL DEFAULT 'yearly' CHECK (budget_period IN ('monthly', 'yearly')),
  color text NOT NULL DEFAULT '#6C63FF',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS budget_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL,
  rule_type text NOT NULL CHECK (rule_type IN ('cap', 'minimum', 'flexible', 'emergency_months')),
  value numeric NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS investment_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monthly_contribution numeric NOT NULL DEFAULT 0,
  return_rate numeric NOT NULL DEFAULT 0,
  duration_years integer NOT NULL DEFAULT 0,
  current_value numeric NOT NULL DEFAULT 0,
  allocations jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS estimation_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  year integer NOT NULL,
  estimated_income numeric NOT NULL DEFAULT 0,
  fixed_expenses numeric NOT NULL DEFAULT 0,
  variable_estimate numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  theme text NOT NULL DEFAULT 'dark',
  currency text NOT NULL DEFAULT 'IDR',
  base_currency text NOT NULL DEFAULT 'IDR',
  year_start text NOT NULL DEFAULT '',
  default_view text NOT NULL DEFAULT '',
  notifications text NOT NULL DEFAULT '',
  annual_goal_label text NOT NULL DEFAULT '',
  annual_goal_pct integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
