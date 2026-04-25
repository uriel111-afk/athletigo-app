-- ═══════════════════════════════════════════════════════════════════
-- Extend trainee_permissions with finer-grained training perms
-- ═══════════════════════════════════════════════════════════════════
-- Adds three new toggles the coach can flip per trainee:
--   view_training_plan — gates MyPlan + MyWorkoutLog screens
--   view_records       — gates Progress (records/results)
--
-- Defaults to TRUE so flipping the migration on doesn't suddenly hide
-- screens from existing trainees. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE trainee_permissions
  ADD COLUMN IF NOT EXISTS view_training_plan BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS view_records       BOOLEAN NOT NULL DEFAULT TRUE;
