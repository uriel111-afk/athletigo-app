-- Migration: Baselines system
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS baselines (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  trainee_id uuid REFERENCES users(id),
  coach_id uuid REFERENCES users(id),
  date date NOT NULL,
  time time,
  technique text NOT NULL,
  work_time_seconds integer NOT NULL,
  rest_time_seconds integer NOT NULL,
  rounds_count integer NOT NULL,
  rounds_data jsonb,
  total_jumps integer,
  average_jumps numeric(10,2),
  baseline_score numeric(10,2),
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_baselines_trainee ON baselines(trainee_id);
CREATE INDEX IF NOT EXISTS idx_baselines_date ON baselines(date);

-- Enable RLS
ALTER TABLE baselines ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated users (same pattern as other tables)
CREATE POLICY "baselines_all" ON baselines FOR ALL USING (true) WITH CHECK (true);

-- Add baseline reference to results_log
ALTER TABLE results_log ADD COLUMN IF NOT EXISTS baseline_id uuid REFERENCES baselines(id);
ALTER TABLE results_log ADD COLUMN IF NOT EXISTS category text;

CREATE INDEX IF NOT EXISTS idx_results_baseline ON results_log(baseline_id);
CREATE INDEX IF NOT EXISTS idx_results_category ON results_log(category);
