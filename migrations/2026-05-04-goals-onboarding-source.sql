-- Adds the columns the onboarding goal-seeder writes to.
--
-- Existing schema (do NOT touch):
--   trainee_id        UUID
--   exercise_name     TEXT  (added by 2026-04-29-goals-extension.sql)
--   exercise_type     TEXT  (added by 2026-04-29-goals-extension.sql)
--   target_value      TEXT
--   current_value     TEXT
--   starting_value    NUMERIC
--   status            TEXT  ('פעיל' / 'הושג' / 'בוטל')
--   created_at, updated_at, completed_at  TIMESTAMPTZ
--
-- New columns for onboarding-derived goals (general / non-exercise-tied):
--   source        — 'manual' (default, coach-created) or 'onboarding'
--                   (auto-seeded from users.training_goals at the end of
--                   the wizard). Lets the seeder skip itself on re-runs
--                   and lets the UI badge auto-created goals if it wants.
--   title         — display label for non-exercise goals. exercise_name
--                   stays the source of truth for exercise-tied goals;
--                   title is what the יעדים tab shows when no exercise
--                   is linked.
--   description   — free-text rationale or coach note attached to the
--                   goal. Onboarding seed writes a fixed Hebrew string.
--   progress      — 0..100 percentage. Onboarding seeds at 0; the goal
--                   detail view writes back as the trainee logs records.

ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';

ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS title TEXT;

ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS progress NUMERIC(5,2) DEFAULT 0;

COMMENT ON COLUMN public.goals.source IS
  'Origin of the goal row: ''manual'' (coach), ''onboarding'' (auto-seeded), etc.';
COMMENT ON COLUMN public.goals.title IS
  'Display title for non-exercise goals (where exercise_name is null).';
COMMENT ON COLUMN public.goals.description IS
  'Free-text description / rationale for the goal.';
COMMENT ON COLUMN public.goals.progress IS
  'Self-reported 0..100 progress percentage. Used by the יעדים tab progress bar.';

-- Helper index for the onboarding-seed idempotency check
-- (SELECT id FROM goals WHERE trainee_id = :id AND source = 'onboarding' LIMIT 1).
CREATE INDEX IF NOT EXISTS idx_goals_trainee_source
  ON public.goals (trainee_id, source);
