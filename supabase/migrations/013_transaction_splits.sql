-- Migration 013: Transaction splitting — category splits & multi-wallet payments

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS split_portions jsonb,
ADD COLUMN IF NOT EXISTS wallet_splits jsonb;
