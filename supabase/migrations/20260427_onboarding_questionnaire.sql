-- ═══════════════════════════════════════════════════════════════════
-- Onboarding intake questionnaire — column additions
-- ═══════════════════════════════════════════════════════════════════
-- Backs the new OnboardingQuestionnaire component (4-screen wizard:
-- goal / fitness background / challenges + preferences / free text).
-- Together with 20260427_users_optional_profile.sql (height_cm,
-- weight_kg, referral_source) this completes the data shape the
-- intake flow writes.
--
-- Existing columns reused, NOT added by this file:
--   training_goals     — already on users (multi-select goals array)
--   fitness_experience — uses existing fitness_level column
--   onboarding_notes   — already on users (free-text on Step 1)
--   medical_history    — already on users (injury notes)
--
-- Safe to re-run — every column uses ADD COLUMN IF NOT EXISTS.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS preferred_frequency   TEXT,
  ADD COLUMN IF NOT EXISTS current_challenges    JSONB,
  ADD COLUMN IF NOT EXISTS training_preferences  JSONB,
  ADD COLUMN IF NOT EXISTS additional_notes      TEXT;

-- documents.trainee_id — per-trainee scoping for the documents
-- mirror created when a health declaration is signed
-- (HealthDeclarationForm inserts a documents row with this column
-- so the coach can find the signed declaration on the trainee's
-- "מסמכים" tab). Without this column the mirror INSERT would 400.

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS trainee_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_documents_trainee
  ON documents (trainee_id, created_at DESC);
