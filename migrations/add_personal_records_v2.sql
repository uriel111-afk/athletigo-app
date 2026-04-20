-- Personal records table for tracking PRs beyond baselines
-- Review before running in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS personal_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainee_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  coach_id uuid REFERENCES auth.users(id),
  record_type text NOT NULL,
  name text NOT NULL,
  unit text NOT NULL,
  value numeric NOT NULL,
  date date DEFAULT CURRENT_DATE,
  notes text,
  created_by_role text CHECK (created_by_role IN ('coach','trainee')) NOT NULL,
  created_by_user_id uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pr_trainee_date
  ON personal_records (trainee_id, record_type, date DESC);

ALTER TABLE personal_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coach_manage_records" ON personal_records
  FOR ALL USING (auth.uid() = coach_id)
  WITH CHECK (auth.uid() = coach_id);

CREATE POLICY "trainee_view_own" ON personal_records
  FOR SELECT USING (auth.uid() = trainee_id);

CREATE POLICY "trainee_insert_own" ON personal_records
  FOR INSERT WITH CHECK (auth.uid() = trainee_id AND created_by_role = 'trainee');
