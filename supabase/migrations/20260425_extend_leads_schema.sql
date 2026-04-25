-- ═══════════════════════════════════════════════════════════════════
-- Extend the existing `leads` table with Life OS columns
-- ═══════════════════════════════════════════════════════════════════
-- The legacy schema (from the original coach app) uses:
--   coach_id, full_name, coach_notes
-- The Wave-2 Life OS code expected new columns that the
-- 20260424_life_os_schema.sql CREATE TABLE IF NOT EXISTS skipped
-- because the table already existed.
--
-- This migration is purely additive — every column uses ADD COLUMN
-- IF NOT EXISTS so it's safe to re-run and never touches the legacy
-- columns coach views still rely on.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS interested_in        TEXT,
  ADD COLUMN IF NOT EXISTS last_contact_date    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_follow_up       DATE,
  ADD COLUMN IF NOT EXISTS revenue_if_converted DECIMAL,
  ADD COLUMN IF NOT EXISTS converted_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notes                TEXT;

-- Index used by the growth dashboard's overdue-leads query.
CREATE INDEX IF NOT EXISTS idx_leads_status_followup
  ON leads (coach_id, status, last_contact_date);
