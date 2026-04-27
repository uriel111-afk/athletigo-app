-- ═══════════════════════════════════════════════════════════════════
-- Free-text expansions on questionnaire screens 1 & 3
-- Plus alias columns for installs that prefer the alternate names.
-- ═══════════════════════════════════════════════════════════════════
-- After the trainee picks chips on the challenges / preferences
-- screen, an optional textarea lets them explain in their own
-- words. Same pattern that goals_description already follows on
-- screen 1.
--
-- The alias columns (fitness_experience, fitness_background) are
-- written alongside the existing fitness_level / sport_background
-- so coaches can read either canonical name without breaking
-- against installs that drift between the two.
--
-- Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS challenges_description  TEXT,
  ADD COLUMN IF NOT EXISTS preferences_description TEXT,
  ADD COLUMN IF NOT EXISTS fitness_experience      TEXT,
  ADD COLUMN IF NOT EXISTS fitness_background      TEXT;
