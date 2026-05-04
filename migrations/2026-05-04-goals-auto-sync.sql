-- Auto-sync hooks for the goals system. Two new columns on goals
-- so the workout-completion + measurement-save handlers can decide
-- whether (and where) to push updates.

ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS linked_exercise_id UUID,
  ADD COLUMN IF NOT EXISTS auto_update BOOLEAN DEFAULT true;

COMMENT ON COLUMN public.goals.linked_exercise_id IS
  'Optional FK-style link to exercises.id. When set, the workout-finish auto-PR check pushes maxReps into this goal''s current_value/measurements.';
COMMENT ON COLUMN public.goals.auto_update IS
  'Per-goal opt-out for the auto-sync hooks. When false, neither the workout PR check nor the weight-measurement sync writes to this row.';

-- Note: deliberately NOT creating a new "records" table. The existing
-- public.personal_records (from add_personal_records_v2.sql) is the
-- canonical PR store and is already wired into TraineeHome / Progress /
-- TraineeProfile / goalsApi / BaselineFormDialog. The auto-PR check
-- inserts into personal_records, preserving the per-PR history rows
-- those surfaces depend on.
