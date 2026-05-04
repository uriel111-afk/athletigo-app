-- Coach-authored ordering for the parameter summary rows on an
-- exercise. Persisted as a TEXT[] of internal param ids
-- (e.g. {"sets","reps","weight_kg","rpe"}). Drives the order in
-- which:
--   • the summary rows render under the chip grid in
--     ModernExerciseForm
--   • the meta-line segments render on the trainee's ExerciseCard
--
-- NULL or empty array → fall back to the default ALL_PARAMETERS
-- order so legacy rows render unchanged.

ALTER TABLE public.exercises
  ADD COLUMN IF NOT EXISTS param_order TEXT[];

COMMENT ON COLUMN public.exercises.param_order IS
  'Ordered list of param ids (sets, reps, weight_kg, rpe, …) the coach dragged into place. NULL or empty array → default order.';
