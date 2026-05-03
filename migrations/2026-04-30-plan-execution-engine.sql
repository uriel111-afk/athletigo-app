-- =====================================================
-- Plan Execution Engine — based on INSPECTION_REPORT_V2
-- Tables: training_plans, training_sections, exercises
-- series_id already exists → used as folder grouping
-- parent_plan_id already exists → used for duplication chains
-- =====================================================

-- 1. New fields on training_plans
ALTER TABLE public.training_plans
  ADD COLUMN IF NOT EXISTS trainee_can_edit BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS best_score NUMERIC(4,2),
  ADD COLUMN IF NOT EXISTS execution_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coach_private_notes TEXT;

COMMENT ON COLUMN public.training_plans.trainee_can_edit IS
  'Coach toggles this to let trainee modify exercises in duplicated plans';
COMMENT ON COLUMN public.training_plans.best_score IS
  'Best total_avg_score across all completed executions';
COMMENT ON COLUMN public.training_plans.execution_count IS
  'Number of completed executions';

-- 2. New fields on training_sections
ALTER TABLE public.training_sections
  ADD COLUMN IF NOT EXISTS color TEXT,
  ADD COLUMN IF NOT EXISTS coach_private_notes TEXT;

COMMENT ON COLUMN public.training_sections.color IS
  'Section color hex. If null, assigned by order index from palette.';

-- 3. New fields on exercises
ALTER TABLE public.exercises
  ADD COLUMN IF NOT EXISTS coach_private_notes TEXT;

-- 4. Workout executions — one row per attempt
CREATE TABLE IF NOT EXISTS public.workout_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.training_plans(id) ON DELETE CASCADE,
  trainee_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  series_id TEXT,

  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'completed', 'abandoned')),

  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  abandoned_at TIMESTAMPTZ,

  total_avg_score NUMERIC(4,2),
  total_exercises INTEGER DEFAULT 0,
  completed_exercises INTEGER DEFAULT 0,

  trainee_feedback TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workout_exec_trainee_plan
  ON public.workout_executions(trainee_id, plan_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workout_exec_series
  ON public.workout_executions(series_id, completed_at DESC);

CREATE INDEX IF NOT EXISTS idx_workout_exec_in_progress
  ON public.workout_executions(trainee_id, status)
  WHERE status = 'in_progress';

-- 5. Section executions — challenge + control rating
CREATE TABLE IF NOT EXISTS public.section_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_execution_id UUID NOT NULL REFERENCES public.workout_executions(id) ON DELETE CASCADE,
  section_id UUID NOT NULL,

  challenge_score INTEGER CHECK (challenge_score BETWEEN 1 AND 10),
  control_score INTEGER CHECK (control_score BETWEEN 1 AND 10),
  avg_score NUMERIC(4,2),

  completed_at TIMESTAMPTZ,

  UNIQUE (workout_execution_id, section_id)
);

CREATE INDEX IF NOT EXISTS idx_section_exec_workout
  ON public.section_executions(workout_execution_id);

-- 6. Exercise executions — checkbox + note
CREATE TABLE IF NOT EXISTS public.exercise_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_execution_id UUID NOT NULL REFERENCES public.workout_executions(id) ON DELETE CASCADE,
  section_id UUID NOT NULL,
  exercise_id UUID NOT NULL,

  is_completed BOOLEAN NOT NULL DEFAULT false,
  trainee_note TEXT,
  completed_at TIMESTAMPTZ,

  UNIQUE (workout_execution_id, exercise_id)
);

CREATE INDEX IF NOT EXISTS idx_exercise_exec_workout
  ON public.exercise_executions(workout_execution_id);

-- 7. Composite indexes on existing tables for long-term performance
CREATE INDEX IF NOT EXISTS idx_training_sections_plan
  ON public.training_sections(training_plan_id, "order");

CREATE INDEX IF NOT EXISTS idx_exercises_section
  ON public.exercises(training_section_id, "order");

CREATE INDEX IF NOT EXISTS idx_training_plans_series
  ON public.training_plans(series_id)
  WHERE series_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_training_plans_parent
  ON public.training_plans(parent_plan_id)
  WHERE parent_plan_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_training_plans_assigned
  ON public.training_plans(assigned_to, status);
