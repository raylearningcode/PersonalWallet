ALTER TABLE budget_categories
ADD COLUMN IF NOT EXISTS budget_period text NOT NULL DEFAULT 'yearly'
CHECK (budget_period IN ('monthly', 'yearly'));
