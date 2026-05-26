insert into transactions (description, amount, type, category, date, needs_review) values
  ('Salary', 3250, 'income', 'Income', '2026-05-01', false),
  ('Rent', 1200, 'expense', 'Housing', '2026-05-01', false),
  ('Groceries', 180, 'expense', 'Food', '2026-05-03', false),
  ('Netflix', 15, 'recurring', 'Entertainment', '2026-05-05', false),
  ('Transport', 65, 'expense', 'Transport', '2026-05-07', false),
  ('Restaurant', 45, 'expense', 'Food', '2026-05-10', true),
  ('Spotify', 10, 'recurring', 'Entertainment', '2026-05-12', false),
  ('ETF Purchase', 430, 'expense', 'Investing', '2026-05-15', false),
  ('Freelance', 800, 'income', 'Income', '2026-05-18', false),
  ('Online Course', 99, 'expense', 'Learning', '2026-05-20', true),
  ('Electricity', 85, 'expense', 'Housing', '2026-05-22', false),
  ('Gas', 55, 'expense', 'Transport', '2026-05-24', true),
  ('Salary', 3250, 'income', 'Income', '2026-04-01', false),
  ('Rent', 1200, 'expense', 'Housing', '2026-04-01', false),
  ('Groceries', 210, 'expense', 'Food', '2026-04-05', false),
  ('Transport', 70, 'expense', 'Transport', '2026-04-08', false),
  ('ETF Purchase', 430, 'expense', 'Investing', '2026-04-15', false),
  ('Salary', 3250, 'income', 'Income', '2026-03-01', false),
  ('Rent', 1200, 'expense', 'Housing', '2026-03-01', false),
  ('Groceries', 160, 'expense', 'Food', '2026-03-04', false),
  ('ETF Purchase', 430, 'expense', 'Investing', '2026-03-15', false);

insert into budget_categories (name, yearly_allocated, color) values
  ('Housing', 8400, '#6C63FF'),
  ('Food', 3600, '#22C55E'),
  ('Transport', 1800, '#F59E0B'),
  ('Learning', 1200, '#3B82F6'),
  ('Entertainment', 600, '#EC4899'),
  ('Investing', 5160, '#8B5CF6'),
  ('Income', 0, '#64748B');

insert into budget_rules (name, category, rule_type, value) values
  ('50% cap', 'Housing', 'cap', 50),
  ('20% minimum', 'Investing', 'minimum', 20),
  ('30% flexible', 'Entertainment', 'flexible', 30),
  ('6 months emergency', 'Housing', 'emergency_months', 6);

insert into investment_config (monthly_contribution, return_rate, duration_years, current_value) values
  (430, 7.0, 7, 3320);

insert into estimation_plans (month, year, estimated_income, fixed_expenses, variable_estimate, currency, notes) values
  (5, 2026, 12800000, 4100000, 3200000, 'IDR', 'May plan'),
  (4, 2026, 12800000, 4100000, 3500000, 'IDR', 'April estimate');

insert into app_settings (user_name, email, theme, currency, year_start, default_view, notifications, annual_goal_label, annual_goal_pct) values
  ('Rayhan Vin', 'raycalendarr@gmail.com', 'dark', 'USD', 'January', 'Dashboard', 'Weekly digest', '$20k net worth', 68);
