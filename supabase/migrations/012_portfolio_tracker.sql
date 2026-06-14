-- Migration 012: Portfolio tracker — holdings, dividend logs, and enhanced investment config

-- Holdings table (real portfolio tracking)
CREATE TABLE IF NOT EXISTS holdings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  ticker TEXT NOT NULL DEFAULT '',
  asset_type TEXT NOT NULL CHECK (asset_type IN ('stock', 'crypto', 'etf', 'bond', 'other')),
  quantity NUMERIC NOT NULL CHECK (quantity >= 0),
  buy_price NUMERIC NOT NULL CHECK (buy_price >= 0),
  buy_date DATE NOT NULL DEFAULT CURRENT_DATE,
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD', 'IDR', 'TWD', 'EUR', 'JPY')),
  current_price NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Dividend logs
CREATE TABLE IF NOT EXISTS dividend_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  holding_id UUID NOT NULL REFERENCES holdings(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL CHECK (amount >= 0),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enhanced investment_config with inflation and lump sum
ALTER TABLE investment_config
ADD COLUMN IF NOT EXISTS inflation_rate NUMERIC NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS lump_sum NUMERIC NOT NULL DEFAULT 0;

-- RLS for holdings
ALTER TABLE holdings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own holdings" ON holdings
  FOR SELECT USING (user_id = auth.uid() OR user_id IS NULL);
CREATE POLICY "Users can insert own holdings" ON holdings
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own holdings" ON holdings
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own holdings" ON holdings
  FOR DELETE USING (user_id = auth.uid());

-- RLS for dividend_logs
ALTER TABLE dividend_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own dividend logs" ON dividend_logs
  FOR SELECT USING (user_id = auth.uid() OR user_id IS NULL);
CREATE POLICY "Users can insert own dividend logs" ON dividend_logs
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own dividend logs" ON dividend_logs
  FOR DELETE USING (user_id = auth.uid());

-- Indexes
CREATE INDEX IF NOT EXISTS idx_holdings_user ON holdings(user_id);
CREATE INDEX IF NOT EXISTS idx_dividend_logs_user ON dividend_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_dividend_logs_holding ON dividend_logs(holding_id);
