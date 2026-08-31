-- Migration 016: Security hardening — goals DDL/RLS + close cross-tenant read hole
--
-- 1. The goals table exists in the live database but was never committed to this
--    repo. Create it if absent so the schema is reproducible, and give it owner RLS.
-- 2. Several owner policies allowed `user_id IS NULL` rows to be read by ANY
--    authenticated user (cross-tenant leak). Guest data lives in localStorage and
--    is migrated by INSERT with the new owner's user_id — nothing reads cloud
--    null-user rows — so the null clause is dropped. Any pre-existing null-user
--    rows become unreachable; they are unowned and were never addressable by the
--    owner anyway.

-- 1. Goals table ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_amount NUMERIC NOT NULL,
  current_amount NUMERIC NOT NULL DEFAULT 0,
  deadline DATE,
  color TEXT NOT NULL DEFAULT '#6c63ff',
  category TEXT NOT NULL DEFAULT 'General',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS goals_user_id_idx ON goals(user_id);

ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS goals_owner_access ON goals;
CREATE POLICY goals_owner_access ON goals
  FOR ALL TO authenticated USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 2. Drop null-read clauses from migration 010 policies ------------------------

DROP POLICY IF EXISTS wallets_owner_access ON wallets;
CREATE POLICY wallets_owner_access ON wallets
  FOR ALL TO authenticated USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS transactions_owner_access ON transactions;
CREATE POLICY transactions_owner_access ON transactions
  FOR ALL TO authenticated USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS budget_categories_owner_access ON budget_categories;
CREATE POLICY budget_categories_owner_access ON budget_categories
  FOR ALL TO authenticated USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS budget_rules_owner_access ON budget_rules;
CREATE POLICY budget_rules_owner_access ON budget_rules
  FOR ALL TO authenticated USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS investment_config_owner_access ON investment_config;
CREATE POLICY investment_config_owner_access ON investment_config
  FOR ALL TO authenticated USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS estimation_plans_owner_access ON estimation_plans;
CREATE POLICY estimation_plans_owner_access ON estimation_plans
  FOR ALL TO authenticated USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS app_settings_owner_access ON app_settings;
CREATE POLICY app_settings_owner_access ON app_settings
  FOR ALL TO authenticated USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 3. Drop null-read clauses from migration 012 policies ------------------------

DROP POLICY IF EXISTS "Users can read own holdings" ON holdings;
CREATE POLICY "Users can read own holdings" ON holdings
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can read own dividend logs" ON dividend_logs;
CREATE POLICY "Users can read own dividend logs" ON dividend_logs
  FOR SELECT USING (user_id = auth.uid());
