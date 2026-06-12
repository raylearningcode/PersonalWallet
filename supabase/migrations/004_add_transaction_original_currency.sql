ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS original_amount numeric NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS original_currency text NOT NULL DEFAULT 'IDR';

UPDATE transactions
SET original_amount = amount
WHERE original_amount = 0;
