-- Per-set tracking + workout feedback chips.
--
-- workout_executions.feedback_chips
--   String array of multi-select chip labels the trainee picked at
--   the end of the workout (e.g. {"האימון היה מושלם 💯",
--   "צריך יותר מנוחה 😴"}). NULL on rows from before this column
--   existed.
--
-- exercise_set_logs.completed
--   Boolean toggle the trainee taps to mark a single set done. Was
--   previously inferred from the row's existence; now stored
--   explicitly so partial logs (typed reps but not done) are
--   distinguishable from completed sets.

ALTER TABLE public.workout_executions
  ADD COLUMN IF NOT EXISTS feedback_chips TEXT[];

COMMENT ON COLUMN public.workout_executions.feedback_chips IS
  'Multi-select chip labels picked at workout end (free-form Hebrew labels with emojis).';

ALTER TABLE public.exercise_set_logs
  ADD COLUMN IF NOT EXISTS completed BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.exercise_set_logs.completed IS
  'Trainee marked this set as completed. Distinct from row existence — partial logs (typed reps, not yet ticked) are completed=false.';
