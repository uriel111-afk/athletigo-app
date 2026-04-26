-- ═══════════════════════════════════════════════════════════════════
-- Onboarding optional profile fields
-- ═══════════════════════════════════════════════════════════════════
-- Three new columns surfaced on the onboarding form's "פרטים
-- נוספים (אופציונלי)" section. The other optional fields the
-- spec listed already exist on `users`:
--   fitness_experience → uses existing fitness_level column
--   injuries           → uses existing medical_history column
--   training_goals     → uses existing training_goals (array)
-- so this migration only adds what's truly new.
--
-- Safe to re-run — every column uses ADD COLUMN IF NOT EXISTS.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS height_cm        INTEGER,
  ADD COLUMN IF NOT EXISTS weight_kg        DECIMAL,
  ADD COLUMN IF NOT EXISTS referral_source  TEXT;
