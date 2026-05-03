-- Adds start_date to training_plans so coaches can stamp when a plan
-- begins. PlanFormDialog already passes through start_date when
-- creating plans (see TrainingPlans.jsx::createPlanMutation), but the
-- column may not exist on older Supabase projects — IF NOT EXISTS
-- makes this idempotent.

ALTER TABLE public.training_plans
  ADD COLUMN IF NOT EXISTS start_date DATE;

COMMENT ON COLUMN public.training_plans.start_date IS
  'Calendar date the plan is intended to begin. NULL when not set.';
