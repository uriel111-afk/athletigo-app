-- Adds the columns the plan header (UnifiedPlanBuilder) tries to
-- render which were never persisted on training_plans. PlanBuilder
-- already writes weekly_days successfully, which strongly suggests
-- that column exists; the IF NOT EXISTS guard makes it safe regardless.
--
-- difficulty_level and duration_weeks are NOT currently written by
-- any persistence path — the writers in PlanBuilder.jsx and
-- TrainingPlans.jsx do not include them. After applying this
-- migration, those writers should also be extended to set them when
-- the coach picks values in the form.

ALTER TABLE public.training_plans
  ADD COLUMN IF NOT EXISTS weekly_days TEXT[],
  ADD COLUMN IF NOT EXISTS difficulty_level TEXT,
  ADD COLUMN IF NOT EXISTS duration_weeks INTEGER;

COMMENT ON COLUMN public.training_plans.weekly_days IS
  'Days the plan should be performed. Same shape as users.weekly_days, e.g. {sun,mon,wed}.';
COMMENT ON COLUMN public.training_plans.difficulty_level IS
  'Coach-set difficulty label, e.g. "מתחיל" / "בינוני" / "מתקדם".';
COMMENT ON COLUMN public.training_plans.duration_weeks IS
  'Plan length in weeks (positive integer); NULL when unspecified.';
