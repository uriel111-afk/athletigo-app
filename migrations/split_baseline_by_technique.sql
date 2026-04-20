-- Baseline: ensure per-technique columns exist
-- Review before running in Supabase SQL Editor

ALTER TABLE baselines ADD COLUMN IF NOT EXISTS avg_value numeric;
ALTER TABLE baselines ADD COLUMN IF NOT EXISTS max_value numeric;

-- Index for fast lookup by trainee + technique
CREATE INDEX IF NOT EXISTS idx_baselines_trainee_technique
  ON baselines (trainee_id, technique, created_at DESC);

-- Old rows without technique are assumed to be 'basic' (the default)
-- DO NOT auto-migrate — leave as-is for backwards compatibility
