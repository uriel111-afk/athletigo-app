-- =====================================================
-- AthletiGo Long-Term Infrastructure
-- Designed for 100,000+ records per trainee over decades
-- =====================================================

-- 1. Composite indexes on all major tables
-- These ensure fast queries even with massive data

CREATE INDEX IF NOT EXISTS idx_records_trainee_exercise_date
  ON public.records(trainee_id, exercise_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_records_trainee_date
  ON public.records(trainee_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sessions_trainee_date
  ON public.sessions(trainee_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_sessions_coach_date
  ON public.sessions(coach_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_training_plans_trainee
  ON public.training_plans(trainee_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_goals_trainee_exercise
  ON public.goals(trainee_id, exercise_name, status);

CREATE INDEX IF NOT EXISTS idx_measurements_trainee_date
  ON public.measurements(trainee_id, created_at DESC);

-- 2. Records enrichment — context fields for long-term value

ALTER TABLE public.records
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS variant TEXT,
  ADD COLUMN IF NOT EXISTS conditions TEXT,
  ADD COLUMN IF NOT EXISTS period_id UUID;

COMMENT ON COLUMN public.records.tags IS
  'Freeform tags: ["morning","post-injury","competition"]';
COMMENT ON COLUMN public.records.variant IS
  'Exercise variant: "strict pull-up" vs "kipping" vs "weighted +10kg"';
COMMENT ON COLUMN public.records.conditions IS
  'Context: "after bad sleep", "post-travel", "fasted"';
COMMENT ON COLUMN public.records.period_id IS
  'FK to life_periods table for long-term segmentation';

-- 3. Life periods — segmenting years of training

CREATE TABLE IF NOT EXISTS public.life_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trainee_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  color TEXT DEFAULT '#FF6F20',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_life_periods_trainee
  ON public.life_periods(trainee_id, start_date);

COMMENT ON TABLE public.life_periods IS
  'Life phases for segmenting decades of training: pre-injury, post-baby, competition season, etc.';

-- 4. Weekly summaries — pre-aggregated for fast charts

CREATE TABLE IF NOT EXISTS public.weekly_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trainee_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  exercise_name TEXT NOT NULL,
  week_start DATE NOT NULL,
  record_count INTEGER NOT NULL DEFAULT 0,
  avg_value NUMERIC(10,2),
  max_value NUMERIC(10,2),
  min_value NUMERIC(10,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(trainee_id, exercise_name, week_start)
);

CREATE INDEX IF NOT EXISTS idx_weekly_summaries_trainee_exercise
  ON public.weekly_summaries(trainee_id, exercise_name, week_start DESC);

-- 5. Monthly summaries — for year+ views

CREATE TABLE IF NOT EXISTS public.monthly_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trainee_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  exercise_name TEXT NOT NULL,
  month_start DATE NOT NULL,
  record_count INTEGER NOT NULL DEFAULT 0,
  avg_value NUMERIC(10,2),
  max_value NUMERIC(10,2),
  min_value NUMERIC(10,2),
  best_record_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(trainee_id, exercise_name, month_start)
);

CREATE INDEX IF NOT EXISTS idx_monthly_summaries_trainee_exercise
  ON public.monthly_summaries(trainee_id, exercise_name, month_start DESC);

-- 6. All-time personal bests (denormalized for instant access)

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS all_time_pbs JSONB DEFAULT '{}';

COMMENT ON COLUMN public.users.all_time_pbs IS
  'Denormalized map: {"pull-ups": {"value": 18, "date": "2028-03-15"}, ...}. Updated on every new record.';
