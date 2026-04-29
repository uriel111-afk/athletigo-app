-- Adds the columns the new goal↔records integration expects on
-- public.goals. Existing columns + Hebrew status values are kept
-- as-is. Run in Supabase SQL Editor.
--
-- Naming notes for future reference:
--   • completed_at  is the existing column we'll use as "achieved_at"
--                   (no new column needed — same semantics).
--   • target_value  is TEXT today; the new code parses it via
--                   parseFloat() instead of forcing a schema change.
--                   target_value stays TEXT to preserve existing rows.
--   • status values stay in Hebrew: 'פעיל' (active default) / 'הושג'
--                   (achieved) / 'בוטל' (cancelled). 'פעיל' is the
--                   default already; the new logic only writes the
--                   other two when a goal is achieved or cancelled.
--   • An exercise can have at most one row with status='פעיל' at a
--                   time; the create-goal flow cancels any prior
--                   active row for the same trainee+exercise before
--                   inserting the new one.

ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS starting_value NUMERIC;
COMMENT ON COLUMN public.goals.starting_value IS
  'PB value at the moment the goal was set — anchor point for the progress bar and the dashed projection line on the records chart.';

ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS exercise_name TEXT;
COMMENT ON COLUMN public.goals.exercise_name IS
  'Links a goal to its corresponding personal_records.name so the chart can overlay the goal''s line on the right exercise.';

ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS exercise_type TEXT;
COMMENT ON COLUMN public.goals.exercise_type IS
  'Optional kind classifier (reps / time / weight / distance) — used for unit handling and the right axis label.';

-- Helper index for the active-per-exercise lookup that runs every
-- time a record is saved (to check if the new value crossed a goal).
CREATE INDEX IF NOT EXISTS idx_goals_trainee_exercise_active
  ON public.goals (trainee_id, exercise_name)
  WHERE status = 'פעיל';
