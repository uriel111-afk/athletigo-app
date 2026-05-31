-- ═══════════════════════════════════════════════════════════════════
-- Add recurring schedule fields to the expenses table
-- ═══════════════════════════════════════════════════════════════════
-- Existing columns on `expenses` already include:
--   is_recurring BOOLEAN DEFAULT false
--   recurring_id UUID
--
-- These two new columns describe HOW often a recurring expense should
-- repeat, and WHEN it should stop. Both are nullable and meaningful
-- only when is_recurring = true.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS recurring_frequency TEXT,
  ADD COLUMN IF NOT EXISTS recurring_until DATE;

COMMENT ON COLUMN expenses.recurring_frequency IS
  'monthly | weekly | yearly — only meaningful when is_recurring = true';

COMMENT ON COLUMN expenses.recurring_until IS
  'Last date the recurring entry should generate occurrences (NULL = no end)';

-- Existing RLS policies on expenses (created by the original
-- life_os_schema migration) already cover all columns implicitly, so
-- no additional policy changes are needed.
