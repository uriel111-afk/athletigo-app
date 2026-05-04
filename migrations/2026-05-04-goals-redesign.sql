-- Goals system v2 — measurable, trackable goals.
--
-- New columns layered on top of the existing public.goals table.
-- Existing columns (do NOT touch):
--   trainee_id UUID, exercise_name TEXT, exercise_type TEXT,
--   target_value TEXT (legacy — parseFloat in code; the v2 NUMERIC
--     write below is ADD COLUMN IF NOT EXISTS so it'll skip if the
--     legacy TEXT column is still there. If you want to convert
--     existing TEXT values to NUMERIC, uncomment the ALTER below.),
--   current_value TEXT (same caveat as target_value),
--   starting_value NUMERIC, status TEXT, completed_at TIMESTAMPTZ,
--   created_at, updated_at, source TEXT, title TEXT, description TEXT,
--   progress NUMERIC.

ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS goal_type TEXT DEFAULT 'custom',
  ADD COLUMN IF NOT EXISTS target_value NUMERIC,
  ADD COLUMN IF NOT EXISTS current_value NUMERIC,
  ADD COLUMN IF NOT EXISTS start_value NUMERIC,
  ADD COLUMN IF NOT EXISTS unit TEXT,
  ADD COLUMN IF NOT EXISTS linked_plan_id UUID,
  ADD COLUMN IF NOT EXISTS target_date DATE,
  ADD COLUMN IF NOT EXISTS success_definition TEXT,
  ADD COLUMN IF NOT EXISTS measurements JSONB DEFAULT '[]'::JSONB;

COMMENT ON COLUMN public.goals.goal_type IS
  'distance / reps / weight_loss / weight_gain / skill / time / body / custom';
COMMENT ON COLUMN public.goals.measurements IS
  'JSONB array of {date, value, note?} entries. Append-only — push a new row on every measurement save.';
COMMENT ON COLUMN public.goals.success_definition IS
  'Free-text "success looks like…" sentence the trainee writes when creating the goal.';

-- Index for the per-trainee fetch the new GoalsTab issues.
CREATE INDEX IF NOT EXISTS idx_goals_trainee_created
  ON public.goals (trainee_id, created_at DESC);
