-- exercise_set_logs: per-set captures for the new "אימונים" execution flow.
-- One row per (execution, exercise, set_number). reps/time/weight are mutually
-- meaningful: the writer fills the field that matches the exercise's mode.

CREATE TABLE IF NOT EXISTS exercise_set_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID NOT NULL REFERENCES workout_executions(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL,
  set_number INTEGER NOT NULL,
  reps_completed INTEGER,
  time_completed INTEGER,
  weight_used NUMERIC(6,2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Required for the upsert path used by saveSetLog().
CREATE UNIQUE INDEX IF NOT EXISTS exercise_set_logs_unique
  ON exercise_set_logs(execution_id, exercise_id, set_number);

CREATE INDEX IF NOT EXISTS exercise_set_logs_execution_idx
  ON exercise_set_logs(execution_id);

ALTER TABLE exercise_set_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trainee_own ON exercise_set_logs;
CREATE POLICY trainee_own ON exercise_set_logs
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM workout_executions we
      WHERE we.id = exercise_set_logs.execution_id
        AND we.trainee_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS coach_read ON exercise_set_logs;
CREATE POLICY coach_read ON exercise_set_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role IN ('coach','admin')
    )
  );
