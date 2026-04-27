-- ═══════════════════════════════════════════════════════════════════
-- Emergency contact relation
-- ═══════════════════════════════════════════════════════════════════
-- Trainee profile's emergency-contact card now exposes a relation
-- field (parent / spouse / sibling / friend / other) alongside the
-- existing name + phone. The select uses Hebrew labels in the UI;
-- the column is plain TEXT so no enum migration is needed.
--
-- Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS emergency_contact_relation TEXT;
