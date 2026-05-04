-- Per-set 1-10 difficulty rating. Captured immediately after the
-- trainee marks a set done via inline buttons in ExerciseCard, and
-- persisted alongside reps_completed / completed in
-- exercise_set_logs at workout-finish time.

ALTER TABLE public.exercise_set_logs
  ADD COLUMN IF NOT EXISTS difficulty_rating INTEGER;

COMMENT ON COLUMN public.exercise_set_logs.difficulty_rating IS
  '1..10 self-reported difficulty for this single set. NULL when the trainee skipped the rating prompt.';
