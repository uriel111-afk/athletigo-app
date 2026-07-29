-- 2026-07-29 — Training-plan redesign, data layer.
--
-- 1. exercises.source_exercise_id
--    Links a duplicated exercise back to the exercise it was copied
--    from in the ALPHA (root) plan. duplicatePlan() sets it to the
--    source's own source_exercise_id when that is populated, else to
--    the source's id — so every copy in a family points at the same
--    root exercise however deep the chain of copies goes
--    (alpha -> copy A -> copy B all resolve to the alpha exercise id).
--    Nullable: exercises created directly in a plan have no source.
--
-- 2. workout_executions.ended_at
--    Workout end time. executed_at already holds the START; ended_at
--    is written when the trainee finishes the workout.
--
-- 3. Index on exercises.source_exercise_id
--    Supports "show me every copy of this exercise across the family",
--    which is the read the redesign is built around.
--
-- Idempotent — safe to re-run.

ALTER TABLE public.exercises
  ADD COLUMN IF NOT EXISTS source_exercise_id UUID NULL;

COMMENT ON COLUMN public.exercises.source_exercise_id IS
  'Root exercise this row was duplicated from (alpha plan). NULL for originals. Always points at the family root, never at an intermediate copy.';

ALTER TABLE public.workout_executions
  ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.workout_executions.ended_at IS
  'Workout end time. executed_at holds the start; ended_at is set when the workout is finished. NULL while in progress.';

CREATE INDEX IF NOT EXISTS idx_exercises_source_exercise_id
  ON public.exercises (source_exercise_id)
  WHERE source_exercise_id IS NOT NULL;
