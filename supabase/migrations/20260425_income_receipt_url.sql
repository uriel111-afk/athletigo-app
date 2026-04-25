-- Add receipt_url column to income for SmartCamera attachment
-- (mirrors the existing column on expenses).
ALTER TABLE income ADD COLUMN IF NOT EXISTS receipt_url TEXT;
