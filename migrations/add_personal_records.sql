-- Personal records table for ad-hoc tracking beyond baselines
-- Review before running in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS personal_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainee_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  coach_id uuid REFERENCES auth.users(id),
  name text NOT NULL,
  unit text,
  value numeric NOT NULL,
  recorded_at date DEFAULT CURRENT_DATE,
  note text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pr_trainee_name
  ON personal_records (trainee_id, name, recorded_at DESC);

ALTER TABLE personal_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_manage_own_prs" ON personal_records
  FOR ALL
  USING (coach_id = auth.uid() OR trainee_id = auth.uid())
  WITH CHECK (coach_id = auth.uid() OR trainee_id = auth.uid());

-- Add avg_value and max_value to baselines if not already present
ALTER TABLE baselines ADD COLUMN IF NOT EXISTS avg_value numeric;
ALTER TABLE baselines ADD COLUMN IF NOT EXISTS max_value numeric;

-- Index for baseline history queries
CREATE INDEX IF NOT EXISTS idx_baselines_trainee_technique
  ON baselines (trainee_id, technique, created_at DESC);
